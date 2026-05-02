import fs from 'node:fs';
import path from 'node:path';
import {
  ELEMENT_TYPES,
  extractCBSVarOps,
  toPosix,
  type ElementCBSData,
  type GenericRecord,
} from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import { parseLorebookContent } from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '@/domain/regex';
import { dirExists, readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { listJsonFilesRecursive, resolveOrderedFiles } from '@/node/json-listing';
import { readRisumoduleManifest } from '../../shared/risumodule';
import { collectHTMLCBS, importLuaAnalysis, loadLuaArtifacts } from '../charx/collectors';
import type { ModuleCollectResult } from './types';

/** 추출된 module 디렉토리에서 CBS 변수 연산 데이터를 수집한다. */
export function collectModuleCBS(outputDir: string): ModuleCollectResult {
  const lorebookCBS = collectModuleLorebookCBS(outputDir);
  const { regexCBS, regexScriptTotal } = collectModuleRegexCBS(outputDir);
  const luaArtifacts = loadLuaArtifactsForModule(outputDir);
  const luaCBS =
    luaArtifacts.length > 0
      ? luaArtifacts.flatMap((artifact) => artifact.elementCbs)
      : importLuaAnalysis(outputDir);
  const htmlCBS = collectHTMLCBS(null, outputDir).cbsData;
  const metadata = loadModuleMetadata(outputDir);

  return { lorebookCBS, regexCBS, regexScriptTotal, luaCBS, htmlCBS, metadata, luaArtifacts };
}

/** module 추출 디렉토리의 Lua 파일을 직접 분석해 아티팩트를 만든다. */
export function loadLuaArtifactsForModule(outputDir: string): LuaAnalysisArtifact[] {
  return loadLuaArtifacts(outputDir, null);
}

function collectModuleLorebookCBS(outputDir: string): ElementCBSData[] {
  const lorebooksDir = path.join(outputDir, 'lorebooks');
  if (!dirExists(lorebooksDir)) return [];

  // First, try canonical .risulorebook files
  const risuFiles = listRisuFilesRecursive(lorebooksDir, '.risulorebook');
  if (risuFiles.length > 0) {
    const files = resolveOrderedFiles(lorebooksDir, risuFiles);
    const results: ElementCBSData[] = [];
    for (const filePath of files) {
      const relPosix = toPosix(path.relative(lorebooksDir, filePath));
      results.push(...collectLorebookRisuFile(filePath, relPosix));
    }
    return results;
  }

  // Fallback to legacy manifest.json + JSON files approach
  const manifest = readJsonIfExists(path.join(lorebooksDir, 'manifest.json'));
  const files = listJsonFilesRecursive(lorebooksDir);
  const fileMap = new Map<string, string>();
  for (const filePath of files) {
    fileMap.set(toPosix(path.relative(lorebooksDir, filePath)), filePath);
  }

  const orderedEntries = isManifestWithEntries(manifest)
    ? manifest.entries
        .filter((entry): entry is GenericRecord => isRecord(entry))
        .filter((entry) => entry.type === 'entry' && typeof entry.path === 'string' && entry.path.length > 0)
        .map((entry) => toPosix(String(entry.path)))
    : resolveOrderedFiles(lorebooksDir, files).map((filePath) =>
        toPosix(path.relative(lorebooksDir, filePath)),
      );

  const used = new Set<string>();
  const results: ElementCBSData[] = [];

  for (const relPath of orderedEntries) {
    const filePath = fileMap.get(relPath);
    if (!filePath) continue;
    used.add(relPath);
    results.push(...collectLorebookFile(filePath, relPath));
  }

  const orphans = [...fileMap.keys()].filter((relPath) => !used.has(relPath)).sort((a, b) => a.localeCompare(b));
  for (const relPath of orphans) {
    const filePath = fileMap.get(relPath);
    if (!filePath) continue;
    results.push(...collectLorebookFile(filePath, relPath));
  }

  return results;
}

function collectLorebookFile(filePath: string, relPath: string): ElementCBSData[] {
  const raw = readJsonIfExists(filePath);
  if (!raw) return [];

  const records = Array.isArray(raw) ? raw.filter(isRecord) : isRecord(raw) ? [raw] : [];
  const baseName = relPath.toLowerCase().endsWith('.json') ? relPath.slice(0, -5) : relPath;

  return records.flatMap((record, index) => {
    if (record.mode === 'folder') return [];

    const content = typeof record.content === 'string' ? record.content : '';
    const ops = extractCBSVarOps(content);
    if (ops.reads.size === 0 && ops.writes.size === 0) return [];

    const scopedName = records.length > 1 ? `${baseName}#${index}` : baseName;
    return [
      {
        elementType: ELEMENT_TYPES.LOREBOOK,
        elementName: `[module]/${scopedName}`,
        reads: ops.reads,
        writes: ops.writes,
      },
    ];
  });
}

function collectModuleRegexCBS(outputDir: string): { regexCBS: ElementCBSData[]; regexScriptTotal: number } {
  const regexDir = path.join(outputDir, 'regex');
  if (!dirExists(regexDir)) return { regexCBS: [], regexScriptTotal: 0 };

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

        const baseName = path.basename(filePath, '.risuregex');
        results.push({
          elementType: ELEMENT_TYPES.REGEX,
          elementName: `[module]/${baseName}`,
          reads,
          writes,
          executionOrder: files.length - index,
        });
      } catch {
        // Ignore parse errors
      }
    }
    return { regexCBS: results, regexScriptTotal: files.length };
  }

  // Fallback to legacy JSON files
  const files = resolveOrderedFiles(regexDir, listJsonFilesRecursive(regexDir));
  const regexScriptTotal = files.length;
  const results: ElementCBSData[] = [];

  for (const [index, filePath] of files.entries()) {
    const raw = readJsonIfExists(filePath);
    if (!isRecord(raw)) continue;

    const inOps = extractCBSVarOps(readStringField(raw, 'in'));
    const outOps = extractCBSVarOps(readStringField(raw, 'out'));
    const flagOps = extractCBSVarOps(readStringField(raw, 'flag'));

    let reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    let writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

    if (reads.size === 0 && writes.size === 0) {
      const alt = readStringField(raw, 'script') || readStringField(raw, 'content');
      const altOps = extractCBSVarOps(alt);
      reads = altOps.reads;
      writes = altOps.writes;
    }

    if (reads.size === 0 && writes.size === 0) continue;

    const relPath = toPosix(path.relative(regexDir, filePath));
    const baseName = relPath.toLowerCase().endsWith('.json') ? relPath.slice(0, -5) : relPath;
    results.push({
      elementType: ELEMENT_TYPES.REGEX,
      elementName: `[module]/${baseName}`,
      reads,
      writes,
      executionOrder:
        typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : files.length - index,
    });
  }

  return { regexCBS: results, regexScriptTotal };
}

