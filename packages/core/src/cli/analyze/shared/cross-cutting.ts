import fs from 'node:fs';
import path from 'node:path';
import { type GenericRecord, type LorebookEntryInfo, type RegexScriptInfo, toPosix } from '@/domain';
import { dirExists, readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { listJsonFilesRecursive, resolveOrderedFiles } from '@/node/json-listing';
import { parseLorebookContent, type LorebookContent } from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent, type RegexContent } from '@/domain/custom-extension/extensions/regex';

type TokenBudgetComponent = {
  category: string;
  name: string;
  text: string;
  alwaysActive: boolean;
};

/** 정렬된 lorebook raw record를 dead-code용 메타로 변환 */
export function buildLorebookEntryInfos(
  records: GenericRecord[],
  opts?: { prefix?: string; startOrder?: number },
): LorebookEntryInfo[] {
  const infos: LorebookEntryInfo[] = [];
  const prefix = opts?.prefix ? `${opts.prefix}/` : '';
  let order = opts?.startOrder ?? 0;

  records.forEach((record, index) => {
    if (record.mode === 'folder') return;
    infos.push({
      name: `${prefix}${getLorebookEntryName(record, index)}`,
      keywords: normalizeStringArray(record.keys ?? record.key ?? asRecord(record.data)?.keys ?? asRecord(record.data)?.key),
      insertionOrder: order,
      enabled: record.enabled !== false,
      constant: Boolean(record.constant),
      selective: Boolean(record.selective),
      secondaryKeys: normalizeStringArray(
        record.secondkey ??
          record.secondKey ??
          record.secondkeys ??
          record.secondaryKeys ??
          asRecord(record.data)?.secondkey ??
          asRecord(record.data)?.secondKey ??
          asRecord(record.data)?.secondkeys ??
          asRecord(record.data)?.secondaryKeys,
      ),
    });
    order += 1;
  });

  return infos;
}

/** Walk directory recursively and return absolute paths of files matching the predicate. */
function walkFiles(rootDir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (cur: string): void => {
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(abs);
      }
    }
  };
  walk(rootDir);
  return out;
}

/** 추출된 lorebooks 디렉토리에서 dead-code용 엔트리 메타를 수집. Canonical .risulorebook 우선, JSON/manifest fallback. */
export function collectLorebookEntryInfosFromDir(
  lorebooksDir: string,
  prefix?: string,
): LorebookEntryInfo[] {
  if (!dirExists(lorebooksDir)) return [];

  // Canonical-first: prefer .risulorebook files, fallback to JSON
  const risuFiles = walkFiles(lorebooksDir, (name) => name.toLowerCase().endsWith('.risulorebook'));
  const jsonFiles = listJsonFilesRecursive(lorebooksDir);
  const useCanonical = risuFiles.length > 0;

  const files = useCanonical ? resolveOrderedFiles(lorebooksDir, risuFiles) : jsonFiles;
  const fileMap = new Map<string, string>();
  for (const absPath of files) {
    fileMap.set(toPosix(path.relative(lorebooksDir, absPath)), absPath);
  }

  // Determine ordering: _order.json > manifest.json > alphabetical
  let orderedEntries: string[] = useCanonical
    ? files.map((filePath) => toPosix(path.relative(lorebooksDir, filePath)))
    : [];

  if (orderedEntries.length === 0 && !useCanonical) {
    const manifest = readJsonIfExists(path.join(lorebooksDir, 'manifest.json'));
    if (isManifestWithEntries(manifest)) {
      orderedEntries = manifest.entries
        .filter((entry): entry is GenericRecord => isRecord(entry))
        .filter((entry) => entry.type === 'entry' && typeof entry.path === 'string' && entry.path.length > 0)
        .map((entry) => toPosix(String(entry.path)));
    }
  }

  if (orderedEntries.length === 0) {
    // Alphabetical ordering as fallback
    orderedEntries = [...fileMap.keys()].sort((a, b) => a.localeCompare(b));
  }

  const used = new Set<string>();
  const infos: LorebookEntryInfo[] = [];
  let order = 0;

  for (const relPath of orderedEntries) {
    const filePath = fileMap.get(relPath);
    if (!filePath) continue;
    used.add(relPath);
    infos.push(...collectLorebookFileInfo(filePath, relPath, order, prefix, useCanonical));
    order = infos.length;
  }

  const orphans = [...fileMap.keys()].filter((relPath) => !used.has(relPath)).sort((a, b) => a.localeCompare(b));
  for (const relPath of orphans) {
    const filePath = fileMap.get(relPath);
    if (!filePath) continue;
    infos.push(...collectLorebookFileInfo(filePath, relPath, order, prefix, useCanonical));
    order = infos.length;
  }

  return infos;
}

