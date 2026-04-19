import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync, zip, type AsyncZippable } from 'fflate';
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
import { readFileAsync } from '@/node/fs-helpers';
import { createLimiter } from '../../shared/concurrency';
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
    - character/*.txt, metadata.json → character fields
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
  // IMPORTANT: mergeCharacterCanonical MUST run first to establish the character
  // name from metadata.json, which is required for target-name-based filename
  // resolution in mergeLuaCanonical and mergeVariablesCanonical
  mergeCharacterCanonical(charx, inRoot);
  mergeLorebooksCanonical(charx, inRoot);
  mergeRegexCanonical(charx, inRoot);
  mergeLuaCanonical(charx, inRoot);
  mergeHtmlCanonical(charx, inRoot);
  mergeVariablesCanonical(charx, inRoot);

  return charx;
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
 * Merge character fields from canonical text files and metadata.json.
 * Note: .risutoggle is NOT supported for charx (module/preset only per spec).
 */
function mergeCharacterCanonical(charx: any, inRoot: string): void {
  const characterDir = path.join(inRoot, 'character');
  if (!isDir(characterDir)) return;

  // Text fields as .txt files (canonical)
  const textFieldMap: Record<string, string[]> = {
    'description.txt': ['data', 'description'],
    'first_mes.txt': ['data', 'first_mes'],
    'system_prompt.txt': ['data', 'system_prompt'],
    'post_history_instructions.txt': ['data', 'post_history_instructions'],
    'creator_notes.txt': ['data', 'creator_notes'],
    'additional_text.txt': ['data', 'extensions', 'risuai', 'additionalText'],
  };

  for (const [fileName, targetPath] of Object.entries(textFieldMap)) {
    const filePath = path.join(characterDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    setNestedValue(charx, targetPath, fs.readFileSync(filePath, 'utf-8'));
  }

  // Alternate greetings as JSON
  const greetingsPath = path.join(characterDir, 'alternate_greetings.json');
  if (fs.existsSync(greetingsPath)) {
    const greetings = readJson(greetingsPath);
    if (!Array.isArray(greetings)) {
      throw new Error(`잘못된 alternate_greetings.json 형식: ${greetingsPath}`);
    }
    charx.data.alternate_greetings = greetings;
  }

  // Note: module.risutoggle is NOT read for charx per spec
  // .risutoggle is module/preset only

  // Metadata as JSON
  const metadataPath = path.join(characterDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) return;

  const metadata = readJson(metadataPath) as any;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
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

async function buildCharxBufferAsync(charx: any, inRoot: string): Promise<Buffer> {
  const work = structuredClone(charx);
  const assetBlobs = await collectAssetBuffersAsync(work, inRoot);
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

  const data = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipEntries as AsyncZippable, { level: 0 }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  return Buffer.from(data);
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

async function collectAssetBuffersAsync(charx: any, inRoot: string): Promise<Map<number, Buffer>> {
  const out = new Map<number, Buffer>();
  const assetDir = path.join(inRoot, 'assets');
  const manifestPath = path.join(assetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return out;

  const manifest = readJson(manifestPath) as any;
  if (!manifest || !Array.isArray(manifest.assets)) return out;

  // Collect valid file reads
  const readJobs: Array<{ index: number; filePath: string }> = [];
  for (const rec of manifest.assets) {
    if (!rec || typeof rec !== 'object') continue;
    if (!Number.isFinite(rec.index)) continue;
    if (typeof rec.extracted_path !== 'string' || rec.extracted_path.length === 0) continue;
    const filePath = path.join(assetDir, rec.extracted_path);
    if (!fs.existsSync(filePath)) continue;
    readJobs.push({ index: Number(rec.index) + 1, filePath });
  }

  // Parallel reads
  const limiter = createLimiter();
  const results = await limiter.map(readJobs, async (job) => ({
    index: job.index,
    data: await readFileAsync(job.filePath),
  }));

  for (const result of results) {
    out.set(result.index, result.data);
  }

  // Fallback for embedded assets not in manifest
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