function loadModuleMetadata(outputDir: string): Record<string, unknown> {
  const moduleJson = readJsonIfExists(path.join(outputDir, 'module.json'));

  // Canonical: read .risumodule marker
  const risumodule = (() => {
    try {
      return readRisumoduleManifest(outputDir) as unknown as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  if (risumodule) {
    return {
      ...(isRecord(moduleJson) ? moduleJson : {}),
      ...risumodule,
    };
  }

  // Legacy: module.json only (metadata.json fallback removed)
  return isRecord(moduleJson) ? moduleJson : {};
}

function readStringField(record: GenericRecord, key: string): string {
  const direct = record[key];
  if (typeof direct === 'string') return direct;

  const nested = record.data;
  if (isRecord(nested) && typeof nested[key] === 'string') {
    return nested[key] as string;
  }

  return '';
}

function isManifestWithEntries(value: unknown): value is { entries: unknown[] } {
  return isRecord(value) && Array.isArray(value.entries);
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Collect CBS data from a canonical .risulorebook file. */
function collectLorebookRisuFile(filePath: string, relPath: string): ElementCBSData[] {
  const content = readTextIfExists(filePath);
  if (!content) return [];

  try {
    const parsed = parseLorebookContent(content);
    const { reads, writes } = extractCBSVarOps(parsed.content || '');
    if (reads.size === 0 && writes.size === 0) return [];

    const baseName = relPath.toLowerCase().endsWith('.risulorebook')
      ? relPath.slice(0, -13)
      : relPath;
    return [
      {
        elementType: ELEMENT_TYPES.LOREBOOK,
        elementName: `[module]/${baseName}`,
        reads,
        writes,
      },
    ];
  } catch {
    return [];
  }
}
