import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';
import { ensureDir } from '@/node/fs-helpers';
import {
  PNG_1X1_TRANSPARENT,
  JPEG_1X1,
  writePngTextChunks,
  isPng,
  isJpeg,
} from '@/node/png';
import { encodeModuleRisum } from '@/node/rpack';
import { readJson, isDir } from '@/node/json-listing';
import { toPosix } from '@/domain/lorebook/folders';
import { sanitizeFilename } from '../../../utils/filenames';
import { argValue, setNestedValue, classifyAssetExt, normalizeExt } from '../utils';
import { createBlankCharxV3 } from '@/domain/charx/blank-char';
import {
  parseLorebookContent,
  parseLorebookOrder,
  assembleLorebookCollection,
  injectLorebooksIntoCharx,
  type LorebookCanonicalFile,
} from '@/domain/custom-extension/extensions/lorebook';
import {
  parseRegexContent,
  injectRegexIntoCharx,
  type CanonicalRegexEntry,
} from '@/domain/regex';
import {
  parseVariableContent,
} from '@/domain/custom-extension/extensions/variable';
import {
  parseHtmlContent,
  injectHtmlIntoCharx,
} from '@/domain/custom-extension/extensions/html';
import {
  parseLuaContent,
} from '@/domain/custom-extension/extensions/lua';

const HELP_TEXT = `
  🐿️ RisuAI Character Card Packer (canonical mode)

  Usage: node pack.js [options]

  Options:
    --in <dir>          입력 디렉토리 (기본: .)
    --out <path|dir>    출력 파일 경로 또는 디렉토리
    --format <type>     png | charx | charx-jpg (기본: assets/manifest.json 기반 auto)
    --cover <file>      커버 이미지 경로 (png 또는 jpg)
    --name <name>       출력 파일명 기본값 (확장자 제외)
    -h, --help          도움말

  Notes (canonical mode):
    - charx.json is NOT required — pack builds from createBlankChar() + canonical overlays
    - lorebooks/*.risulorebook → character_book.entries
    - regex/*.risuregex → extensions.risuai.customScripts
    - lua/<charxName>.risulua → triggerscript (target-name-based naming)
    - html/background.risuhtml → extensions.risuai.backgroundHTML
    - variables/<charxName>.risuvar → extensions.risuai.defaultVariables (target-name-based naming)
    - .risuchar, character/*.risutext → character fields
    - character/*.txt, metadata.json → legacy fallback-only character fields
    - .risutoggle is NOT supported for charx (module/preset only)
    - 현재는 chara_card_v3만 지원합니다.
    - cover를 지정하지 않으면 png/jpg는 1x1 fallback 이미지를 사용합니다.
`;

type PackFormat = 'png' | 'charx' | 'charx-jpg';

