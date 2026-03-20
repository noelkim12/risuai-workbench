import fs from 'node:fs';
import path from 'node:path';
import {
  buildRisuFolderMap,
  resolveRisuFolderName,
  toPosix,
  type RisuCharbookEntry,
} from '../../domain';
import { writeText } from '../../node/fs-helpers';
import {
  listJsonFilesRecursive,
  listJsonFilesFlat,
  resolveOrderedFiles,
  readJson,
} from '../../node/json-listing';

interface BuildOptions {
  inDir: string;
  regexDir: string;
  lorebooksDir: string;
  outDir: string;
  dedupeLorebook: boolean;
  regexOnly: boolean;
  lorebookOnly: boolean;
}

interface LorebookRow {
  raw: Record<string, unknown>;
  relDir: string;
}

interface RegexExport {
  type: 'regex';
  data: Array<Record<string, unknown>>;
}

interface LorebookExport {
  type: 'risu';
  ver: 1;
  data: Array<Record<string, unknown>>;
}

export function runBuildWorkflow(argv: readonly string[]): number {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return 0;
  }

  const options = parseBuildOptions(argv);

  if (options.regexOnly && options.lorebookOnly) {
    console.error('\nERROR: --regex-only and --lorebook-only cannot be used together.\n');
    return 1;
  }

  try {
    executeBuild(options);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nERROR: ${message}\n`);
    return 1;
  }
}

function printHelp(): void {
  console.log(`
RisuAI Component Builder

Usage:
  node build-components.js [options]

Options:
  --in <dir>            Base input directory containing regex/ and lorebooks/ (default: .)
  --regex-dir <dir>     Regex directory override (default: <in>/regex)
  --lorebooks-dir <dir> Lorebooks directory override (default: <in>/lorebooks)
  --out <dir>           Output directory (default: <in>)
  --regex-only          Build regexscript_export.json only
  --lorebook-only       Build lorebook_export.json only
  --no-dedupe           Keep duplicate lorebook entries
  -h, --help            Show help

Outputs:
  regexscript_export.json  -> { type: "regex", data: [...] }
  lorebook_export.json     -> { type: "risu", ver: 1, data: [...] }

Lorebook input rules:
  1) lorebooks/manifest.json가 있으면 이를 우선 사용
  2) 없으면 기존 _order.json + 파일 스캔 방식으로 fallback
