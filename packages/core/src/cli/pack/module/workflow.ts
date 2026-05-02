import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '@/node/fs-helpers';
import { encodeRPack } from '@/node/rpack';
import {
  assembleLorebookCollection,
  injectLorebooksIntoModule,
  parseLorebookContent,
  parseLorebookOrder,
} from '@/domain/custom-extension/extensions/lorebook';
import {
  injectRegexIntoModule,
  parseRegexContent,
} from '@/domain/regex';
import {
  injectLuaIntoModule,
  parseLuaContent,
  resolveDuplicateLuaSources,
} from '@/domain/custom-extension/extensions/lua';
import {
  injectHtmlIntoModule,
  parseHtmlContent,
  resolveDuplicateHtmlSources,
} from '@/domain/custom-extension/extensions/html';
import {
  injectVariablesIntoModule,
  parseVariableContent,
  resolveDuplicateVariableSources,
} from '@/domain/custom-extension/extensions/variable';
import {
  injectToggleIntoModule,
  parseToggleContent,
  resolveDuplicateToggleSources,
} from '@/domain/custom-extension/extensions/toggle';
import { sanitizeFilename } from '../../../utils/filenames';
import { argValue } from '../utils';
import {
  readRisumoduleManifest,
  applyRisumoduleToModule,
} from '@/cli/shared/risumodule';

const HELP_TEXT = `
  📦 RisuAI Module Packer

  Usage: risu-core pack-module [options]

  Options:
    --in <dir>        입력 디렉토리 (기본: .)
    --out <path|dir>  출력 파일 경로 또는 디렉토리
    --format <type>   json | risum (기본: json)
    --name <name>     출력 파일명 기본값 (확장자 제외)
    -h, --help        도움말
`;

type PackFormat = 'json' | 'risum';

interface PackOptions {
  inDir: string;
  outArg: string | null;
  formatArg: string;
  nameArg: string | null;
}

interface ModuleAssetsResult {
  tuples: Array<[string | null, string | null, string | null]>;
  buffers: Array<Buffer | null>;
}

