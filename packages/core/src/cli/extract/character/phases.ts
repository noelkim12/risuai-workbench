import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeFilename,
  resolveAssetUri,
  guessMimeExt,
  createLorebookDirAllocator,
  planLorebookExtraction,
} from '@/domain';
import {
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  writeBinaryAsync,
  writeJsonAsync,
  uniquePath,
  parsePngChunks,
  stripPngTextChunks,
  executeLorebookPlan,
} from '@/node';
import { createLimiter } from '../../shared/concurrency';
import { parseCharx, parseCharxAsync, parseModuleRisum } from '../parsers';
import {
  extractLorebooksFromCharx,
  serializeLorebookContent,
} from '@/domain/custom-extension/extensions/lorebook';
import {
  extractRegexFromCharx,
  serializeRegexContent,
  type RegexContent,
} from '@/domain/custom-extension/extensions/regex';
import {
  extractVariablesFromCharx,
  serializeVariableContent,
  type VariableContent,
} from '@/domain/custom-extension/extensions/variable';
import {
  extractHtmlFromCharx,
  serializeHtmlContent,
  type HtmlContent,
} from '@/domain/custom-extension/extensions/html';
import {
  extractLuaFromCharx,
  serializeLuaContent,
  type LuaContent,
} from '@/domain/custom-extension/extensions/lua';

export function phase1_parseCharx(inputPath: string): {
  charx: any;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
} {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 캐릭터 카드 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.charx') {
    console.log('     포맷: CharX (ZIP)');
    const { card: charx, moduleData, assets } = parseCharx(buf);
    if (!charx) {
      throw new Error('charx.json을 찾을 수 없습니다.');
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || 'unknown'}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || 'unknown'}`);

        charx.data = charx.data || {};
        charx.data.extensions = charx.data.extensions || {};
        charx.data.extensions.risuai = charx.data.extensions.risuai || {};

        if (mod.trigger && mod.trigger.length > 0) {
          charx.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          charx.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          charx.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }

        // Note: customModuleToggle is NOT merged into charx per T12 spec
        // .risutoggle is module/preset only; charx workspaces exclude it
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return { charx, assetSources: assets, mainImage: null };
  }

  if (ext === '.png') {
    console.log('     포맷: PNG');
    const chunks = parsePngChunks(buf);
    const keys = Object.keys(chunks);
    console.log(`     tEXt 청크: ${keys.join(', ') || '(없음)'}`);

    const assetSources: Record<string, Uint8Array> = {};
    const assetChunkRe = /^chara-ext-asset_:?(\d+)$/;
    for (const key of Object.keys(chunks)) {
      const match = assetChunkRe.exec(key);
      if (match) {
        assetSources[match[1]] = Buffer.from(chunks[key], 'base64');
      }
    }

    let jsonStr: string | null = null;
    if (chunks.ccv3) {
      jsonStr = Buffer.from(chunks.ccv3, 'base64').toString('utf-8');
      console.log('     사용 청크: ccv3 (V3)');
    } else if (chunks.chara) {
      jsonStr = Buffer.from(chunks.chara, 'base64').toString('utf-8');
      console.log('     사용 청크: chara (V2)');
    }

    if (!jsonStr) {
      throw new Error('캐릭터 데이터 청크를 찾을 수 없습니다 (chara/ccv3).');
    }

    let charx: any;
    try {
      charx = JSON.parse(jsonStr);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JSON 파싱 실패: ${message}`);
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || charx.name || 'unknown'}`);

    return { charx, assetSources, mainImage: stripPngTextChunks(buf) };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const charx = JSON.parse(buf.toString('utf-8'));
    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || charx.name || 'unknown'}`);
    return { charx, assetSources: {}, mainImage: null };
  }

  throw new Error(`지원하지 않는 파일 포맷: ${ext} (지원: .charx, .png, .json)`);
}

