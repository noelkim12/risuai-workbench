import fs from 'node:fs';
import path from 'node:path';
import {
  ELEMENT_TYPES,
  extractCBSVarOps,
  buildRisuFolderMap,
  resolveRisuFolderName,
  toPosix,
  sanitizeFilename,
} from '@/domain';
import { analyzeLuaSource, type LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import { parseLorebookContent } from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '@/domain/regex';
import { parseVariableContent } from '@/domain/custom-extension/extensions/variable';
import { dirExists, readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { listJsonFilesRecursive, resolveOrderedFiles } from '@/node/json-listing';
import { isPlainObject } from '../../shared';
import { type ElementCBSData, type HtmlResult, type VariablesResult } from './types';

function stripJsonExt(fileName: string): string {
  return fileName.toLowerCase().endsWith('.json') ? fileName.slice(0, -5) : fileName;
}

function getStringField(obj: unknown, key: string): string {
  if (!isPlainObject(obj)) return '';
  const direct = obj[key];
  if (typeof direct === 'string') return direct;
  const data = obj.data;
  if (isPlainObject(data)) {
    const nested = data[key];
    if (typeof nested === 'string') return nested;
  }
  return '';
}

/** 로어북 엔트리에서 CBS 변수 읽기/쓰기 연산을 수집한다. 추출 디렉토리 우선, 없으면 charx.json 직접 파싱한다. */
export function collectLorebookCBS(charx: unknown, outputDir?: string): ElementCBSData[] {
  if (outputDir) {
    const lorebooksDir = path.join(outputDir, 'lorebooks');
    if (dirExists(lorebooksDir)) {
      return collectLorebookCBSFromDir(lorebooksDir);
    }
  }
  return collectLorebookCBSFromCharx(charx);
}

function collectLorebookCBSFromDir(lorebooksDir: string): ElementCBSData[] {
  // First, try canonical .risulorebook files
  const risuFiles = listRisuFilesRecursive(lorebooksDir, '.risulorebook');
  if (risuFiles.length > 0) {
    const files = resolveOrderedFiles(lorebooksDir, risuFiles);
    const results: ElementCBSData[] = [];
    for (const filePath of files) {
      const relPosix = toPosix(path.relative(lorebooksDir, filePath));
      pushLorebookCBSFromRisuFile(results, filePath, relPosix);
    }
    return results;
  }

  // Fallback to legacy manifest.json approach
  const manifestPath = path.join(lorebooksDir, 'manifest.json');
  const manifest = readJsonIfExists(manifestPath);
  if (isPlainObject(manifest) && Array.isArray(manifest.entries)) {
    return collectLorebookCBSFromManifest(lorebooksDir, manifest.entries);
  }

  // Fallback to legacy JSON files
  const files = resolveOrderedFiles(lorebooksDir, listJsonFilesRecursive(lorebooksDir));
  if (files.length === 0) return [];

  const results: ElementCBSData[] = [];
  for (const filePath of files) {
    const relPosix = toPosix(path.relative(lorebooksDir, filePath));
    pushLorebookCBSFromFile(results, filePath, relPosix, null);
  }
  return results;
}

function collectLorebookCBSFromManifest(
  lorebooksDir: string,
  manifestEntries: unknown[],
): ElementCBSData[] {
  const files = listJsonFilesRecursive(lorebooksDir);
  const fileMap = new Map<string, string>();
  for (const filePath of files) {
    const rel = toPosix(path.relative(lorebooksDir, filePath));
    fileMap.set(rel, filePath);
  }

  const usedFiles = new Set<string>();
  const results: ElementCBSData[] = [];

  for (const rec of manifestEntries) {
    if (!isPlainObject(rec)) continue;
    if (rec.type !== 'entry' || typeof rec.path !== 'string' || rec.path.length === 0) continue;

    const rel = toPosix(rec.path);
    const filePath = fileMap.get(rel);
    if (!filePath) continue;

    usedFiles.add(rel);
    pushLorebookCBSFromFile(results, filePath, rel, rec.source === 'module' ? 'module' : null);
  }

  const orphans = [...fileMap.keys()]
    .filter((rel) => !usedFiles.has(rel))
    .sort((a, b) => a.localeCompare(b));
  for (const rel of orphans) {
    const filePath = fileMap.get(rel);
    if (!filePath) continue;
    pushLorebookCBSFromFile(results, filePath, rel, null);
  }

  return results;
}

function pushLorebookCBSFromFile(
  results: ElementCBSData[],
  filePath: string,
  relPosix: string,
  source: 'module' | null,
): void {
  const raw = readJsonIfExists(filePath);
  if (raw == null) return;

  const baseName = stripJsonExt(relPosix);
  const entries = Array.isArray(raw) ? raw : [raw];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!isPlainObject(entry)) continue;

    const mode = typeof entry.mode === 'string' ? entry.mode : getStringField(entry, 'mode');
    if (mode === 'folder') continue;

    const content = getStringField(entry, 'content');
    const { reads, writes } = extractCBSVarOps(content || '');
    if (reads.size === 0 && writes.size === 0) continue;

    const leafName = entries.length > 1 ? `${baseName}#${i}` : baseName;
    const elementName = source === 'module' ? `[module]/${leafName}` : leafName;
    results.push({ elementType: ELEMENT_TYPES.LOREBOOK, elementName, reads, writes });
  }
}