/** regex raw record를 dead-code용 메타로 변환 */
export function buildRegexScriptInfos(
  records: GenericRecord[],
  opts?: { prefix?: string },
): RegexScriptInfo[] {
  const prefix = opts?.prefix ? `${opts.prefix}/` : '';
  return records.map((record, index) => ({
    name: `${prefix}${getRegexScriptName(record, index)}`,
    in: readStringField(record, 'in'),
    out: readStringField(record, 'out'),
  }));
}

/** 추출된 regex 디렉토리에서 dead-code용 스크립트 메타를 수집. Canonical .risuregex 우선, JSON fallback. */
export function collectRegexScriptInfosFromDir(regexDir: string, prefix?: string): RegexScriptInfo[] {
  if (!dirExists(regexDir)) return [];

  // Canonical-first: prefer .risuregex files, fallback to JSON
  const risuFiles = walkFiles(regexDir, (name) => name.toLowerCase().endsWith('.risuregex'));
  const jsonFiles = listJsonFilesRecursive(regexDir);
  const useCanonical = risuFiles.length > 0;

  const files = useCanonical ? resolveOrderedFiles(regexDir, risuFiles) : resolveOrderedFiles(regexDir, jsonFiles);

  const normalizedPrefix = prefix ? `${prefix}/` : '';
  return files.flatMap((filePath, index) => {
    let content: RegexContent | null = null;

    if (useCanonical) {
      const raw = readTextIfExists(filePath);
      if (raw) {
        try {
          content = parseRegexContent(raw);
        } catch { /* ignore parse errors */ }
      }
    } else {
      const raw = readJsonIfExists(filePath);
      if (isRecord(raw)) {
        content = {
          comment: readStringField(raw, 'comment') || path.basename(filePath, '.json'),
          type: 'editinput',
          in: readStringField(raw, 'in'),
          out: readStringField(raw, 'out'),
        };
      }
    }

    if (!content) return [];

    return [
      {
        name: `${normalizedPrefix}${content.comment || path.basename(filePath, useCanonical ? '.risuregex' : '.json')}`,
        in: content.in,
        out: content.out,
        order: index,
      } satisfies RegexScriptInfo & { order: number },
    ].map(({ order: _ignored, ...info }) => info);
  });
}

/** lua 디렉토리에서 토큰 예산용 source component를 수집. Canonical .risulua 우선, .lua fallback. */
export function collectLuaTokenComponents(
  outputDir: string,
  category: string,
): TokenBudgetComponent[] {
  const luaDir = path.join(outputDir, 'lua');
  if (!dirExists(luaDir)) return [];

  const allFiles = fs.readdirSync(luaDir);
  // Canonical .risulua files first, then fallback to .lua
  const risuFiles = allFiles.filter((fileName) => fileName.toLowerCase().endsWith('.risulua'));
  const luaFiles = risuFiles.length > 0
    ? risuFiles
    : allFiles.filter((fileName) => fileName.toLowerCase().endsWith('.lua'));

  return luaFiles.map((fileName) => ({
    category,
    name: fileName,
    text: readTextIfExists(path.join(luaDir, fileName)),
    alwaysActive: false,
  }));
}

