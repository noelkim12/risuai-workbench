import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeFilename,
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  uniquePath,
  parsePngChunks,
  stripPngTextChunks,
  resolveAssetUri,
  guessMimeExt,
  inferLuaFunctionName,
  createLorebookDirAllocator,
  planLorebookExtraction,
  executeLorebookPlan,
} from '../../../shared';
import { parseCharx, parseModuleRisum } from '../parsers';

export function phase1_parseCard(inputPath: string): {
  card: any;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
} {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 캐릭터 카드 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.charx') {
    console.log('     포맷: CharX (ZIP)');
    const { card, moduleData, assets } = parseCharx(buf);
    if (!card) {
      throw new Error('card.json을 찾을 수 없습니다.');
    }

    console.log(`     spec: ${card.spec || 'unknown'}`);
    console.log(`     이름: ${card.data?.name || 'unknown'}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || 'unknown'}`);

        card.data = card.data || {};
        card.data.extensions = card.data.extensions || {};
        card.data.extensions.risuai = card.data.extensions.risuai || {};

        if (mod.trigger && mod.trigger.length > 0) {
          card.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          card.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          card.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return { card, assetSources: assets, mainImage: null };
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

    let card: any;
    try {
      card = JSON.parse(jsonStr);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JSON 파싱 실패: ${message}`);
    }

    console.log(`     spec: ${card.spec || 'unknown'}`);
    console.log(`     이름: ${card.data?.name || card.name || 'unknown'}`);

    return { card, assetSources, mainImage: stripPngTextChunks(buf) };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const card = JSON.parse(buf.toString('utf-8'));
    console.log(`     spec: ${card.spec || 'unknown'}`);
    console.log(`     이름: ${card.data?.name || card.name || 'unknown'}`);
    return { card, assetSources: {}, mainImage: null };
  }

  throw new Error(`지원하지 않는 파일 포맷: ${ext} (지원: .charx, .png, .json)`);
}

export function phase2_extractLorebooks(card: any, outputDir: string): number {
  console.log('\n  📚 Phase 2: Lorebook 추출');

  const lorebooksDir = path.join(outputDir, 'lorebooks');
  let count = 0;
  const orderList: string[] = [];
  const manifestEntries: any[] = [];
  const allocateDir = createLorebookDirAllocator();
  const usedRelPaths = new Set<string>();

  const charBook = card.data?.character_book;
  if (charBook && charBook.entries && charBook.entries.length > 0) {
    console.log(`     character_book.entries: ${charBook.entries.length}개`);
    const plan = planLorebookExtraction(charBook.entries, 'character', allocateDir, usedRelPaths);
    const result = executeLorebookPlan(plan, lorebooksDir);
    count += result.count;
    manifestEntries.push(...result.manifestEntries);
    orderList.push(...result.orderList);
  }

  const moduleLorebook = card.data?.extensions?.risuai?._moduleLorebook;
  if (moduleLorebook && moduleLorebook.length > 0) {
    console.log(`     module lorebook: ${moduleLorebook.length}개`);
    const plan = planLorebookExtraction(moduleLorebook, 'module', allocateDir, usedRelPaths);
    const result = executeLorebookPlan(plan, lorebooksDir);
    count += result.count;
    manifestEntries.push(...result.manifestEntries);
    orderList.push(...result.orderList);
    delete card.data.extensions.risuai._moduleLorebook;
  }

  if (manifestEntries.length > 0) {
    writeJson(path.join(lorebooksDir, 'manifest.json'), { version: 1, entries: manifestEntries });
  }

  if (orderList.length > 0) {
    writeJson(path.join(lorebooksDir, '_order.json'), orderList);
  }

  if (count === 0) {
    console.log('     (lorebook 없음)');
  } else {
    console.log(`     ✅ ${count}개 lorebook → ${path.relative('.', lorebooksDir)}/`);
  }

  return count;
}

export function phase3_extractRegex(card: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex(customscript) 추출');

  const regexDir = path.join(outputDir, 'regex');
  const scripts = card.data?.extensions?.risuai?.customScripts;
  if (!scripts || scripts.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  console.log(`     customScripts: ${scripts.length}개`);
  let count = 0;
  const orderList: string[] = [];
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const name = sanitizeFilename(script.comment || `regex_${i}`);
    const outPath = uniquePath(regexDir, name, '.json');
    writeJson(outPath, script);
    orderList.push(path.basename(outPath));
    count += 1;
  }

  if (orderList.length > 0) {
    writeJson(path.join(regexDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}

export function phase4_extractTriggerLua(card: any, outputDir: string): number {
  console.log('\n  🌙 Phase 4: TriggerLua 스크립트 추출');

  const luaDir = path.join(outputDir, 'lua');
  const triggers = card.data?.extensions?.risuai?.triggerscript;
  if (!triggers || triggers.length === 0) {
    console.log('     (triggerscript 없음)');
    return 0;
  }

  console.log(`     triggerscript: ${triggers.length}개`);
  let luaCount = 0;
  let triggerCount = 0;

  for (let i = 0; i < triggers.length; i += 1) {
    const trigger = triggers[i];
    const effects = trigger.effect || [];

    for (let j = 0; j < effects.length; j += 1) {
      const effect = effects[j];
      if (effect.type === 'triggerlua' && effect.code) {
        triggerCount += 1;
        const baseName = sanitizeFilename(
          trigger.comment || inferLuaFunctionName(effect.code) || `trigger_${i}`,
        );
        const name = effects.filter((e: any) => e.type === 'triggerlua').length > 1 ? `${baseName}_${j}` : baseName;
        const outPath = uniquePath(luaDir, name, '.lua');

        const header = [
          `-- Extracted from triggerscript: ${trigger.comment || '(unnamed)'}`,
          `-- Trigger type: ${trigger.type || 'unknown'}`,
          `-- Low-level access: ${trigger.lowLevelAccess ? 'yes' : 'no'}`,
          '',
        ].join('\n');

        writeText(outPath, header + effect.code);
        luaCount += 1;
      }
    }
  }

  if (luaCount === 0) {
    console.log('     (triggerlua 없음 — triggercode 또는 다른 effect 타입만 존재)');
  } else {
    console.log(
      `     ✅ ${luaCount}개 lua 스크립트 (${triggerCount}개 triggerlua effect) → ${path.relative('.', luaDir)}/`,
    );
  }

  return luaCount;
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
  card: any,
  outputDir: string,
  assetSources: Record<string, Uint8Array>,
  mainImage: Buffer | null,
): number {
  const assets = card.data?.assets;
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

export function phase6_extractBackgroundHTML(card: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundHTML 추출');
  const html = card.data?.extensions?.risuai?.backgroundHTML;
  if (!html) {
    console.log('     (backgroundHTML 없음)');
    return 0;
  }
  const outPath = path.join(outputDir, 'html', 'background.html');
  writeText(outPath, html);
  console.log(`     ✅ html/background.html → ${path.relative('.', path.join(outputDir, 'html'))}`);
  return 1;
}

export function phase7_extractVariables(card: any, outputDir: string): number {
  console.log('\n  📋 Phase 7: DefaultVariables 추출');
  const raw = card.data?.extensions?.risuai?.defaultVariables;
  if (!raw) {
    console.log('     (defaultVariables 없음)');
    return 0;
  }

  const txtPath = path.join(outputDir, 'variables', 'default.txt');
  writeText(txtPath, raw);

  const parsed: Record<string, string> = {};
  const lines = String(raw).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      console.warn(`     ⚠️ = 없는 줄 (key만 저장): ${line}`);
      parsed[line] = '';
    } else {
      parsed[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
    }
  }

  const jsonPath = path.join(outputDir, 'variables', 'default.json');
  writeJson(jsonPath, parsed);
  const count = Object.keys(parsed).length;
  console.log(
    `     ✅ variables/default.txt + default.json (${count}개 변수) → ${path.relative('.', path.join(outputDir, 'variables'))}`,
  );
  return count;
}

export function phase8_extractCharacterCard(card: any, outputDir: string): number {
  console.log('\n  🧾 Phase 8: Character Card 추출');

  const data = card.data || {};
  const risuai = data.extensions?.risuai || {};
  const characterDir = path.join(outputDir, 'character');

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

  const greetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
  writeJson(path.join(characterDir, 'alternate_greetings.json'), greetings);
  fileCount += 1;

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

  console.log(
    `     텍스트: ${Object.keys(textFields).length}개, greetings: ${greetings.length}개, metadata: ${Object.keys(metadata).length}개 필드`,
  );
  console.log(`     ✅ ${fileCount}개 파일 → ${path.relative('.', characterDir)}/`);
  return fileCount;
}