function getCharxArray(charx: unknown, pathKeys: string[]): unknown[] {
  let cur: unknown = charx;
  for (const key of pathKeys) {
    if (!isPlainObject(cur)) return [];
    cur = cur[key];
  }
  return Array.isArray(cur) ? cur : [];
}

function collectLorebookCBSFromCharx(charx: unknown): ElementCBSData[] {
  const results: ElementCBSData[] = [];

  const charBookEntries = getCharxArray(charx, ['data', 'character_book', 'entries']);
  if (charBookEntries.length > 0) {
    const folderMap = buildRisuFolderMap(charBookEntries as never[]);

    for (const rawEntry of charBookEntries) {
      if (!isPlainObject(rawEntry)) continue;
      if (rawEntry.mode === 'folder') continue;

      const content = typeof rawEntry.content === 'string' ? rawEntry.content : '';
      const { reads, writes } = extractCBSVarOps(content);
      if (reads.size === 0 && writes.size === 0) continue;

      const folderRef = typeof rawEntry.folder === 'string' ? rawEntry.folder : null;
      const folderName = resolveRisuFolderName(folderRef, folderMap, (value) => value);
      const entryName =
        (typeof rawEntry.name === 'string' && rawEntry.name) ||
        (typeof rawEntry.comment === 'string' && rawEntry.comment) ||
        'unnamed';
      const elementName = folderName ? `${folderName}/${entryName}` : entryName;

      results.push({ elementType: ELEMENT_TYPES.LOREBOOK, elementName, reads, writes });
    }
  }

  const moduleEntries = getCharxArray(charx, ['data', 'extensions', 'risuai', '_moduleLorebook']);
  if (moduleEntries.length > 0) {
    const folderMap = buildRisuFolderMap(moduleEntries as never[]);

    for (const rawEntry of moduleEntries) {
      if (!isPlainObject(rawEntry)) continue;
      if (rawEntry.mode === 'folder') continue;

      const content = typeof rawEntry.content === 'string' ? rawEntry.content : '';
      const { reads, writes } = extractCBSVarOps(content);
      if (reads.size === 0 && writes.size === 0) continue;

      const folderRef = typeof rawEntry.folder === 'string' ? rawEntry.folder : null;
      const folderName = resolveRisuFolderName(folderRef, folderMap, (value) => value);
      const entryName =
        (typeof rawEntry.name === 'string' && rawEntry.name) ||
        (typeof rawEntry.comment === 'string' && rawEntry.comment) ||
        'unnamed';
      const baseName = folderName ? `${folderName}/${entryName}` : entryName;

      results.push({
        elementType: ELEMENT_TYPES.LOREBOOK,
        elementName: `[module]/${baseName}`,
        reads,
        writes,
      });
    }
  }

  return results;
}