/** 추출된 lorebook 디렉토리에서 토큰 예산용 텍스트를 수집. Canonical .risulorebook 우선, JSON fallback. */
export function collectLorebookTokenComponentsFromDir(
  lorebooksDir: string,
  category: string,
  prefix?: string,
): TokenBudgetComponent[] {
  if (!dirExists(lorebooksDir)) return [];

  // Canonical-first: prefer .risulorebook files, fallback to JSON
  const risuFiles = walkFiles(lorebooksDir, (name) => name.toLowerCase().endsWith('.risulorebook'));
  const jsonFiles = listJsonFilesRecursive(lorebooksDir);
  const useCanonical = risuFiles.length > 0;

  const files = useCanonical ? resolveOrderedFiles(lorebooksDir, risuFiles) : resolveOrderedFiles(lorebooksDir, jsonFiles);

  const normalizedPrefix = prefix ? `${prefix}/` : '';

  return files.flatMap((filePath) => {
    const relPath = toPosix(path.relative(lorebooksDir, filePath)).replace(/\.(json|risulorebook)$/u, '');

    if (useCanonical) {
      const raw = readTextIfExists(filePath);
      if (!raw) return [];

      let content: LorebookContent;
      try {
        content = parseLorebookContent(raw);
      } catch {
        return [];
      }

      if (content.mode === 'folder') return [];

      return [{
        category,
        name: `${normalizedPrefix}${relPath}`,
        text: content.content,
        alwaysActive: content.constant,
      }];
    }

    // Legacy JSON fallback
    const raw = readJsonIfExists(filePath);
    if (!raw) return [];

    const records = Array.isArray(raw) ? raw.filter(isRecord) : isRecord(raw) ? [raw] : [];

    return records.flatMap((record, index) => {
      if (record.mode === 'folder') return [];
      const text = typeof record.content === 'string' ? record.content : '';
      const name = records.length > 1 ? `${relPath}#${index}` : relPath;
      return [
        {
          category,
          name: `${normalizedPrefix}${name}`,
          text,
          alwaysActive: Boolean(record.constant),
        },
      ];
    });
  });
}

/** 추출된 regex 디렉토리에서 토큰 예산용 텍스트를 수집. Canonical .risuregex 우선, JSON fallback. */
export function collectRegexTokenComponentsFromDir(
  regexDir: string,
  category: string,
  prefix?: string,
): TokenBudgetComponent[] {
  if (!dirExists(regexDir)) return [];

  // Canonical-first: prefer .risuregex files, fallback to JSON
  const risuFiles = walkFiles(regexDir, (name) => name.toLowerCase().endsWith('.risuregex'));
  const jsonFiles = listJsonFilesRecursive(regexDir);
  const useCanonical = risuFiles.length > 0;

  const files = useCanonical ? resolveOrderedFiles(regexDir, risuFiles) : resolveOrderedFiles(regexDir, jsonFiles);

  const normalizedPrefix = prefix ? `${prefix}/` : '';

  return files.flatMap((filePath) => {
    if (useCanonical) {
      const raw = readTextIfExists(filePath);
      if (!raw) return [];

      let content: RegexContent;
      try {
        content = parseRegexContent(raw);
      } catch {
        return [];
      }

      const name = `${normalizedPrefix}${content.comment || path.basename(filePath, '.risuregex')}`;
      const text = [content.in, content.out, content.flag ?? ''].filter((v) => v.length > 0).join('\n');

      return [{ category, name, text, alwaysActive: false }];
    }

    // Legacy JSON fallback
    const raw = readJsonIfExists(filePath);
    if (!isRecord(raw)) return [];

    const name = `${normalizedPrefix}${path.basename(filePath, '.json')}`;
    const text = [
      readStringField(raw, 'in'),
      readStringField(raw, 'out'),
      readStringField(raw, 'flag'),
      readStringField(raw, 'script'),
      readStringField(raw, 'content'),
    ]
      .filter((value) => value.length > 0)
      .join('\n');

    return [{ category, name, text, alwaysActive: false }];
  });
}

/** 텍스트 파일 디렉토리에서 토큰 예산용 source를 수집 */
export function collectNamedTextFileComponents(
  dirPath: string,
  category: string,
  fileNames: string[],
): TokenBudgetComponent[] {
  if (!dirExists(dirPath)) return [];

  const components: TokenBudgetComponent[] = [];
  for (const fileName of fileNames) {
    const text = readTextIfExists(path.join(dirPath, fileName));
    if (!text) continue;
    components.push({
      category,
      name: fileName.replace(/\.[^.]+$/u, ''),
      text,
      alwaysActive: true,
    });
  }

  return components;
}