export function runPackWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  const options: PackOptions = {
    inDir: argValue(argv, '--in') || '.',
    outArg: argValue(argv, '--out'),
    formatArg: (argValue(argv, '--format') || 'json').toLowerCase(),
    nameArg: argValue(argv, '--name'),
  };

  try {
    runMain(options);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

export function buildModuleFromCanonicalDirectory(inRoot: string): {
  module: Record<string, unknown>;
  assetBuffers: Array<Buffer | null>;
} {
  const manifest = readRisumoduleManifest(inRoot);
  const moduleObj: Record<string, unknown> = {};

  applyRisumoduleToModule(moduleObj, manifest);
  mergeLorebooks(moduleObj, inRoot);
  mergeRegex(moduleObj, inRoot);
  mergeLua(moduleObj, inRoot);
  mergeVariables(moduleObj, inRoot);
  mergeBackgroundHtml(moduleObj, inRoot);
  mergeToggle(moduleObj, inRoot);

  const assets = mergeAssets(moduleObj, inRoot);
  return { module: moduleObj, assetBuffers: assets.buffers };
}

function runMain(options: PackOptions): void {
  const resolvedIn = path.resolve(options.inDir);
  if (!fs.existsSync(resolvedIn) || !fs.statSync(resolvedIn).isDirectory()) {
    throw new Error(`입력 디렉토리를 찾을 수 없습니다: ${resolvedIn}`);
  }

  const format = resolveTargetFormat(options.formatArg);
  const packed = buildModuleFromCanonicalDirectory(resolvedIn);
  const { outPath, baseName } = resolveOutputPath({
    inRoot: resolvedIn,
    outArg: options.outArg,
    nameArg: options.nameArg,
    module: packed.module,
    format,
  });
  ensureDir(path.dirname(outPath));

  if (format === 'json') {
    fs.writeFileSync(
      outPath,
      `${JSON.stringify({ type: 'risuModule', module: packed.module }, null, 2)}\n`,
      'utf-8',
    );
  } else {
    fs.writeFileSync(outPath, encodeModuleRisumWithAssets(packed.module, packed.assetBuffers));
  }

  console.log('\n  📦 RisuAI Module Packer\n');
  console.log(`  입력: ${path.relative('.', resolvedIn)}`);
  console.log(`  출력: ${path.relative('.', outPath)}`);
  console.log(`  이름: ${baseName}\n`);
}

function resolveTargetFormat(formatArgValue: string): PackFormat {
  if (formatArgValue === 'json' || formatArgValue === 'risum') {
    return formatArgValue;
  }

  throw new Error(`지원하지 않는 module pack format: ${formatArgValue} (지원: json, risum)`);
}

function resolveOutputPath(params: {
  inRoot: string;
  outArg: string | null;
  nameArg: string | null;
  module: Record<string, unknown>;
  format: PackFormat;
}): { outPath: string; baseName: string } {
  const defaultBase = sanitizeFilename(
    params.nameArg || asNonEmptyString(params.module.name) || 'module',
    'module',
  );
  const ext = params.format === 'json' ? '.json' : '.risum';
  const defaultFile = path.join(params.inRoot, `${defaultBase}_repack${ext}`);

  if (!params.outArg) {
    return { outPath: defaultFile, baseName: `${defaultBase}_repack` };
  }

  const resolved = path.resolve(params.outArg);
  const asDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
  if (asDir) {
    return {
      outPath: path.join(resolved, `${defaultBase}_repack${ext}`),
      baseName: `${defaultBase}_repack`,
    };
  }

  if (!fs.existsSync(resolved) && path.extname(resolved) === '') {
    return {
      outPath: path.join(resolved, `${defaultBase}_repack${ext}`),
      baseName: `${defaultBase}_repack`,
    };
  }

  const parsed = path.parse(resolved);
  const finalName = parsed.name || `${defaultBase}_repack`;
  const finalExt = parsed.ext || ext;
  return { outPath: path.join(parsed.dir || '.', `${finalName}${finalExt}`), baseName: finalName };
}

function mergeLorebooks(moduleObj: Record<string, unknown>, inRoot: string): void {
  const loreDir = path.join(inRoot, 'lorebooks');
  if (!isDir(loreDir)) {
    return;
  }

  // Discover all .risulorebook files recursively
  const files = listFilesRecursiveBySuffix(loreDir, '.risulorebook').map((absolutePath) => ({
    relativePath: toPosix(path.relative(loreDir, absolutePath)),
    content: parseLorebookContent(fs.readFileSync(absolutePath, 'utf-8')),
  }));

  // Read _order.json for file and folder ordering
  const orderPath = path.join(loreDir, '_order.json');
  const declaredOrder = fs.existsSync(orderPath)
    ? parseLorebookOrder(fs.readFileSync(orderPath, 'utf-8'))
    : null;

  if (files.length === 0 && (!declaredOrder || declaredOrder.length === 0)) {
    return;
  }

  // Use canonical assembler contract for ordering and folder reconstruction
  // Folder entries are derived from parent directory paths in declaredOrder
  const collection = assembleLorebookCollection(files, declaredOrder);
  injectLorebooksIntoModule(moduleObj, collection, 'module');
}

function mergeRegex(moduleObj: Record<string, unknown>, inRoot: string): void {
  const regexDir = path.join(inRoot, 'regex');
  if (!isDir(regexDir)) {
    return;
  }

  const orderedFiles = resolveDeclaredOrder(regexDir, listFilesRecursiveBySuffix(regexDir, '.risuregex'));
  const content = orderedFiles.map((absolutePath) => parseRegexContent(fs.readFileSync(absolutePath, 'utf-8')));
  injectRegexIntoModule(moduleObj, content, 'module');
}

function mergeLua(moduleObj: Record<string, unknown>, inRoot: string): void {
  const luaDir = path.join(inRoot, 'lua');
  if (!isDir(luaDir)) {
    return;
  }

  const sources = listFilesRecursiveBySuffix(luaDir, '.risulua').map((absolutePath) => ({
    target: 'module' as const,
    source: toPosix(path.relative(inRoot, absolutePath)),
    content: parseLuaContent(fs.readFileSync(absolutePath, 'utf-8')),
  }));

  if (sources.length === 0) {
    injectLuaIntoModule(moduleObj, null, 'module');
    return;
  }

  const resolved = resolveDuplicateLuaSources(sources);
  injectLuaIntoModule(moduleObj, resolved.content, 'module');
}

function mergeVariables(moduleObj: Record<string, unknown>, inRoot: string): void {
  const variablesDir = path.join(inRoot, 'variables');
  if (!isDir(variablesDir)) {
    return;
  }

  const sources = listFilesRecursiveBySuffix(variablesDir, '.risuvar').map((absolutePath) => ({
    target: 'module' as const,
    source: toPosix(path.relative(inRoot, absolutePath)),
    content: parseVariableContent(fs.readFileSync(absolutePath, 'utf-8')),
  }));

  if (sources.length === 0) {
    injectVariablesIntoModule(moduleObj, null, 'module');
    return;
  }

  const resolved = resolveDuplicateVariableSources(sources);
  injectVariablesIntoModule(moduleObj, resolved.content, 'module');
}

function mergeBackgroundHtml(moduleObj: Record<string, unknown>, inRoot: string): void {
  const htmlDir = path.join(inRoot, 'html');
  if (!isDir(htmlDir)) {
    return;
  }

  const sources = listFilesRecursiveBySuffix(htmlDir, '.risuhtml').map((absolutePath) => ({
    target: 'module' as const,
    source: toPosix(path.relative(inRoot, absolutePath)),
    content: parseHtmlContent(fs.readFileSync(absolutePath, 'utf-8')),
  }));

  if (sources.length === 0) {
    injectHtmlIntoModule(moduleObj, null, 'module');
    return;
  }

  const resolved = resolveDuplicateHtmlSources(sources);
  injectHtmlIntoModule(moduleObj, resolved.content, 'module');
}

function mergeToggle(
  moduleObj: Record<string, unknown>,
  inRoot: string,
): void {
  const toggleDir = path.join(inRoot, 'toggle');
  const sources = isDir(toggleDir)
    ? listFilesRecursiveBySuffix(toggleDir, '.risutoggle').map((absolutePath) => ({
        target: 'module' as const,
        source: toPosix(path.relative(inRoot, absolutePath)),
        content: parseToggleContent(fs.readFileSync(absolutePath, 'utf-8')),
      }))
    : [];

  if (sources.length === 0) {
    injectToggleIntoModule(moduleObj, null, 'module');
    return;
  }

  const resolved = resolveDuplicateToggleSources(sources);
  injectToggleIntoModule(moduleObj, resolved.content, 'module');
}

function mergeAssets(moduleObj: Record<string, unknown>, inRoot: string): ModuleAssetsResult {
  const assetDir = path.join(inRoot, 'assets');
  const manifestPath = path.join(assetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { tuples: [], buffers: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as unknown;
  if (!isPlainObject(parsed) || !Array.isArray(parsed.assets)) {
    throw new Error(`잘못된 assets/manifest.json 형식: ${manifestPath}`);
  }

  const entries = [...parsed.assets]
    .filter(isPlainObject)
    .filter((entry) => Number.isFinite(entry.index))
    .sort((left, right) => Number(left.index) - Number(right.index));
  const tuples: Array<[string | null, string | null, string | null]> = [];
  const buffers: Array<Buffer | null> = [];

  for (const entry of entries) {
    tuples.push([
      typeof entry.name === 'string' ? entry.name : null,
      typeof entry.uri === 'string' ? entry.uri : null,
      typeof entry.type === 'string' ? entry.type : null,
    ]);

    if (typeof entry.extracted_path === 'string' && entry.extracted_path.length > 0) {
      const assetPath = path.join(assetDir, entry.extracted_path);
      buffers.push(fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : null);
    } else {
      buffers.push(null);
    }
  }

  if (tuples.length > 0) {
    moduleObj.assets = tuples;
  }

  return { tuples, buffers };
}

function resolveDeclaredOrder(rootDir: string, files: string[]): string[] {
  const sortedFiles = [...files].sort((left, right) =>
    toPosix(path.relative(rootDir, left)).localeCompare(toPosix(path.relative(rootDir, right))),
  );
  const orderPath = path.join(rootDir, '_order.json');
  if (!fs.existsSync(orderPath)) {
    return sortedFiles;
  }

  const parsed = JSON.parse(fs.readFileSync(orderPath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`잘못된 _order.json 형식: ${orderPath}`);
  }

  const fileMap = new Map<string, string>();
  for (const filePath of sortedFiles) {
    fileMap.set(toPosix(path.relative(rootDir, filePath)), filePath);
  }

  const ordered: string[] = [];
  for (const relativePath of parsed) {
    if (typeof relativePath !== 'string') {
      continue;
    }

    const normalized = toPosix(relativePath);
    const absolutePath = fileMap.get(normalized);
    if (!absolutePath) {
      continue;
    }

    ordered.push(absolutePath);
    fileMap.delete(normalized);
  }

  return [...ordered, ...[...fileMap.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([, absolutePath]) => absolutePath)];
}

function listFilesRecursiveBySuffix(rootDir: string, suffix: string): string[] {
  if (!isDir(rootDir)) {
    return [];
  }

  const out: string[] = [];
  const walk = (currentDir: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix)) {
        out.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return out;
}

function encodeModuleRisumWithAssets(
  moduleObj: Record<string, unknown>,
  assetBuffers: Array<Buffer | null>,
): Buffer {
  if (assetBuffers.some((buffer) => buffer === null)) {
    throw new Error('module.risum 생성에는 모든 assets/manifest.json 항목의 extracted_path가 필요합니다.');
  }

  const payload = Buffer.from(
    JSON.stringify({ module: moduleObj, type: 'risuModule' }, null, 2),
    'utf-8',
  );
  const encodedMain = encodeRPack(payload);
  const out: Buffer[] = [];
  out.push(Buffer.from([111, 0]));
  out.push(encodeLength(encodedMain.length));
  out.push(encodedMain);

  for (const buffer of assetBuffers) {
    const encodedAsset = encodeRPack(buffer!);
    out.push(Buffer.from([1]));
    out.push(encodeLength(encodedAsset.length));
    out.push(encodedAsset);
  }

  out.push(Buffer.from([0]));
  return Buffer.concat(out);
}

function encodeLength(length: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(length, 0);
  return buffer;
}

function isDir(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