/** Regex(customScripts)에서 CBS 변수 연산을 수집한다. in/out/flag 필드와 script/content를 모두 탐색. */
export function collectRegexCBS(charx: unknown, outputDir?: string): ElementCBSData[] {
  if (outputDir) {
    const regexDir = path.join(outputDir, 'regex');
    if (dirExists(regexDir)) {
      return collectRegexCBSFromDir(regexDir);
    }
  }

  return collectRegexCBSFromCharx(charx);
}

function collectRegexCBSFromDir(regexDir: string): ElementCBSData[] {
  // First, try canonical .risuregex files
  const risuFiles = listRisuFilesRecursive(regexDir, '.risuregex');
  if (risuFiles.length > 0) {
    const files = resolveOrderedFiles(regexDir, risuFiles);
    const results: ElementCBSData[] = [];
    for (const [index, filePath] of files.entries()) {
      const content = readTextIfExists(filePath);
      if (!content) continue;

      try {
        const parsed = parseRegexContent(content);
        const inOps = extractCBSVarOps(parsed.in);
        const outOps = extractCBSVarOps(parsed.out);
        const flagOps = extractCBSVarOps(typeof parsed.flag === 'string' ? parsed.flag : '');

        const reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
        const writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

        if (reads.size === 0 && writes.size === 0) continue;

        const elementName = path.basename(filePath, '.risuregex');
        results.push({
          elementType: ELEMENT_TYPES.REGEX,
          elementName,
          reads,
          writes,
          executionOrder: files.length - index,
        });
      } catch {
        // Ignore parse errors
      }
    }
    return results;
  }

  // Fallback to legacy JSON files
  const files = resolveOrderedFiles(regexDir, listJsonFilesRecursive(regexDir));
  if (files.length === 0) return [];

  const results: ElementCBSData[] = [];
  for (const [index, filePath] of files.entries()) {
    const raw = readJsonIfExists(filePath);
    if (!isPlainObject(raw)) continue;

    const elementName = path.basename(filePath, '.json');
    const inOps = extractCBSVarOps(getStringField(raw, 'in') || '');
    const outOps = extractCBSVarOps(getStringField(raw, 'out') || '');
    const flagOps = extractCBSVarOps(getStringField(raw, 'flag') || '');

    let reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    let writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

    if (reads.size === 0 && writes.size === 0) {
      const alt = getStringField(raw, 'script') || getStringField(raw, 'content');
      const altOps = extractCBSVarOps(alt || '');
      reads = altOps.reads;
      writes = altOps.writes;
    }

    if (reads.size === 0 && writes.size === 0) continue;
    results.push({
      elementType: ELEMENT_TYPES.REGEX,
      elementName,
      reads,
      writes,
      executionOrder: resolveExecutionOrder(raw, files.length - index),
    });
  }

  return results;
}

function collectRegexCBSFromCharx(charx: unknown): ElementCBSData[] {
  const results: ElementCBSData[] = [];
  const scripts = getCharxArray(charx, ['data', 'extensions', 'risuai', 'customScripts']);

  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    if (!isPlainObject(script)) continue;

    const inOps = extractCBSVarOps(typeof script.in === 'string' ? script.in : '');
    const outOps = extractCBSVarOps(typeof script.out === 'string' ? script.out : '');
    const flagOps = extractCBSVarOps(typeof script.flag === 'string' ? script.flag : '');

    const reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    const writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);
    if (reads.size === 0 && writes.size === 0) continue;

    const elementName =
      (typeof script.comment === 'string' && script.comment) ||
      (typeof script.name === 'string' && script.name) ||
      `unnamed-script-${i}`;

    results.push({
      elementType: ELEMENT_TYPES.REGEX,
      elementName,
      reads,
      writes,
      executionOrder: resolveExecutionOrder(script, scripts.length - i),
    });
  }

  return results;
}