/** phase1_parseCharx의 async 버전 — .charx ZIP 해제에 fflate async unzip 사용 (worker_threads) */
export async function phase1_parseCharxAsync(inputPath: string): Promise<{
  charx: any;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
}> {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 캐릭터 카드 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.charx') {
    console.log('     포맷: CharX (ZIP) — async unzip');
    const { card: charx, moduleData, assets } = await parseCharxAsync(buf);
    if (!charx) {
      throw new Error('charx.json을 찾을 수 없습니다.');
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || 'unknown'}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || 'unknown'}`);

        charx.data = charx.data || {};
        charx.data.extensions = charx.data.extensions || {};
        charx.data.extensions.risuai = charx.data.extensions.risuai || {};

        if (mod.trigger && mod.trigger.length > 0) {
          charx.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          charx.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          charx.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }

        // Note: customModuleToggle is NOT merged into charx per T12 spec
        // .risutoggle is module/preset only; charx workspaces exclude it
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return { charx, assetSources: assets, mainImage: null };
  }

  // PNG와 JSON은 ZIP 해제가 없으므로 sync와 동일
  return phase1_parseCharx(inputPath);
}

export function phase2_extractLorebooks(charx: any, outputDir: string): number {
  console.log('\n  📚 Phase 2: Lorebook 추출 (canonical)');

  const lorebooksDir = path.join(outputDir, 'lorebooks');
  ensureDir(lorebooksDir);

  // Extract canonical lorebooks from charx using verified adapter
  const lorebooks = extractLorebooksFromCharx(charx, 'charx');
  if (!lorebooks || lorebooks.length === 0) {
    console.log('     (lorebook 없음)');
    return 0;
  }

  console.log(`     lorebook entries: ${lorebooks.length}개`);

  // Use the planner/executor pattern for path-based lorebook extraction
  const allocateDir = createLorebookDirAllocator();
  const plan = planLorebookExtraction(lorebooks, 'character', allocateDir);

  // Convert plan to use .risulorebook extension instead of .json
  const convertedPlan = {
    items: plan.items.map((item) => {
      if (item.type === 'entry') {
        return {
          ...item,
          relPath: item.relPath.replace(/\.json$/, '.risulorebook'),
        };
      }
      return item;
    }),
  };

  const { count, orderList } = executeLorebookPlan(convertedPlan, lorebooksDir);

  // Write .risulorebook files with canonical format (not JSON)
  for (const item of convertedPlan.items) {
    if (item.type === 'entry') {
      const outPath = path.join(lorebooksDir, item.relPath);
      // Convert the raw entry data to canonical .risulorebook format
      const canonicalContent = entryToCanonicalContent(item.data);
      writeText(outPath, serializeLorebookContent(canonicalContent));
    }
  }

  // Write _order.json with folder paths + file paths (path-based contract)
  if (orderList.length > 0) {
    // Build order list with folder paths included
    const fullOrderList: string[] = [];
    const emittedFolders = new Set<string>();

    for (const item of convertedPlan.items) {
      if (item.type === 'folder') {
        if (!emittedFolders.has(item.relDir)) {
          fullOrderList.push(item.relDir);
          emittedFolders.add(item.relDir);
        }
      } else {
        // Check if this entry is inside a folder
        const parentDir = item.relPath.includes('/') ? item.relPath.split('/')[0] : null;
        if (parentDir && !emittedFolders.has(parentDir)) {
          fullOrderList.push(parentDir);
          emittedFolders.add(parentDir);
        }
        fullOrderList.push(item.relPath);
      }
    }

    writeJson(path.join(lorebooksDir, '_order.json'), fullOrderList);
  }

  console.log(`     ✅ ${count}개 lorebook → ${path.relative('.', lorebooksDir)}/`);

  return count;
}

/** Convert raw lorebook entry data to canonical LorebookContent format */
function entryToCanonicalContent(entry: any): import('@/domain/custom-extension/extensions/lorebook').LorebookContent {
  // Handle both character_book and module lorebook schemas
  const keys = Array.isArray(entry.keys)
    ? entry.keys
    : typeof entry.key === 'string'
      ? entry.key.split(',').map((k: string) => k.trim()).filter(Boolean)
      : [];

  const secondaryKeys = Array.isArray(entry.secondary_keys)
    ? entry.secondary_keys
    : typeof entry.secondkey === 'string' && entry.secondkey.trim()
      ? entry.secondkey.split(',').map((k: string) => k.trim()).filter(Boolean)
      : undefined;

  const content: import('@/domain/custom-extension/extensions/lorebook').LorebookContent = {
    name: entry.name || entry.comment || '',
    comment: entry.comment || entry.name || '',
    mode: entry.mode || 'normal',
    constant: entry.constant ?? entry.alwaysActive ?? false,
    selective: entry.selective ?? false,
    insertion_order: entry.insertion_order ?? entry.insertorder ?? 0,
    case_sensitive: entry.case_sensitive ?? entry.extensions?.risu_case_sensitive ?? false,
    use_regex: entry.use_regex ?? entry.useRegex ?? false,
    keys,
    content: entry.content || '',
  };

  if (secondaryKeys && secondaryKeys.length > 0) {
    content.secondary_keys = secondaryKeys;
  }

  if (entry.extensions && Object.keys(entry.extensions).length > 0) {
    content.extensions = entry.extensions;
  }

  if (entry.book_version ?? entry.bookVersion) {
    content.book_version = entry.book_version ?? entry.bookVersion;
  }

  if (entry.activation_percent ?? entry.activationPercent) {
    content.activation_percent = entry.activation_percent ?? entry.activationPercent;
  }

  if (entry.id) {
    content.id = entry.id;
  }

  return content;
}

export function phase3_extractRegex(charx: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex 추출 (canonical)');

  const regexDir = path.join(outputDir, 'regex');
  ensureDir(regexDir);

  // Extract canonical regex from charx using verified adapter
  const regexes = extractRegexFromCharx(charx, 'charx');
  if (!regexes || regexes.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  console.log(`     customScripts: ${regexes.length}개`);

  const orderList: string[] = [];
  let count = 0;

  for (let i = 0; i < regexes.length; i += 1) {
    const content = regexes[i];
    const stem = sanitizeFilename(content.comment || `regex_${i}`, `regex_${i}`);
    const fileName = uniquePath(regexDir, stem, '.risuregex');
    const relativePath = path.basename(fileName);

    writeText(fileName, serializeRegexContent(content));
    orderList.push(relativePath);
    count += 1;
  }

  // Write _order.json
  if (orderList.length > 0) {
    writeJson(path.join(regexDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}

export function phase4_extractTriggerLua(charx: any, outputDir: string): number {
  console.log('\n  🌙 Phase 4: TriggerLua 추출 (canonical)');

  const luaDir = path.join(outputDir, 'lua');
  ensureDir(luaDir);

  // Get triggerscript from charx - it's an array of trigger objects, not a string
  const triggerscript = charx.data?.extensions?.risuai?.triggerscript;
  if (!triggerscript || !Array.isArray(triggerscript) || triggerscript.length === 0) {
    console.log('     (triggerscript 없음)');
    return 0;
  }

  // Extract Lua code from trigger effects
  // Each trigger has effects array, and effects with type 'triggerlua' contain Lua code
  const luaParts: string[] = [];
  for (const trigger of triggerscript) {
    if (!trigger.effect || !Array.isArray(trigger.effect)) continue;

    for (const effect of trigger.effect) {
      if (effect.type === 'triggerlua' && typeof effect.code === 'string' && effect.code.length > 0) {
        // Add comment with trigger info if available
        if (trigger.comment) {
          luaParts.push(`-- Trigger: ${trigger.comment}`);
        }
        luaParts.push(effect.code);
        luaParts.push(''); // Empty line between code blocks
      }
    }
  }

  if (luaParts.length === 0) {
    console.log('     (triggerlua effect 없음)');
    return 0;
  }

  // Write as canonical .risulua file using target-name-based naming
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const fileName = path.join(luaDir, `${sanitizedName}.risulua`);
  writeText(fileName, luaParts.join('\n'));

  console.log(`     ✅ ${triggerscript.length}개 trigger → ${path.relative('.', luaDir)}/${sanitizedName}.risulua`);
  return 1;
}

function detectSourceFormat(assetSources: Record<string, Uint8Array>): string {
  const keys = Object.keys(assetSources || {});
  if (keys.length === 0) return 'json';
  if (keys.every((key) => /^\d+$/.test(key))) return 'png';
  return 'charx';
}

function assetTypeToSubdir(type: string): string {
  if (type === 'icon') return 'icons';
  if (type === 'x-risu-asset') return 'additional';
  if (type === 'emotion') return 'emotions';
  return 'other';
}

export function phase5_extractAssets(
  charx: any,
  outputDir: string,
  assetSources: Record<string, Uint8Array>,
  mainImage: Buffer | null,
): number {
  const assets = charx.data?.assets;
  if (assets == null) {
    console.log('     (V2 카드 — assets 배열 없음)');
    return 0;
  }

  if (assets.length === 0) {
    console.log('     (에셋 없음)');
    return 0;
  }

  console.log('\n  🖼️ Phase 5: 에셋 추출');
  console.log(`     assets: ${assets.length}개`);

  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest: any = {
    version: 1,
    source_format: detectSourceFormat(assetSources),
    total: assets.length,
    extracted: 0,
    skipped: 0,
    assets: [],
  };

  const subdirCounts: Record<string, number> = {};

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const resolved = resolveAssetUri(asset?.uri, assetSources as any);
    const subdir = assetTypeToSubdir(asset?.type);
    const entry: any = {
      index: i,
      original_uri: asset?.uri,
      extracted_path: null,
      status: 'skipped',
      type: asset?.type || null,
      name: asset?.name || null,
      ext: asset?.ext || null,
      subdir,
      size_bytes: null,
    };

    if (resolved === null) {
      entry.status = 'unresolved';
      console.warn(`     ⚠️ asset[${i}] URI 해석 실패: ${asset?.uri || '(missing uri)'}`);
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    if (resolved.type === 'remote') {
      entry.status = 'remote';
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    if (resolved.type === 'ccdefault') {
      if (mainImage) {
        const targetDir = path.join(assetsDir, subdir);
        const ccExt = asset?.ext ? `.${String(asset.ext).replace(/^\./, '')}` : '.png';
        const ccBaseName = sanitizeFilename(asset?.name || 'main');
        const ccOutPath = uniquePath(targetDir, ccBaseName, ccExt);
        writeBinary(ccOutPath, mainImage);
        entry.extracted_path = `${subdir}/${path.basename(ccOutPath)}`;
        entry.status = 'extracted';
        entry.size_bytes = mainImage.length;
        manifest.extracted += 1;
        subdirCounts[subdir] = (subdirCounts[subdir] || 0) + 1;
      } else {
        entry.status = 'pointer_to_main_image';
        manifest.skipped += 1;
      }
      manifest.assets.push(entry);
      continue;
    }

    if (!resolved.data) {
      entry.status = 'unresolved';
      console.warn(`     ⚠️ asset[${i}] 데이터 없음: ${asset?.uri || '(missing uri)'}`);
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    const targetDir = path.join(assetsDir, subdir);
    const ext = asset?.ext
      ? `.${String(asset.ext).replace(/^\./, '')}`
      : guessMimeExt(resolved.metadata?.mime || '');
    const baseName = sanitizeFilename(asset?.name || `asset_${i}`);
    const outPath = uniquePath(targetDir, baseName, ext);
    writeBinary(outPath, Buffer.from(resolved.data as any));

    entry.extracted_path = `${subdir}/${path.basename(outPath)}`;
    entry.status = 'extracted';
    entry.size_bytes = Buffer.from(resolved.data as any).length;
    manifest.extracted += 1;
    subdirCounts[subdir] = (subdirCounts[subdir] || 0) + 1;
    manifest.assets.push(entry);
  }

  writeJson(path.join(assetsDir, 'manifest.json'), manifest);
  const breakdown = Object.entries(subdirCounts)
    .map(([dir, count]) => `${dir}: ${count}`)
    .join(', ');
  console.log(
    `     ✅ ${manifest.extracted}개 추출 (${breakdown}), ${manifest.skipped}개 스킵 → ${path.relative('.', assetsDir)}/`,
  );

  return manifest.extracted;
}

/** phase5_extractAssets의 async 버전 — 에셋 I/O를 동시성 제한기로 병렬 처리 */
export async function phase5_extractAssetsAsync(
  charx: any,
  outputDir: string,
  assetSources: Record<string, Uint8Array>,
  mainImage: Buffer | null,
): Promise<number> {
  const assets = charx.data?.assets;
  if (assets == null) {
    console.log('     (V2 카드 — assets 배열 없음)');
    return 0;
  }

  if (assets.length === 0) {
    console.log('     (에셋 없음)');
    return 0;
  }

  console.log('\n  🖼️ Phase 5: 에셋 추출 (async)');
  console.log(`     assets: ${assets.length}개`);

  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest: any = {
    version: 1,
    source_format: detectSourceFormat(assetSources),
    total: assets.length,
    extracted: 0,
    skipped: 0,
    assets: [],
  };

  const subdirCounts: Record<string, number> = {};
  const writeJobs: Array<{ outPath: string; data: Buffer }> = [];

  // Path allocation must be serial (uniquePath uses existsSync)
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const resolved = resolveAssetUri(asset?.uri, assetSources as any);
    const subdir = assetTypeToSubdir(asset?.type);
    const entry: any = {
      index: i,
      original_uri: asset?.uri,
      extracted_path: null,
      status: 'skipped',
      type: asset?.type || null,
      name: asset?.name || null,
      ext: asset?.ext || null,
      subdir,
      size_bytes: null,
    };

    if (resolved === null) {
      entry.status = 'unresolved';
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    if (resolved.type === 'remote') {
      entry.status = 'remote';
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    if (resolved.type === 'ccdefault') {
      if (mainImage) {
        const targetDir = path.join(assetsDir, subdir);
        const ccExt = asset?.ext ? `.${String(asset.ext).replace(/^\./, '')}` : '.png';
        const ccBaseName = sanitizeFilename(asset?.name || 'main');
        const ccOutPath = uniquePath(targetDir, ccBaseName, ccExt);
        writeJobs.push({ outPath: ccOutPath, data: mainImage });
        entry.extracted_path = `${subdir}/${path.basename(ccOutPath)}`;
        entry.status = 'extracted';
        entry.size_bytes = mainImage.length;
        manifest.extracted += 1;
        subdirCounts[subdir] = (subdirCounts[subdir] || 0) + 1;
      } else {
        entry.status = 'pointer_to_main_image';
        manifest.skipped += 1;
      }
      manifest.assets.push(entry);
      continue;
    }

    if (!resolved.data) {
      entry.status = 'unresolved';
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }

    const targetDir = path.join(assetsDir, subdir);
    const ext = asset?.ext
      ? `.${String(asset.ext).replace(/^\./, '')}`
      : guessMimeExt(resolved.metadata?.mime || '');
    const baseName = sanitizeFilename(asset?.name || `asset_${i}`);
    const outPath = uniquePath(targetDir, baseName, ext);
    const buf = Buffer.from(resolved.data as any);
    writeJobs.push({ outPath, data: buf });

    entry.extracted_path = `${subdir}/${path.basename(outPath)}`;
    entry.status = 'extracted';
    entry.size_bytes = buf.length;
    manifest.extracted += 1;
    subdirCounts[subdir] = (subdirCounts[subdir] || 0) + 1;
    manifest.assets.push(entry);
  }

  // Parallel writes with concurrency limiter
  const limiter = createLimiter();
  await limiter.map(writeJobs, (job) => writeBinaryAsync(job.outPath, job.data));

  await writeJsonAsync(path.join(assetsDir, 'manifest.json'), manifest);
  const breakdown = Object.entries(subdirCounts)
    .map(([dir, count]) => `${dir}: ${count}`)
    .join(', ');
  console.log(
    `     ✅ ${manifest.extracted}개 추출 (${breakdown}), ${manifest.skipped}개 스킵 → ${path.relative('.', assetsDir)}/`,
  );

  return manifest.extracted;
}

export function phase6_extractBackgroundHTML(charx: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundHTML 추출 (canonical)');

  const htmlDir = path.join(outputDir, 'html');
  ensureDir(htmlDir);

  // Extract canonical HTML from charx using verified adapter
  const htmlContent = extractHtmlFromCharx(charx, 'charx');
  if (!htmlContent) {
    console.log('     (backgroundHTML 없음)');
    return 0;
  }

  // Write as canonical .risuhtml file
  const fileName = path.join(htmlDir, 'background.risuhtml');
  writeText(fileName, serializeHtmlContent(htmlContent));

  console.log(`     ✅ html/background.risuhtml → ${path.relative('.', htmlDir)}/`);
  return 1;
}

export function phase7_extractVariables(charx: any, outputDir: string): number {
  console.log('\n  📋 Phase 7: DefaultVariables 추출 (canonical)');

  const variablesDir = path.join(outputDir, 'variables');
  ensureDir(variablesDir);

  // Extract canonical variables from charx using verified adapter
  const variables = extractVariablesFromCharx(charx, 'charx');
  if (!variables) {
    console.log('     (defaultVariables 없음)');
    return 0;
  }

  // Write as canonical .risuvar file using target-name-based naming
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const fileName = path.join(variablesDir, `${sanitizedName}.risuvar`);
  writeText(fileName, serializeVariableContent(variables));

  const count = Object.keys(variables).length;
  console.log(
    `     ✅ variables/${sanitizedName}.risuvar (${count}개 변수) → ${path.relative('.', variablesDir)}/`,
  );
  return count;
}

export function phase8_extractCharacterFields(charx: any, outputDir: string): number {
  console.log('\n  🧾 Phase 8: Character Card 추출 (canonical)');

  const data = charx.data || {};
  const risuai = data.extensions?.risuai || {};
  const characterDir = path.join(outputDir, 'character');
  ensureDir(characterDir);

  // Text fields as .txt files (canonical)
  const textFields: Record<string, string> = {
    'description.txt': data.description || '',
    'first_mes.txt': data.first_mes || '',
    'system_prompt.txt': data.system_prompt || '',
    'post_history_instructions.txt': data.post_history_instructions || '',
    'creator_notes.txt': data.creator_notes || '',
    'additional_text.txt': risuai.additionalText || '',
  };

  let fileCount = 0;
  for (const [filename, content] of Object.entries(textFields)) {
    writeText(path.join(characterDir, filename), content);
    fileCount += 1;
  }

  // Alternate greetings as JSON (structured data)
  const greetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
  writeJson(path.join(characterDir, 'alternate_greetings.json'), greetings);
  fileCount += 1;

  // Metadata as JSON (structured data)
  const metadata = {
    name: data.name || '',
    creator: data.creator || '',
    character_version: data.character_version || '',
    creation_date: data.creation_date || null,
    modification_date: data.modification_date || null,
    utilityBot: risuai.utilityBot ?? false,
    lowLevelAccess: risuai.lowLevelAccess ?? false,
  };
  writeJson(path.join(characterDir, 'metadata.json'), metadata);
  fileCount += 1;

  // Note: .risutoggle is NOT emitted for charx per spec
  // .risutoggle is module/preset only

  console.log(
    `     텍스트: ${Object.keys(textFields).length}개, greetings: ${greetings.length}개, metadata: ${Object.keys(metadata).length}개 필드`,
  );
  console.log(`     ✅ ${fileCount}개 파일 → ${path.relative('.', characterDir)}/`);
  return fileCount;
}
