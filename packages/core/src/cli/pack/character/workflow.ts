import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';
import { ensureDir } from '../../../node/fs-helpers';
import {
  PNG_SIGNATURE,
  PNG_1X1_TRANSPARENT,
  JPEG_1X1,
  argValue,
  encodeModuleRisum,
  writePngTextChunks,
  readJson,
  setNestedValue,
  isDir,
  sanitizeFilename,
  classifyAssetExt,
  normalizeExt,
  toPosix,
  fromPosix,
  isPng,
  isJpeg,
  listJsonFilesRecursive,
  listJsonFilesFlat,
  resolveOrderedFiles,
} from '../shared';

const HELP_TEXT = `
  🐿️ RisuAI Character Card Packer

  Usage: node pack.js [options]

  Options:
    --in <dir>          입력 디렉토리 (기본: .)
    --out <path|dir>    출력 파일 경로 또는 디렉토리
    --format <type>     png | charx | charx-jpg (기본: assets/manifest.json 기반 auto)
    --cover <file>      커버 이미지 경로 (png 또는 jpg)
    --name <name>       출력 파일명 기본값 (확장자 제외)
    -h, --help          도움말

  Notes:
    - card.json은 필수입니다.
    - lorebooks/, regex/, assets/, html/, variables/, character/가 있으면 card.json 위에 병합합니다.
    - lua/*.lua는 자동 역변환하지 않습니다 (기존 card.json의 triggerscript 유지).
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
  const cardPath = path.join(resolvedIn, 'card.json');
  if (!fs.existsSync(cardPath)) {
    throw new Error(`card.json을 찾을 수 없습니다: ${cardPath}`);
  }

  const card = readJson(cardPath) as any;
  if (!card || card.spec !== 'chara_card_v3') {
    throw new Error('현재 pack.js는 spec=chara_card_v3 카드만 지원합니다.');
  }

  console.log('\n  🐿️ RisuAI Character Card Packer\n');
  console.log(`  입력: ${path.relative('.', resolvedIn)}`);

  const mergedCard = mergeExtractedComponents(card, resolvedIn);
  const targetFormat = resolveTargetFormat(resolvedIn, options.formatArg);
  const { outPath, baseName } = resolveOutputPath({
    inRoot: resolvedIn,
    outArg: options.outArg,
    nameArg: options.nameArg,
    card: mergedCard,
    format: targetFormat,
  });
  ensureDir(path.dirname(outPath));

  if (targetFormat === 'png') {
    const pngBuf = buildPngCardBuffer(mergedCard, resolvedIn, options.coverArg);
    fs.writeFileSync(outPath, pngBuf);
  } else if (targetFormat === 'charx') {
    const charxBuf = buildCharxBuffer(mergedCard, resolvedIn);
    fs.writeFileSync(outPath, charxBuf);
  } else if (targetFormat === 'charx-jpg') {
    const charxBuf = buildCharxBuffer(mergedCard, resolvedIn);
    const jpegCover = resolveCoverBytes(resolvedIn, options.coverArg, ['.jpg', '.jpeg'], JPEG_1X1);
    fs.writeFileSync(outPath, Buffer.concat([jpegCover, charxBuf]));
  } else {
    throw new Error(`지원하지 않는 format: ${targetFormat}`);
  }

  console.log(`\n  ✅ 패킹 완료 (${targetFormat}) → ${path.relative('.', outPath)}`);
  console.log(`  출력 이름: ${baseName}\n`);
}

function mergeExtractedComponents(card: any, inRoot: string): any {
  const next = structuredClone(card);
  next.data = next.data || {};
  next.data.extensions = next.data.extensions || {};
  next.data.extensions.risuai = next.data.extensions.risuai || {};

  mergeLorebooks(next, inRoot);
  mergeRegex(next, inRoot);
  mergeBackgroundHtml(next, inRoot);
  mergeDefaultVariables(next, inRoot);
  mergeCharacter(next, inRoot);

  return next;
}

function mergeLorebooks(card: any, inRoot: string): void {
  const loreDir = path.join(inRoot, 'lorebooks');
  if (!isDir(loreDir)) return;

  const rebuilt = readLorebookEntries(loreDir);
  if (!rebuilt) return;

  card.data.character_book = card.data.character_book || {};
  card.data.character_book.entries = rebuilt.characterEntries;

  if (rebuilt.moduleEntries.length > 0) {
    card.data.extensions.risuai._moduleLorebook = rebuilt.moduleEntries;
  } else {
    delete card.data.extensions.risuai._moduleLorebook;
  }
}

function readLorebookEntries(loreDir: string): { characterEntries: any[]; moduleEntries: any[] } {
  const manifestPath = path.join(loreDir, 'manifest.json');

  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath) as any;
    if (!manifest || !Array.isArray(manifest.entries)) {
      throw new Error(`잘못된 lorebooks/manifest.json 형식: ${manifestPath}`);
    }

    const out = { characterEntries: [] as any[], moduleEntries: [] as any[] };
    for (const item of manifest.entries) {
      if (!item || typeof item !== 'object') continue;

      if (item.type === 'folder') {
        if (!item.data || typeof item.data !== 'object') continue;
        if (item.source === 'module') out.moduleEntries.push(item.data);
        else out.characterEntries.push(item.data);
        continue;
      }

      if (item.type === 'entry' && typeof item.path === 'string' && item.path.length > 0) {
        const filePath = path.join(loreDir, fromPosix(item.path));
        if (!fs.existsSync(filePath)) {
          console.warn(`  ⚠️ lorebooks/manifest.json 참조 파일 없음 (skip): ${item.path}`);
          continue;
        }

        const entry = readJson(filePath);
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new Error(`잘못된 lorebook 엔트리 JSON: ${filePath}`);
        }

        if (item.source === 'module') out.moduleEntries.push(entry);
        else out.characterEntries.push(entry);
      }
    }

    return out;
  }

  const orderedFiles = resolveOrderedFiles(loreDir, listJsonFilesRecursive(loreDir));
  if (orderedFiles.length === 0) return { characterEntries: [], moduleEntries: [] };

  const fallbackEntries: any[] = [];
  for (const abs of orderedFiles) {
    const entry = readJson(abs);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`잘못된 lorebook 엔트리 JSON: ${abs}`);
    }
    fallbackEntries.push(entry);
  }

  return { characterEntries: fallbackEntries, moduleEntries: [] };
}

function mergeRegex(card: any, inRoot: string): void {
  const regexDir = path.join(inRoot, 'regex');
  if (!isDir(regexDir)) return;

  const files = resolveOrderedFiles(regexDir, listJsonFilesFlat(regexDir));
  if (files.length === 0) {
    card.data.extensions.risuai.customScripts = [];
    return;
  }

  const scripts: any[] = [];
  for (const abs of files) {
    const raw = readJson(abs);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`잘못된 regex JSON: ${abs}`);
    }
    scripts.push(raw);
  }

  card.data.extensions.risuai.customScripts = scripts;
}

function mergeBackgroundHtml(card: any, inRoot: string): void {
  const htmlPath = path.join(inRoot, 'html', 'background.html');
  if (!fs.existsSync(htmlPath)) return;
  card.data.extensions.risuai.backgroundHTML = fs.readFileSync(htmlPath, 'utf-8');
}

function mergeDefaultVariables(card: any, inRoot: string): void {
  const txtPath = path.join(inRoot, 'variables', 'default.txt');
  if (!fs.existsSync(txtPath)) return;
  card.data.extensions.risuai.defaultVariables = fs.readFileSync(txtPath, 'utf-8');
}

function mergeCharacter(card: any, inRoot: string): void {
  const characterDir = path.join(inRoot, 'character');
  if (!isDir(characterDir)) return;

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
    setNestedValue(card, targetPath, fs.readFileSync(filePath, 'utf-8'));
  }

  const greetingsPath = path.join(characterDir, 'alternate_greetings.json');
  if (fs.existsSync(greetingsPath)) {
    const greetings = readJson(greetingsPath);
    if (!Array.isArray(greetings)) {
      throw new Error(`잘못된 alternate_greetings.json 형식: ${greetingsPath}`);
    }
    card.data.alternate_greetings = greetings;
  }

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
      setNestedValue(card, targetPath, metadata[key]);
    }
  }

  if (typeof metadata.utilityBot === 'boolean') {
    card.data.extensions.risuai.utilityBot = metadata.utilityBot;
  }
  if (typeof metadata.lowLevelAccess === 'boolean') {
    card.data.extensions.risuai.lowLevelAccess = metadata.lowLevelAccess;
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
    }
  }

  return 'charx';
}

function resolveOutputPath(params: {
  inRoot: string;
  outArg: string | null;
  nameArg: string | null;
  card: any;
  format: PackFormat;
}): { outPath: string; baseName: string } {
  const defaultBase = sanitizeFilename(params.nameArg || params.card.data?.name || 'character', 'character');
  const ext = params.format === 'png' ? '.png' : params.format === 'charx-jpg' ? '.jpg' : '.charx';
  const defaultFile = path.join(params.inRoot, `${defaultBase}_repack${ext}`);

  if (!params.outArg) {
    return { outPath: defaultFile, baseName: `${defaultBase}_repack` };
  }

  const resolved = path.resolve(params.outArg);
  const asDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
  if (asDir) {
    return { outPath: path.join(resolved, `${defaultBase}_repack${ext}`), baseName: `${defaultBase}_repack` };
  }

  if (!fs.existsSync(resolved) && path.extname(resolved) === '') {
    return { outPath: path.join(resolved, `${defaultBase}_repack${ext}`), baseName: `${defaultBase}_repack` };
  }

  const parsed = path.parse(resolved);
  const finalName = parsed.name || `${defaultBase}_repack`;
  const finalExt = parsed.ext || ext;
  return { outPath: path.join(parsed.dir || '.', `${finalName}${finalExt}`), baseName: finalName };
}

function buildPngCardBuffer(card: any, inRoot: string, coverArgPath: string | null): Buffer {
  const work = structuredClone(card);
  const assetBlobs = collectAssetBuffers(work, inRoot);

  let cover = resolveCoverBytes(inRoot, coverArgPath, ['.png'], PNG_1X1_TRANSPARENT, {
    allowFromAsset: true,
    card: work,
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
    if (uri === 'ccdefault:' || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) continue;

    const blob = assetBlobs.get(idx);
    if (!blob) continue;

    asset.uri = `__asset:${idx}`;
    chunks.push({ key: `chara-ext-asset_:${idx}`, value: blob.toString('base64') });
  }

  chunks.unshift({ key: 'ccv3', value: Buffer.from(JSON.stringify(work), 'utf-8').toString('base64') });
  return writePngTextChunks(cover, chunks);
}

function buildCharxBuffer(card: any, inRoot: string): Buffer {
  const work = structuredClone(card);
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
    if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) continue;

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

  const moduleObj = buildModuleFromCard(work);
  delete work.data.extensions.risuai.triggerscript;
  delete work.data.extensions.risuai.customScripts;
  delete work.data.extensions.risuai._moduleLorebook;

  zipEntries['card.json'] = Buffer.from(`${JSON.stringify(work, null, 2)}\n`, 'utf-8');
  zipEntries['module.risum'] = encodeModuleRisum(moduleObj);

  return Buffer.from(zipSync(zipEntries, { level: 0 }));
}

function buildModuleFromCard(card: any): Record<string, unknown> {
  const name = card.data?.name || 'Character';
  const risu = card.data?.extensions?.risuai || {};
  return {
    name: `${name} Module`,
    description: `Module for ${name}`,
    id: crypto.randomUUID(),
    trigger: Array.isArray(risu.triggerscript) ? risu.triggerscript : [],
    regex: Array.isArray(risu.customScripts) ? risu.customScripts : [],
    lorebook: Array.isArray(risu._moduleLorebook) ? risu._moduleLorebook : [],
    assets: [],
  };
}

function collectAssetBuffers(card: any, inRoot: string): Map<number, Buffer> {
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

  for (let i = 0; i < (card.data.assets || []).length; i += 1) {
    const idx = i + 1;
    if (out.has(idx)) continue;
    const asset = card.data.assets[i];
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

function resolveCoverBytes(
  inRoot: string,
  coverArgPath: string | null,
  exts: string[],
  fallback: Buffer,
  opts: { allowFromAsset?: boolean; card?: any; assetBlobs?: Map<number, Buffer> } = {},
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

  const card = opts.card;
  const blobs = opts.assetBlobs;
  if (opts.allowFromAsset && card && blobs) {
    const assets = Array.isArray(card.data?.assets) ? card.data.assets : [];
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      if (!asset || asset.type !== 'icon' || asset.name !== 'main') continue;
      const blob = blobs.get(i + 1);
      if (!blob) continue;
      if (exts.includes(`.${String(asset.ext || '').toLowerCase().replace(/^\./, '')}`)) return blob;
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