function resolveExecutionOrder(record: Record<string, unknown>, fallback: number): number {
  return typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : fallback;
}

/** List all files with a specific extension recursively. */
function listRisuFilesRecursive(rootDir: string, extension: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listRisuFilesRecursive(fullPath, extension));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/** Push CBS data from a canonical .risulorebook file. */
function pushLorebookCBSFromRisuFile(
  results: ElementCBSData[],
  filePath: string,
  relPosix: string,
): void {
  const content = readTextIfExists(filePath);
  if (!content) return;

  try {
    const parsed = parseLorebookContent(content);
    const { reads, writes } = extractCBSVarOps(parsed.content || '');
    if (reads.size === 0 && writes.size === 0) return;

    const baseName = relPosix.toLowerCase().endsWith('.risulorebook')
      ? relPosix.slice(0, -13)
      : relPosix;
    const elementName = baseName;
    results.push({ elementType: ELEMENT_TYPES.LOREBOOK, elementName, reads, writes });
  } catch {
    // Ignore parse errors
  }
}

function parseDefaultVariablesText(raw: string): Record<string, string> {
  const variables: Record<string, string> = {};
  if (!raw.trim()) return variables;

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      variables[line] = '';
    } else {
      variables[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
    }
  }

  return variables;
}

function parseDefaultVariablesJson(raw: unknown): Record<string, string> {
  const variables: Record<string, string> = {};
  if (!raw) return variables;

  if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      variables[String(key)] = typeof value === 'string' ? value : String(value);
    }
    return variables;
  }

  if (Array.isArray(raw)) {
    for (const rec of raw) {
      if (!isPlainObject(rec)) continue;
      const key =
        typeof rec.key === 'string' ? rec.key : typeof rec.name === 'string' ? rec.name : '';
      if (!key) continue;

      const value =
        typeof rec.value === 'string' ? rec.value : rec.value == null ? '' : String(rec.value);
      variables[key] = value;
    }
  }

  return variables;
}

/** charx 이름을 추출한다. */
function resolveCharxNameFromCard(card: unknown): string {
  if (typeof card !== 'object' || card == null) return 'character';
  const record = card as { data?: { name?: unknown }; name?: unknown };
  if (typeof record.data?.name === 'string' && record.data.name.length > 0) return record.data.name;
  if (typeof record.name === 'string' && record.name.length > 0) return record.name;
  return 'character';
}

/** defaultVariables를 JSON 또는 텍스트(key=value) 포맷에서 파싱한다.
 *  Canonical charx workspaces: variables/<sanitizedCharxName>.risuvar
 *  Fallback: variables/default.risuvar (backward compatibility)
 *  Legacy: variables/default.json, variables/default.txt
 */