`);
}

function parseBuildOptions(argv: readonly string[]): BuildOptions {
  const inDir = path.resolve(argValue(argv, '--in') || '.');
  const regexDir = path.resolve(argValue(argv, '--regex-dir') || path.join(inDir, 'regex'));
  const lorebooksDir = path.resolve(
    argValue(argv, '--lorebooks-dir') || path.join(inDir, 'lorebooks'),
  );
  const outDir = path.resolve(argValue(argv, '--out') || inDir);

  return {
    inDir,
    regexDir,
    lorebooksDir,
    outDir,
    dedupeLorebook: !argv.includes('--no-dedupe'),
    regexOnly: argv.includes('--regex-only'),
    lorebookOnly: argv.includes('--lorebook-only'),
  };
}

function argValue(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] || null;
}

function executeBuild(options: BuildOptions): void {
  console.log('\nRisuAI Component Builder\n');
  console.log(`- input base      : ${options.inDir}`);
  console.log(`- regex dir       : ${options.regexDir}`);
  console.log(`- lorebooks dir   : ${options.lorebooksDir}`);
  console.log(`- output dir      : ${options.outDir}`);
  console.log(`- lorebook dedupe : ${options.dedupeLorebook ? 'on' : 'off'}`);

  const shouldBuildRegex = !options.lorebookOnly;
  const shouldBuildLorebook = !options.regexOnly;

  let regexExport: RegexExport | null = null;
  let lorebookExport: LorebookExport | null = null;

  if (shouldBuildRegex) {
    regexExport = buildRegexExport(options.regexDir);
    writeJsonWithTrailingNewline(
      path.join(options.outDir, 'regexscript_export.json'),
      regexExport,
    );
  }

  if (shouldBuildLorebook) {
    lorebookExport = buildLorebookExport(options.lorebooksDir, options.dedupeLorebook);
    writeJsonWithTrailingNewline(
      path.join(options.outDir, 'lorebook_export.json'),
      lorebookExport,
    );
  }

  console.log('\nBuild complete:');
  if (regexExport) {
    console.log(
      `- ${path.relative(process.cwd(), path.join(options.outDir, 'regexscript_export.json'))} (${regexExport.data.length} entries)`,
    );
  }
  if (lorebookExport) {
    console.log(
      `- ${path.relative(process.cwd(), path.join(options.outDir, 'lorebook_export.json'))} (${lorebookExport.data.length} entries)`,
    );
  }
  console.log('');
}

function writeJsonWithTrailingNewline(filePath: string, data: unknown): void {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickKnownRegexFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    comment: typeof raw.comment === 'string' ? raw.comment : '',
    in: typeof raw.in === 'string' ? raw.in : '',
    out: typeof raw.out === 'string' ? raw.out : '',
    type: typeof raw.type === 'string' ? raw.type : 'editprocess',
    ableFlag: typeof raw.ableFlag === 'boolean' ? raw.ableFlag : false,
  };

  if (typeof raw.flag === 'string' && raw.flag.length > 0) {
    out.flag = raw.flag;
  }

  const known = new Set(['comment', 'in', 'out', 'type', 'ableFlag', 'flag']);
  const extras = Object.keys(raw)
    .filter((key) => !known.has(key))
    .sort();
  for (const key of extras) {
    out[key] = raw[key];
  }

  return out;
}

function normalizeLorebookEntry(
  raw: Record<string, unknown>,
  relDirPosix: string,
  folderMap: Record<string, string>,
): Record<string, unknown> {
  const insertOrder =
    typeof raw.insertorder === 'number' && Number.isFinite(raw.insertorder)
      ? raw.insertorder
      : typeof raw.insertion_order === 'number' && Number.isFinite(raw.insertion_order)
        ? raw.insertion_order
        : 100;

  let key = '';
  if (typeof raw.key === 'string') {
    key = raw.key;
  } else if (Array.isArray(raw.keys)) {
    key = raw.keys.filter((value): value is string => typeof value === 'string').join(', ');
  }

  const normalized: Record<string, unknown> = {
    key,
    secondkey: typeof raw.secondkey === 'string' ? raw.secondkey : '',
    insertorder: insertOrder,
    comment:
      typeof raw.comment === 'string'
        ? raw.comment
        : typeof raw.name === 'string'
          ? raw.name
          : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    mode: typeof raw.mode === 'string' ? raw.mode : 'normal',
    alwaysActive: typeof raw.alwaysActive === 'boolean' ? raw.alwaysActive : Boolean(raw.constant),
    selective: typeof raw.selective === 'boolean' ? raw.selective : false,
    useRegex: typeof raw.useRegex === 'boolean' ? raw.useRegex : Boolean(raw.use_regex),
    bookVersion:
      typeof raw.bookVersion === 'number' && Number.isFinite(raw.bookVersion)
        ? raw.bookVersion
        : 2,
  };

  const folderRef = typeof raw.folder === 'string' && raw.folder.length > 0 ? raw.folder : '';
  const folder = folderRef
    ? resolveRisuFolderName(folderRef, folderMap, (value) => value)
    : relDirPosix !== '.'
      ? relDirPosix
      : '';

  if (folder) {
    normalized.folder = folder;
  }

  const known = new Set([
    'key',
    'keys',
    'secondkey',
    'insertorder',
    'insertion_order',
    'comment',
    'name',
    'content',
    'mode',
    'alwaysActive',
    'constant',
    'selective',
    'useRegex',
    'use_regex',
    'bookVersion',
    'folder',
    'enabled',
    'extensions',
    'case_sensitive',
  ]);

  const extras = Object.keys(raw)
    .filter((field) => !known.has(field))
    .sort();
  for (const field of extras) {
    normalized[field] = raw[field];
  }

  return normalized;
}

function lorebookDedupeKey(entry: Record<string, unknown>): string {
  return JSON.stringify({
    key: entry.key,
    secondkey: entry.secondkey,
    insertorder: entry.insertorder,
    comment: entry.comment,
    content: entry.content,
    mode: entry.mode,
    alwaysActive: entry.alwaysActive,
    selective: entry.selective,
    useRegex: entry.useRegex,
    bookVersion: entry.bookVersion,
  });
}

function buildRegexExport(regexDir: string): RegexExport {
  const files = resolveOrderedFiles(regexDir, listJsonFilesFlat(regexDir));
  const items: Array<Record<string, unknown>> = [];

  for (const filePath of files) {
    const raw = readJson(filePath);
    if (!isPlainObject(raw)) {
      throw new Error(`Invalid regex JSON object: ${filePath}`);
    }
    items.push(pickKnownRegexFields(raw));
  }

  return { type: 'regex', data: items };
}

function readLorebookRowsFromManifest(lorebooksDir: string): LorebookRow[] | null {
  const manifestPath = path.join(lorebooksDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    console.warn('  ⚠️  lorebooks/manifest.json 파싱 실패 — 기존 파일 스캔 방식으로 진행');
    return null;
  }

  if (!isPlainObject(manifest) || !Array.isArray(manifest.entries)) {
    console.warn('  ⚠️  lorebooks/manifest.json 형식이 잘못되었습니다 — 기존 파일 스캔 방식으로 진행');
    return null;
  }

  const files = listJsonFilesRecursive(lorebooksDir);
  const fileMap = new Map<string, string>();
  for (const filePath of files) {
    fileMap.set(toPosix(path.relative(lorebooksDir, filePath)), filePath);
  }

  const usedFiles = new Set<string>();
  const rows: LorebookRow[] = [];

  for (const rec of manifest.entries) {
    if (!isPlainObject(rec)) {
      console.warn('  ⚠️  lorebooks/manifest.json: 잘못된 엔트리 (skip)');
      continue;
    }

    if (rec.type === 'folder') {
      if (!isPlainObject(rec.data)) {
        console.warn('  ⚠️  lorebooks/manifest.json: folder 엔트리 data 누락 (skip)');
        continue;
      }

      rows.push({ raw: rec.data, relDir: '.' });
      continue;
    }

    if (rec.type !== 'entry' || typeof rec.path !== 'string' || rec.path.length === 0) {
      console.warn('  ⚠️  lorebooks/manifest.json: entry 엔트리 path 누락 (skip)');
      continue;
    }

    const rel = toPosix(rec.path);
    const matchedPath = fileMap.get(rel);
    if (!matchedPath) {
      console.warn(`  ⚠️  lorebooks/manifest.json: 파일 없음 (skip): ${rel}`);
      continue;
    }

    const raw = readJson(matchedPath);
    if (!isPlainObject(raw)) {
      throw new Error(`Invalid lorebook JSON object: ${matchedPath}`);
    }

    rows.push({ raw, relDir: toPosix(path.dirname(rel)) });
    usedFiles.add(rel);
  }

  const orphans = [...fileMap.keys()]
    .filter((rel) => !usedFiles.has(rel))
    .sort((a, b) => a.localeCompare(b));

  for (const rel of orphans) {
    const filePath = fileMap.get(rel);
    if (!filePath) continue;

    const raw = readJson(filePath);
    if (!isPlainObject(raw)) {
      throw new Error(`Invalid lorebook JSON object: ${filePath}`);
    }

    console.warn(`  ⚠️  lorebooks/manifest.json에 없는 파일 (끝에 추가): ${rel}`);
    rows.push({ raw, relDir: toPosix(path.dirname(rel)) });
  }

  return rows;
}

function buildLorebookExport(lorebooksDir: string, dedupeLorebook: boolean): LorebookExport {
  let rows = readLorebookRowsFromManifest(lorebooksDir);

  if (!rows) {
    const files = resolveOrderedFiles(lorebooksDir, listJsonFilesRecursive(lorebooksDir));
    rows = [];

    for (const filePath of files) {
      const raw = readJson(filePath);
      if (!isPlainObject(raw)) {
        throw new Error(`Invalid lorebook JSON object: ${filePath}`);
      }

      const rel = toPosix(path.relative(lorebooksDir, filePath));
      rows.push({ raw, relDir: toPosix(path.dirname(rel)) });
    }
  }

  const folderMap = buildRisuFolderMap(rows.map((row) => toRisuCharbookEntry(row.raw)), {
    fallbackName: 'unnamed',
  });
  const items = rows.map((row) => normalizeLorebookEntry(row.raw, row.relDir, folderMap));

  let data = items;
  if (dedupeLorebook) {
    const seen = new Set<string>();
    data = items.filter((item) => {
      const dedupeKey = lorebookDedupeKey(item);
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }

  return { type: 'risu', ver: 1, data };
}

function toRisuCharbookEntry(raw: Record<string, unknown>): RisuCharbookEntry {
  const keys = Array.isArray(raw.keys)
    ? raw.keys.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    mode: typeof raw.mode === 'string' ? raw.mode : '',
    keys,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    comment: typeof raw.comment === 'string' ? raw.comment : undefined,
  };
}