/** JSON 파일 디렉토리에서 특정 text 필드를 읽어 토큰 예산용 source를 수집 */
export function collectJsonTextFieldComponents(
  dirPath: string,
  category: string,
  textKeys: string[],
): TokenBudgetComponent[] {
  if (!dirExists(dirPath)) return [];

  const files = resolveOrderedFiles(dirPath, listJsonFilesRecursive(dirPath));
  return files.flatMap((filePath) => {
    const raw = readJsonIfExists(filePath);
    if (!isRecord(raw)) return [];
    const text = textKeys.map((key) => readStringField(raw, key)).find((value) => value.length > 0) ?? '';
    if (!text) return [];

    return [
      {
        category,
        name: path.basename(filePath, '.json'),
        text,
        alwaysActive: true,
      },
    ];
  });
}

/** 단일 파일 텍스트를 토큰 예산용 source로 감싼다 */
export function collectSingleFileTokenComponent(
  filePath: string,
  category: string,
  name: string,
  alwaysActive: boolean,
): TokenBudgetComponent[] {
  const text = readTextIfExists(filePath);
  return text ? [{ category, name, text, alwaysActive }] : [];
}

function collectLorebookFileInfo(
  filePath: string,
  relPath: string,
  startOrder: number,
  prefix?: string,
  useCanonical = false,
): LorebookEntryInfo[] {
  const baseName = relPath.toLowerCase().replace(/\.(json|risulorebook)$/u, '');
  let order = startOrder;

  if (useCanonical) {
    const raw = readTextIfExists(filePath);
    if (!raw) return [];

    let content: LorebookContent;
    try {
      content = parseLorebookContent(raw);
    } catch {
      return [];
    }

    if (content.mode === 'folder') return [];

    const scopedName = content.name || baseName;
    const info: LorebookEntryInfo = {
      name: prefix ? `${prefix}/${scopedName}` : scopedName,
      keywords: content.keys,
      insertionOrder: order,
      enabled: true,
      constant: content.constant,
      selective: content.selective,
      secondaryKeys: content.secondary_keys ?? [],
    };
    return [info];
  }

  // Legacy JSON fallback
  const raw = readJsonIfExists(filePath);
  if (!raw) return [];

  const records = Array.isArray(raw) ? raw.filter(isRecord) : isRecord(raw) ? [raw] : [];

  return records.flatMap((record, index) => {
    if (record.mode === 'folder') return [];

    const scopedName =
      records.length > 1 ? `${baseName}#${index}` : getLorebookEntryName(record, index) || baseName;
    const info: LorebookEntryInfo = {
      name: prefix ? `${prefix}/${scopedName}` : scopedName,
      keywords: normalizeStringArray(record.keys ?? record.key ?? asRecord(record.data)?.keys ?? asRecord(record.data)?.key),
      insertionOrder: order,
      enabled: record.enabled !== false,
      constant: Boolean(record.constant),
      selective: Boolean(record.selective),
      secondaryKeys: normalizeStringArray(
        record.secondkey ??
          record.secondKey ??
          record.secondkeys ??
          record.secondaryKeys ??
          asRecord(record.data)?.secondkey ??
          asRecord(record.data)?.secondKey ??
          asRecord(record.data)?.secondkeys ??
          asRecord(record.data)?.secondaryKeys,
      ),
    };
    order += 1;
    return [info];
  });
}

function getLorebookEntryName(record: GenericRecord, index: number): string {
  if (typeof record.name === 'string' && record.name) return record.name;
  if (typeof record.comment === 'string' && record.comment) return record.comment;
  if (record.id != null && String(record.id)) return `entry-${String(record.id)}`;
  return `entry-${index}`;
}

function getRegexScriptName(record: GenericRecord, index: number): string {
  if (typeof record.comment === 'string' && record.comment) return record.comment;
  if (typeof record.name === 'string' && record.name) return record.name;
  return `regex_${index}`;
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

function normalizeStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function isManifestWithEntries(value: unknown): value is { entries: unknown[] } {
  return isRecord(value) && Array.isArray(value.entries);
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): GenericRecord | null {
  return isRecord(value) ? value : null;
}