export function collectVariablesCBS(card: unknown, outputDir?: string): VariablesResult {
  if (outputDir) {
    const variablesDir = path.join(outputDir, 'variables');

    // Canonical charx workspace: try sanitized charx name first
    const charxName = resolveCharxNameFromCard(card);
    const sanitizedName = sanitizeFilename(charxName, 'character');
    const namedRisuvarPath = path.join(variablesDir, `${sanitizedName}.risuvar`);

    if (fs.existsSync(namedRisuvarPath)) {
      const rawText = readTextIfExists(namedRisuvarPath);
      if (rawText.trim()) {
        try {
          const parsed = parseVariableContent(rawText);
          return { variables: parsed, cbsData: [] };
        } catch {
          // Fall through to next option
        }
      }
    }

    // Fallback: default.risuvar (backward compatibility)
    const defaultRisuvarPath = path.join(variablesDir, 'default.risuvar');
    if (fs.existsSync(defaultRisuvarPath)) {
      const rawText = readTextIfExists(defaultRisuvarPath);
      if (rawText.trim()) {
        try {
          const parsed = parseVariableContent(rawText);
          return { variables: parsed, cbsData: [] };
        } catch {
          // Fall through to legacy formats
        }
      }
    }

    // Fallback to legacy JSON format
    const jsonPath = path.join(variablesDir, 'default.json');
    const rawJson = readJsonIfExists(jsonPath);
    if (rawJson) {
      return { variables: parseDefaultVariablesJson(rawJson), cbsData: [] };
    }

    // Fallback to legacy TXT format
    const txtPath = path.join(variablesDir, 'default.txt');
    const rawText = readTextIfExists(txtPath);
    if (rawText.trim()) {
      return { variables: parseDefaultVariablesText(rawText), cbsData: [] };
    }
  }

  const raw =
    isPlainObject(card) &&
    isPlainObject(card.data) &&
    isPlainObject(card.data.extensions) &&
    isPlainObject(card.data.extensions.risuai) &&
    typeof card.data.extensions.risuai.defaultVariables === 'string'
      ? card.data.extensions.risuai.defaultVariables
      : '';
  return { variables: parseDefaultVariablesText(raw), cbsData: [] };
}

function collectHTMLCBSFromString(html: string, elementName: string): HtmlResult {
  if (!html) {
    return { cbsData: null, assetRefs: [] };
  }

  const { reads, writes } = extractCBSVarOps(html);
  const refs = new Set<string>();

  for (const match of html.matchAll(/src=["']([^"']+)["']/g)) {
    if (match[1]) refs.add(match[1]);
  }
  for (const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (match[1]) refs.add(match[1]);
  }

  return {
    cbsData: { elementType: ELEMENT_TYPES.HTML, elementName, reads, writes },
    assetRefs: [...refs],
  };
}

/** backgroundHTML에서 CBS 변수 연산과 에셋 참조(src 속성, url() CSS)를 추출한다. */
export function collectHTMLCBS(charx: unknown, outputDir?: string): HtmlResult {
  if (outputDir) {
    // Canonical format: background.risuhtml (preferred)
    const risuhtmlPath = path.join(outputDir, 'html', 'background.risuhtml');
    const risuhtml = readTextIfExists(risuhtmlPath);
    if (risuhtml) {
      return collectHTMLCBSFromString(risuhtml, 'background.risuhtml');
    }
    // Legacy fallback: background.html
    const htmlPath = path.join(outputDir, 'html', 'background.html');
    const html = readTextIfExists(htmlPath);
    if (html) {
      return collectHTMLCBSFromString(html, 'background.html');
    }
  }

  const html =
    isPlainObject(charx) &&
    isPlainObject(charx.data) &&
    isPlainObject(charx.data.extensions) &&
    isPlainObject(charx.data.extensions.risuai) &&
    typeof charx.data.extensions.risuai.backgroundHTML === 'string'
      ? charx.data.extensions.risuai.backgroundHTML
      : '';

  return collectHTMLCBSFromString(html, 'background.html');
}