interface PackOptions {
  inDir: string;
  outArg: string | null;
  formatArg: string;
  coverArg: string | null;
  nameArg: string | null;
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
    formatArg: (argValue(argv, '--format') || '').toLowerCase(),
    coverArg: argValue(argv, '--cover'),
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

function runMain(options: PackOptions): void {
  const resolvedIn = path.resolve(options.inDir);

  console.log('\n  🐿️ RisuAI Character Card Packer (canonical mode)\n');
  console.log(`  입력: ${path.relative('.', resolvedIn)}`);

  // Build charx from createBlankChar() + canonical overlays
  const charx = buildCharxFromCanonical(resolvedIn);

  const targetFormat = resolveTargetFormat(resolvedIn, options.formatArg);
  const { outPath, baseName } = resolveOutputPath({
    inRoot: resolvedIn,
    outArg: options.outArg,
    nameArg: options.nameArg,
    charx,
    format: targetFormat,
  });
  ensureDir(path.dirname(outPath));

  if (targetFormat === 'png') {
    const pngBuf = buildPngCharxBuffer(charx, resolvedIn, options.coverArg);
    fs.writeFileSync(outPath, pngBuf);
  } else if (targetFormat === 'charx') {
    const charxBuf = buildCharxBuffer(charx, resolvedIn);
    fs.writeFileSync(outPath, charxBuf);
  } else if (targetFormat === 'charx-jpg') {
    const charxBuf = buildCharxBuffer(charx, resolvedIn);
    const jpegCover = resolveCoverBytes(resolvedIn, options.coverArg, ['.jpg', '.jpeg'], JPEG_1X1);
    fs.writeFileSync(outPath, Buffer.concat([jpegCover, charxBuf]));
  } else {
    throw new Error(`지원하지 않는 format: ${targetFormat}`);
  }

  console.log(`\n  ✅ 패킹 완료 (${targetFormat}) → ${path.relative('.', outPath)}`);
  console.log(`  출력 이름: ${baseName}\n`);
}

/**
 * Build charx from createBlankChar() + canonical artifact overlays.
 * This is the canonical pack mode — no charx.json required.
 */
function buildCharxFromCanonical(inRoot: string): any {
  // Start with blank charx V3 envelope
  const charx = createBlankCharxV3();

  // Clear default trigger stubs from blank char — they should only be
  // set if canonical workspace explicitly provides lua/triggerscript.risulua
  clearDefaultTriggerStubs(charx);

  // Overlay canonical artifacts
  mergeCharacterExtensionSidecar(charx, inRoot);
  // IMPORTANT: mergeCharacterCanonical MUST run first to establish the character
  // name from .risuchar or legacy metadata.json, which is required for target-name-based filename
  // resolution in mergeLuaCanonical and mergeVariablesCanonical
  mergeCharacterCanonical(charx, inRoot);
  mergeLorebooksCanonical(charx, inRoot);
  mergeRegexCanonical(charx, inRoot);
  mergeLuaCanonical(charx, inRoot);
  mergeHtmlCanonical(charx, inRoot);
  mergeVariablesCanonical(charx, inRoot);
  mergeAssetsCanonical(charx, inRoot);

  return charx;
}

/**
 * mergeCharacterExtensionSidecar 함수.
 * Extract가 보존한 unknown extension namespace를 canonical overlays 전에 복원함.
 *
 * @param charx - CharX envelope being assembled
 * @param inRoot - Character workspace root containing character/extensions.json
 */
function mergeCharacterExtensionSidecar(charx: any, inRoot: string): void {
  const sidecarPath = path.join(inRoot, 'character', 'extensions.json');
  if (!fs.existsSync(sidecarPath)) return;

  const sidecar: unknown = readJson(sidecarPath);
  if (!isPlainRecord(sidecar)) {
    throw new Error(`잘못된 character/extensions.json 형식: ${sidecarPath}`);
  }

  if (!charx.data) charx.data = {};
  if (!charx.data.extensions) charx.data.extensions = {};
  if (!charx.data.extensions.risuai) charx.data.extensions.risuai = {};

  for (const [namespace, namespaceValue] of Object.entries(sidecar)) {
    if (namespace === 'risuai' && isPlainRecord(namespaceValue)) {
      Object.assign(charx.data.extensions.risuai, namespaceValue);
      continue;
    }
    charx.data.extensions[namespace] = namespaceValue;
  }
}

/**
 * mergeAssetsCanonical 함수.
 * assets/manifest.json의 asset metadata를 CharX asset 배열로 복원함.
 *
 * @param charx - CharX envelope receiving asset metadata
 * @param inRoot - Character workspace root containing assets/manifest.json
 */
function mergeAssetsCanonical(charx: any, inRoot: string): void {
  const manifestPath = path.join(inRoot, 'assets', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;

  const manifest: unknown = readJson(manifestPath);
  if (!isPlainRecord(manifest) || !Array.isArray(manifest.assets)) return;

  const assets: any[] = [];
  for (const record of manifest.assets) {
    if (!isPlainRecord(record) || !Number.isInteger(record.index)) continue;
    const assetIndex = Number(record.index);

    const asset: Record<string, unknown> = {};
    for (const key of ['type', 'name', 'ext'] as const) {
      if (typeof record[key] === 'string') asset[key] = record[key];
    }

    if (typeof record.original_uri === 'string' && record.original_uri.length > 0) {
      asset.uri = record.original_uri;
    } else if (typeof record.extracted_path === 'string' && record.extracted_path.length > 0) {
      asset.uri = `embeded://${toPosix(record.extracted_path)}`;
    }

    assets[assetIndex] = asset;
  }

  if (assets.length === 0) return;
  if (!charx.data) charx.data = {};
  charx.data.assets = assets;
}

/**
 * Clear default trigger stubs from blank charx.
 * The createBlankChar() function creates default triggerscript entries that
 * should not leak into packed output unless canonical workspace explicitly
 * provides lua/triggerscript.risulua.
 */
function clearDefaultTriggerStubs(charx: any): void {
  if (!charx.data) charx.data = {};
  if (!charx.data.extensions) charx.data.extensions = {};
  if (!charx.data.extensions.risuai) charx.data.extensions.risuai = {};

  // Clear the default triggerscript array — it will be set by mergeLuaCanonical
  // if lua/triggerscript.risulua exists, otherwise should remain empty
  charx.data.extensions.risuai.triggerscript = [];
}

/**
 * Merge canonical lorebooks from .risulorebook files.
 * Uses the canonical assembler contract (assembleLorebookCollection) for
 * proper ordering and folder reconstruction from path-based _order.json.
 * Folder keys are regenerated at pack time from directory paths.
 */
function mergeLorebooksCanonical(charx: any, inRoot: string): void {
  const loreDir = path.join(inRoot, 'lorebooks');
  if (!isDir(loreDir)) return;

  // Read _order.json for file and folder ordering
  const orderPath = path.join(loreDir, '_order.json');
  let declaredOrder: string[] | null = null;
  if (fs.existsSync(orderPath)) {
    try {
      declaredOrder = parseLorebookOrder(fs.readFileSync(orderPath, 'utf-8'));
    } catch {
      console.warn('  ⚠️ Failed to parse _order.json, using file discovery');
    }
  }

  // Discover all .risulorebook files recursively
  const lorebookFiles = listFilesRecursiveBySuffix(loreDir, '.risulorebook');
  if (lorebookFiles.length === 0 && (!declaredOrder || declaredOrder.length === 0)) return;

  // Build canonical file list with relative paths
  const files: LorebookCanonicalFile[] = lorebookFiles.map((absolutePath) => ({
    relativePath: toPosix(path.relative(loreDir, absolutePath)),
    content: parseLorebookContent(fs.readFileSync(absolutePath, 'utf-8')),
  }));

  // Use canonical assembler contract for ordering and folder reconstruction
  // Folder entries are derived from parent directory paths in declaredOrder
  const collection = assembleLorebookCollection(files, declaredOrder);

  // Inject into charx
  injectLorebooksIntoCharx(charx, collection, 'charx');
}

/**
 * Merge canonical regex from .risuregex files.
 */
function mergeRegexCanonical(charx: any, inRoot: string): void {
  const regexDir = path.join(inRoot, 'regex');
  if (!isDir(regexDir)) return;

  // Read _order.json for file ordering
  const orderPath = path.join(regexDir, '_order.json');
  let orderedFiles: string[] = [];
  if (fs.existsSync(orderPath)) {
    try {
      const orderContent = readJson(orderPath) as string[];
      if (Array.isArray(orderContent)) {
        orderedFiles = orderContent;
      }
    } catch {
      console.warn('  ⚠️ Failed to parse regex _order.json');
    }
  }

  // Discover all .risuregex files (not JSON files)
  const allFiles = fs
    .readdirSync(regexDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.risuregex'))
    .map((entry) => path.join(regexDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const filesToProcess = orderedFiles.length > 0
    ? orderedFiles.map((rel) => path.join(regexDir, rel)).filter((f) => fs.existsSync(f))
    : allFiles;

  if (filesToProcess.length === 0) return;

  // Parse regex files
  const regexes: CanonicalRegexEntry[] = [];
  for (const filePath of filesToProcess) {
    try {
      const content = parseRegexContent(fs.readFileSync(filePath, 'utf-8'));
      regexes.push(content);
    } catch (error) {
      console.warn(`  ⚠️ Failed to parse regex: ${path.basename(filePath)}`);
    }
  }

  // Inject into charx
  injectRegexIntoCharx(charx, regexes, 'charx');
}

/**
 * Merge canonical Lua from .risulua file.
 * Note: The canonical .risulua contains raw Lua code, but upstream charx
 * expects triggerscript as an array of trigger objects. We wrap the Lua
 * code in a standard trigger structure for round-trip compatibility.
 * Uses target-name-based file naming: lua/<charxName>.risulua
 */
function mergeLuaCanonical(charx: any, inRoot: string): void {
  // Determine the expected lua filename based on character name
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const luaPath = path.join(inRoot, 'lua', `${sanitizedName}.risulua`);

  if (!fs.existsSync(luaPath)) return;

  try {
    const luaCode = parseLuaContent(fs.readFileSync(luaPath, 'utf-8'));
    // Ensure the extensions.risuai structure exists
    if (!charx.data) charx.data = {};
    if (!charx.data.extensions) charx.data.extensions = {};
    if (!charx.data.extensions.risuai) charx.data.extensions.risuai = {};

    // Wrap Lua code in proper triggerscript array structure
    // This maintains compatibility with buildModuleFromCharx() which expects
    // triggerscript to be an array it can pass to module.risum
    charx.data.extensions.risuai.triggerscript = [
      {
        comment: 'Canonical Lua Trigger',
        type: 'manual',
        conditions: [],
        effect: [
          {
            type: 'triggerlua',
            code: luaCode,
            indent: 0,
          },
        ],
      },
    ];
  } catch (error) {
    console.warn(`  ⚠️ Failed to parse ${sanitizedName}.risulua`);
  }
}

/**
 * Merge canonical HTML from .risuhtml file.
 */
function mergeHtmlCanonical(charx: any, inRoot: string): void {
  const htmlPath = path.join(inRoot, 'html', 'background.risuhtml');
  if (!fs.existsSync(htmlPath)) return;

  try {
    const content = parseHtmlContent(fs.readFileSync(htmlPath, 'utf-8'));
    injectHtmlIntoCharx(charx, content, 'charx');
  } catch (error) {
    console.warn('  ⚠️ Failed to parse background.risuhtml');
  }
}

/**
 * Merge canonical variables from .risuvar file.
 * Uses target-name-based file naming: variables/<charxName>.risuvar
 */
function mergeVariablesCanonical(charx: any, inRoot: string): void {
  // Determine the expected variables filename based on character name
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const varPath = path.join(inRoot, 'variables', `${sanitizedName}.risuvar`);

  if (!fs.existsSync(varPath)) return;

  try {
    const content = parseVariableContent(fs.readFileSync(varPath, 'utf-8'));
    // Ensure the extensions.risuai structure exists
    if (!charx.data) charx.data = {};
    if (!charx.data.extensions) charx.data.extensions = {};
    if (!charx.data.extensions.risuai) charx.data.extensions.risuai = {};
    // Convert variables object to string format
    const varLines = Object.entries(content).map(([key, value]) => `${key}=${value}`);
    charx.data.extensions.risuai.defaultVariables = varLines.join('\n') + (varLines.length > 0 ? '\n' : '');
  } catch (error) {
    console.warn(`  ⚠️ Failed to parse ${sanitizedName}.risuvar`);
  }
}

/**
 * mergeCharacterCanonical 함수.
 * Merge canonical character metadata and prose with legacy split files as fallback only.
 *
 * @param charx - CharX envelope being assembled from canonical workspace files
 * @param inRoot - Character workspace root containing .risuchar and character artifacts
 * Note: .risutoggle is NOT supported for charx (module/preset only per spec).
 */
function mergeCharacterCanonical(charx: any, inRoot: string): void {
  const characterDir = path.join(inRoot, 'character');
  const hasCharacterDir = isDir(characterDir);

  mergeCharacterMetadata(charx, inRoot, characterDir);

  if (!hasCharacterDir) return;

  const textFieldMap: Record<string, string[]> = {
    description: ['data', 'description'],
    first_mes: ['data', 'first_mes'],
    system_prompt: ['data', 'system_prompt'],
    replace_global_note: ['data', 'replaceGlobalNote'],
    creator_notes: ['data', 'creator_notes'],
    additional_text: ['data', 'extensions', 'risuai', 'additionalText'],
  };

  for (const [fieldName, targetPath] of Object.entries(textFieldMap)) {
    const canonicalPath = path.join(characterDir, `${fieldName}.risutext`);
    const legacyPath = path.join(characterDir, `${fieldName}.txt`);
    const hasCanonical = fs.existsSync(canonicalPath);
    const hasLegacy = fs.existsSync(legacyPath);

    if (hasCanonical) {
      if (hasLegacy) {
        warnCanonicalConflict(`${fieldName}.risutext`, `${fieldName}.txt`);
      }
      setNestedValue(charx, targetPath, fs.readFileSync(canonicalPath, 'utf-8'));
      continue;
    }

    if (hasLegacy) {
      setNestedValue(charx, targetPath, fs.readFileSync(legacyPath, 'utf-8'));
    }
  }

  const canonicalGreetingsDir = path.join(characterDir, 'alternate_greetings');
  const legacyGreetingsPath = path.join(characterDir, 'alternate_greetings.json');
  if (isDir(canonicalGreetingsDir)) {
    if (fs.existsSync(legacyGreetingsPath)) {
      warnCanonicalConflict('alternate_greetings/', 'alternate_greetings.json');
    }
    charx.data.alternate_greetings = readCanonicalAlternateGreetings(canonicalGreetingsDir);
  } else if (fs.existsSync(legacyGreetingsPath)) {
    const greetings = readJson(legacyGreetingsPath);
    if (!Array.isArray(greetings)) {
      throw new Error(`잘못된 alternate_greetings.json 형식: ${legacyGreetingsPath}`);
    }
    charx.data.alternate_greetings = greetings;
  }

  // Note: module.risutoggle is NOT read for charx per spec
  // .risutoggle is module/preset only
}

/**
 * mergeCharacterMetadata 함수.
 * Read root .risuchar first and use legacy metadata.json only when absent.
 *
 * @param charx - CharX envelope receiving metadata fields
 * @param inRoot - Character workspace root containing .risuchar
 * @param characterDir - Legacy character directory containing metadata.json
 */
function mergeCharacterMetadata(charx: any, inRoot: string, characterDir: string): void {
  const manifestPath = path.join(inRoot, '.risuchar');
  const metadataPath = path.join(characterDir, 'metadata.json');
  const hasManifest = fs.existsSync(manifestPath);
  const hasLegacyMetadata = fs.existsSync(metadataPath);

  if (hasManifest) {
    if (hasLegacyMetadata) {
      warnCanonicalConflict('.risuchar', 'metadata.json');
    }

    const manifest: unknown = readJson(manifestPath);
    if (!isPlainRecord(manifest)) {
      throw new Error(`잘못된 .risuchar 형식: ${manifestPath}`);
    }

    const stringManifestFields: Record<string, string[]> = {
      name: ['data', 'name'],
      creator: ['data', 'creator'],
      characterVersion: ['data', 'character_version'],
      createdAt: ['data', 'creation_date'],
      modifiedAt: ['data', 'modification_date'],
    };

    for (const [key, targetPath] of Object.entries(stringManifestFields)) {
      if (typeof manifest[key] === 'string' || manifest[key] === null) {
        setNestedValue(charx, targetPath, manifest[key]);
      }
    }

    const flags = manifest.flags;
    if (isPlainRecord(flags)) {
      if (typeof flags.utilityBot === 'boolean') {
        charx.data.extensions.risuai.utilityBot = flags.utilityBot;
      }
      if (typeof flags.lowLevelAccess === 'boolean') {
        charx.data.extensions.risuai.lowLevelAccess = flags.lowLevelAccess;
      }
    }

    return;
  }

  if (!fs.existsSync(metadataPath)) return;

  const metadata: unknown = readJson(metadataPath);
  if (!isPlainRecord(metadata)) {
    throw new Error(`잘못된 metadata.json 형식: ${metadataPath}`);
  }

  const stringMetadataFields: Record<string, string[]> = {
    name: ['data', 'name'],
    creator: ['data', 'creator'],
    character_version: ['data', 'character_version'],
    creation_date: ['data', 'creation_date'],
    modification_date: ['data', 'modification_date'],
  };

  for (const [key, targetPath] of Object.entries(stringMetadataFields)) {
    if (typeof metadata[key] === 'string' || metadata[key] === null) {
      setNestedValue(charx, targetPath, metadata[key]);
    }
  }

  if (typeof metadata.utilityBot === 'boolean') {
    charx.data.extensions.risuai.utilityBot = metadata.utilityBot;
  }
  if (typeof metadata.lowLevelAccess === 'boolean') {
    charx.data.extensions.risuai.lowLevelAccess = metadata.lowLevelAccess;
  }
}

/**
 * readCanonicalAlternateGreetings 함수.
 * Read ordered canonical alternate greeting .risutext files from a directory.
 *
 * @param greetingsDir - Directory containing greeting .risutext files and optional _order.json
 * @returns Greeting texts in declared order followed by deterministic filename sort
 */
function readCanonicalAlternateGreetings(greetingsDir: string): string[] {
  const orderPath = path.join(greetingsDir, '_order.json');
  let orderedFiles: string[] = [];

  if (fs.existsSync(orderPath)) {
    const parsedOrder = readJson(orderPath);
    if (!Array.isArray(parsedOrder) || parsedOrder.some((entry) => typeof entry !== 'string')) {
      throw new Error(`잘못된 alternate_greetings/_order.json 형식: ${orderPath}`);
    }
    orderedFiles = parsedOrder;
  }

  const allFiles = fs
    .readdirSync(greetingsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.risutext'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const seen = new Set<string>();
  const resolvedFiles: string[] = [];

  for (const relativeName of orderedFiles) {
    const normalizedName = validateGreetingOrderEntry(relativeName, orderPath);
    const absolutePath = path.join(greetingsDir, normalizedName);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`alternate_greetings/_order.json에 없는 파일이 지정되었습니다: ${relativeName}`);
    }
    if (!normalizedName.endsWith('.risutext')) {
      throw new Error(`alternate_greetings/_order.json 항목은 .risutext 파일이어야 합니다: ${relativeName}`);
    }
    if (!seen.has(normalizedName)) {
      seen.add(normalizedName);
      resolvedFiles.push(normalizedName);
    }
  }

  for (const fileName of allFiles) {
    if (seen.has(fileName)) continue;
    resolvedFiles.push(fileName);
  }

  return resolvedFiles.map((fileName) => fs.readFileSync(path.join(greetingsDir, fileName), 'utf-8'));
}

/**
 * validateGreetingOrderEntry 함수.
 * Keep alternate greeting order entries relative to their canonical directory.
 *
 * @param relativeName - _order.json entry to validate
 * @param orderPath - Path used in error messages
 * @returns Normalized relative filename
 */
function validateGreetingOrderEntry(relativeName: string, orderPath: string): string {
  const normalizedName = toPosix(path.normalize(relativeName));
  if (
    path.isAbsolute(relativeName) ||
    normalizedName.startsWith('../') ||
    normalizedName === '..' ||
    normalizedName.includes('/../') ||
    normalizedName.includes('/')
  ) {
    throw new Error(`잘못된 alternate_greetings/_order.json 경로: ${orderPath}`);
  }
  return normalizedName;
}

/**
 * warnCanonicalConflict 함수.
 * Emit pack-local warning when canonical and legacy sources target the same field.
 *
 * @param canonicalSource - Canonical source path that wins
 * @param legacySource - Legacy source path ignored for the same field
 */
function warnCanonicalConflict(canonicalSource: string, legacySource: string): void {
  console.warn(`  ⚠️ canonical ${canonicalSource} wins over legacy ${legacySource}; legacy value ignored`);
}

/**
 * isPlainRecord 함수.
 * Check that parsed JSON is an object record rather than null or an array.
 *
 * @param value - Parsed JSON value to check
 * @returns True when value is a plain object-like record
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveTargetFormat(inRoot: string, formatArgValue: string): PackFormat {
  if (['png', 'charx', 'charx-jpg'].includes(formatArgValue)) return formatArgValue as PackFormat;

  const manifestPath = path.join(inRoot, 'assets', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = readJson(manifestPath) as any;
      if (manifest.source_format === 'png') return 'png';
      if (manifest.source_format === 'charx') return 'charx';
    } catch {
      // manifest read failure — fall through to default
    }
  }

  return 'charx';
}

function resolveOutputPath(params: {
  inRoot: string;
  outArg: string | null;
  nameArg: string | null;
  charx: any;
  format: PackFormat;
}): { outPath: string; baseName: string } {
  const defaultBase = sanitizeFilename(
    params.nameArg || params.charx.data?.name || 'character',
    'character',
  );
  const ext = params.format === 'png' ? '.png' : params.format === 'charx-jpg' ? '.jpg' : '.charx';
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

function buildPngCharxBuffer(charx: any, inRoot: string, coverArgPath: string | null): Buffer {
  const work = structuredClone(charx);
  const assetBlobs = collectAssetBuffers(work, inRoot);

  let cover = resolveCoverBytes(inRoot, coverArgPath, ['.png'], PNG_1X1_TRANSPARENT, {
    allowFromAsset: true,
    charx: work,
    assetBlobs,
  });

  if (!isPng(cover)) {
    console.warn('  ⚠️ PNG 커버를 찾지 못해 1x1 투명 PNG를 사용합니다.');
    cover = PNG_1X1_TRANSPARENT;
  }

  const chunks: Array<{ key: string; value: string }> = [];
  let idx = 0;
  for (const asset of work.data.assets || []) {
    idx += 1;
    if (!asset || typeof asset !== 'object') continue;

    const uri = typeof asset.uri === 'string' ? asset.uri : '';
    if (
      uri === 'ccdefault:' ||
      uri.startsWith('http://') ||
      uri.startsWith('https://') ||
      uri.startsWith('data:')
    )
      continue;

    const blob = assetBlobs.get(idx);
    if (!blob) continue;

    asset.uri = `__asset:${idx}`;
    chunks.push({ key: `chara-ext-asset_:${idx}`, value: blob.toString('base64') });
  }

  chunks.unshift({
    key: 'ccv3',
    value: Buffer.from(JSON.stringify(work), 'utf-8').toString('base64'),
  });
  return writePngTextChunks(cover, chunks);
}

function buildCharxBuffer(charx: any, inRoot: string): Buffer {
  const work = structuredClone(charx);
  const assetBlobs = collectAssetBuffers(work, inRoot);
  const zipEntries: Record<string, Uint8Array | Buffer> = {};
  const usedPaths = new Set<string>();

  const assets = Array.isArray(work.data.assets) ? work.data.assets : [];
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    if (!asset || typeof asset !== 'object') continue;

    const idx = i + 1;
    const blob = assetBlobs.get(idx);
    if (!blob) continue;

    const uri = typeof asset.uri === 'string' ? asset.uri : '';
    if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:'))
      continue;

    const assetType = sanitizeFilename(asset.type || 'asset', 'asset').toLowerCase();
    const extClass = classifyAssetExt(asset.ext || 'bin');
    const ext = normalizeExt(asset.ext || 'bin');
    const stem = sanitizeFilename(asset.name || `asset_${idx}`, `asset_${idx}`);

    let rel = `assets/${assetType}/${extClass}/${stem}.${ext}`;
    let serial = 1;
    while (usedPaths.has(rel)) {
      rel = `assets/${assetType}/${extClass}/${stem}_${serial}.${ext}`;
      serial += 1;
    }
    usedPaths.add(rel);

    asset.uri = `embeded://${toPosix(rel)}`;
    zipEntries[toPosix(rel)] = new Uint8Array(blob);
  }

  const moduleObj = buildModuleFromCharx(work);
  // Note: We do NOT delete triggerscript/customScripts/_moduleLorebook from charx.json
  // The module.risum is built from charx data, but charx.json retains all fields for round-trip fidelity

  zipEntries['charx.json'] = Buffer.from(`${JSON.stringify(work, null, 2)}\n`, 'utf-8');
  zipEntries['module.risum'] = encodeModuleRisum(moduleObj);

  return Buffer.from(zipSync(zipEntries, { level: 0 }));
}

/**
 * Build module.risum content from charx data.
 * Note: customModuleToggle is NOT included for charx per spec (.risutoggle is module/preset only).
 */
function buildModuleFromCharx(charx: any): Record<string, unknown> {
  const name = charx.data?.name || 'Character';
  const risu = charx.data?.extensions?.risuai || {};
  return {
    name: `${name} Module`,
    description: `Module for ${name}`,
    id: crypto.randomUUID(),
    trigger: Array.isArray(risu.triggerscript) ? risu.triggerscript : [],
    regex: Array.isArray(risu.customScripts) ? risu.customScripts : [],
    lorebook: Array.isArray(risu._moduleLorebook) ? risu._moduleLorebook : [],
    // Note: customModuleToggle is NOT included for charx per spec
    assets: [],
  };
}

function collectAssetBuffers(charx: any, inRoot: string): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  const assetDir = path.join(inRoot, 'assets');
  const manifestPath = path.join(assetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return out;

  const manifest = readJson(manifestPath) as any;
  if (!manifest || !Array.isArray(manifest.assets)) return out;

  for (const rec of manifest.assets) {
    if (!rec || typeof rec !== 'object') continue;
    if (!Number.isFinite(rec.index)) continue;
    if (typeof rec.extracted_path !== 'string' || rec.extracted_path.length === 0) continue;

    const filePath = path.join(assetDir, rec.extracted_path);
    if (!fs.existsSync(filePath)) continue;
    out.set(Number(rec.index) + 1, fs.readFileSync(filePath));
  }

  for (let i = 0; i < (charx.data.assets || []).length; i += 1) {
    const idx = i + 1;
    if (out.has(idx)) continue;
    const asset = charx.data.assets[i];
    if (!asset || typeof asset.uri !== 'string') continue;

    if (asset.uri.startsWith('embeded://') || asset.uri.startsWith('embedded://')) {
      const rel = asset.uri.replace(/^embeded:\/\//, '').replace(/^embedded:\/\//, '');
      const absolute = path.join(inRoot, rel);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        out.set(idx, fs.readFileSync(absolute));
      }
    }
  }

  return out;
}

/**
 * Recursively list files with given suffix in a directory.
 */
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

function resolveCoverBytes(
  inRoot: string,
  coverArgPath: string | null,
  exts: string[],
  fallback: Buffer,
  opts: { allowFromAsset?: boolean; charx?: any; assetBlobs?: Map<number, Buffer> } = {},
): Buffer {
  if (coverArgPath) {
    const abs = path.resolve(coverArgPath);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const ext = path.extname(abs).toLowerCase();
      if (exts.includes(ext)) return fs.readFileSync(abs);
      console.warn(`  ⚠️ cover 확장자가 기대와 다릅니다 (${ext}) — fallback 사용`);
    } else {
      console.warn(`  ⚠️ cover 파일을 찾을 수 없습니다: ${abs}`);
    }
  }

  const charx = opts.charx;
  const blobs = opts.assetBlobs;
  if (opts.allowFromAsset && charx && blobs) {
    const assets = Array.isArray(charx.data?.assets) ? charx.data.assets : [];
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      if (!asset || asset.type !== 'icon' || asset.name !== 'main') continue;
      const blob = blobs.get(i + 1);
      if (!blob) continue;
      if (
        exts.includes(
          `.${String(asset.ext || '')
            .toLowerCase()
            .replace(/^\./, '')}`,
        )
      )
        return blob;
      if (isPng(blob) && exts.includes('.png')) return blob;
      if (isJpeg(blob) && (exts.includes('.jpg') || exts.includes('.jpeg'))) return blob;
    }
  }

  const defaultCandidates = [
    path.join(inRoot, 'cover.png'),
    path.join(inRoot, 'cover.jpg'),
    path.join(inRoot, 'cover.jpeg'),
    path.join(inRoot, 'assets', 'cover.png'),
    path.join(inRoot, 'assets', 'cover.jpg'),
    path.join(inRoot, 'assets', 'cover.jpeg'),
  ];

  for (const candidate of defaultCandidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const ext = path.extname(candidate).toLowerCase();
    if (exts.includes(ext)) return fs.readFileSync(candidate);
  }

  return fallback;
}