/** TypeScript-to-Lua(tstl) 소스에서 RisuAI 변수 API 호출 패턴을 정규식으로 추출한다. */
export function collectTSCBS(outputDir: string): ElementCBSData[] {
  try {
    let tstlDir = path.join(outputDir, '..', 'tstl');
    if (!fs.existsSync(tstlDir)) {
      tstlDir = path.join(outputDir, 'tstl');
    }
    if (!fs.existsSync(tstlDir)) return [];

    const results: ElementCBSData[] = [];
    const files = fs.readdirSync(tstlDir).filter((file) => file.endsWith('.ts'));

    for (const fileName of files) {
      const filePath = path.join(tstlDir, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');

      const reads = new Set<string>();
      const writes = new Set<string>();

      for (const m of content.matchAll(/vars\.set\(\w+,\s*["']([^"']+)["']/g)) writes.add(m[1]);
      for (const m of content.matchAll(/vars\.get\(\w+,\s*["']([^"']+)["']/g)) reads.add(m[1]);
      for (const m of content.matchAll(/setChatVar\(\w+,\s*["']([^"']+)["']/g)) writes.add(m[1]);
      for (const m of content.matchAll(/getChatVar\(\w+,\s*["']([^"']+)["']/g)) reads.add(m[1]);
      for (const m of content.matchAll(/setState\(\w+,\s*["']([^"']+)["']/g)) writes.add(m[1]);
      for (const m of content.matchAll(/getState\(\w+,\s*["']([^"']+)["']/g)) reads.add(m[1]);

      if (reads.size === 0 && writes.size === 0) continue;
      results.push({ elementType: ELEMENT_TYPES.TYPESCRIPT, elementName: fileName, reads, writes });
    }

    return results;
  } catch {
    return [];
  }
}

/** Lua 소스 파일에서 직접 분석 아티팩트를 생성한다. Canonical .risulua 우선, .lua fallback. */
export function loadLuaArtifacts(
  outputDir: string,
  charxJsonPath: string | null,
): LuaAnalysisArtifact[] {
  try {
    const luaDir = path.join(outputDir, 'lua');
    if (!fs.existsSync(luaDir)) return [];

    // Canonical .risulua files first, then fallback to .lua
    const allFiles = fs.readdirSync(luaDir);
    const risuFiles = allFiles.filter((file) => file.toLowerCase().endsWith('.risulua'));
    const luaFiles = risuFiles.length > 0
      ? risuFiles
      : allFiles.filter((file) => file.toLowerCase().endsWith('.lua'));
    if (luaFiles.length === 0) return [];

    return luaFiles.map((file) => {
      const filePath = path.join(luaDir, file);
      const source = fs.readFileSync(filePath, 'utf-8');
      let charxData: Record<string, unknown> | undefined;
      if (charxJsonPath && fs.existsSync(charxJsonPath)) {
        const raw = JSON.parse(fs.readFileSync(charxJsonPath, 'utf-8'));
        charxData = raw as Record<string, unknown>;
      }
      return analyzeLuaSource({ filePath, source, charxData });
    });
  } catch {
    return [];
  }
}

/** 이전에 생성된 Lua 분석 JSON(*.analysis.json)에서 CBS 데이터를 임포트한다. */
export function importLuaAnalysis(outputDir: string): ElementCBSData[] {
  try {
    const luaDir = path.join(outputDir, 'lua');
    if (!fs.existsSync(luaDir)) return [];

    const jsonFiles = fs.readdirSync(luaDir).filter((file) => file.endsWith('.analysis.json'));
    if (jsonFiles.length === 0) return [];

    return jsonFiles.flatMap((file) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(luaDir, file), 'utf8')) as {
          stateVars?: Record<string, { readBy?: unknown[]; writtenBy?: unknown[] }>;
        };
        const baseName = path.basename(file, '.analysis.json');

        const reads = new Set<string>();
        const writes = new Set<string>();
        const readersByVar: Record<string, string[]> = {};
        const writersByVar: Record<string, string[]> = {};

        if (raw.stateVars && typeof raw.stateVars === 'object') {
          for (const [varName, info] of Object.entries(raw.stateVars)) {
            const readBy = Array.isArray(info.readBy)
              ? info.readBy.filter(
                  (item): item is string => typeof item === 'string' && item.length > 0,
                )
              : [];
            const writtenBy = Array.isArray(info.writtenBy)
              ? info.writtenBy.filter(
                  (item): item is string => typeof item === 'string' && item.length > 0,
                )
              : [];

            if (readBy.length > 0) {
              reads.add(varName);
              readersByVar[varName] = readBy;
            }
            if (writtenBy.length > 0) {
              writes.add(varName);
              writersByVar[varName] = writtenBy;
            }
          }
        }

        return [
          {
            elementType: ELEMENT_TYPES.LUA,
            elementName: baseName,
            reads,
            writes,
            readersByVar,
            writersByVar,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
