import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeFilename,
  inferLuaFunctionName,
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
  executeLorebookPlan,
} from '@/node';
import { createLimiter } from '../../shared/concurrency';
import { parseModuleRisumFull, parseModuleJson } from '../parsers';
import type { ParsedModuleFull } from '../parsers';

export interface ParsedModuleResult {
  module: any;
  assetBuffers: Buffer[];
  sourceFormat: 'risum' | 'json';
}

export function phase1_parseModule(inputPath: string): ParsedModuleResult {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 모듈 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.risum') {
    console.log('     포맷: module.risum');
    const parsed: ParsedModuleFull | null = parseModuleRisumFull(buf);
    if (!parsed) {
      throw new Error('module.risum 파싱 실패');
    }

    console.log(`     이름: ${parsed.module?.name || 'unknown'}`);
    console.log(`     ID: ${parsed.module?.id || 'unknown'}`);
    if (parsed.assetBuffers.length > 0) {
      console.log(`     에셋 버퍼: ${parsed.assetBuffers.length}개`);
    }

    return {
      module: parsed.module,
      assetBuffers: parsed.assetBuffers,
      sourceFormat: 'risum',
    };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const module = parseModuleJson(buf);
    if (!module) {
      throw new Error('module.json 파싱 실패 (유효한 RisuAI module 형식이 아닙니다)');
    }

    console.log(`     이름: ${module.name || 'unknown'}`);
    console.log(`     ID: ${module.id || 'unknown'}`);

    return {
      module,
      assetBuffers: [],
      sourceFormat: 'json',
    };
  }

  throw new Error(`지원하지 않는 파일 포맷: ${ext} (지원: .risum, .json)`);
}

export function phase2_extractLorebooks(module: any, outputDir: string): number {
  console.log('\n  📚 Phase 2: Lorebook 추출');

  const lorebooksDir = path.join(outputDir, 'lorebooks');
  const lorebook = module?.lorebook;
  if (!Array.isArray(lorebook) || lorebook.length === 0) {
    console.log('     (lorebook 없음)');
    return 0;
  }

  console.log(`     module.lorebook: ${lorebook.length}개`);
  const orderList: string[] = [];
  const manifestEntries: any[] = [];
  const allocateDir = createLorebookDirAllocator();
  const plan = planLorebookExtraction(lorebook, 'module', allocateDir);
  const result = executeLorebookPlan(plan, lorebooksDir);
  const count = result.count;
  manifestEntries.push(...result.manifestEntries);
  orderList.push(...result.orderList);

  if (manifestEntries.length > 0) {
    writeJson(path.join(lorebooksDir, 'manifest.json'), { version: 1, entries: manifestEntries });
  }

  if (orderList.length > 0) {
    writeJson(path.join(lorebooksDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 lorebook → ${path.relative('.', lorebooksDir)}/`);
  return count;
}

export function phase3_extractRegex(module: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex(customscript) 추출');

  const regexDir = path.join(outputDir, 'regex');
  const scripts = module?.regex;
  if (!Array.isArray(scripts) || scripts.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  console.log(`     module.regex: ${scripts.length}개`);
  let count = 0;
  const orderList: string[] = [];
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const name = sanitizeFilename(script?.comment || `regex_${i}`);
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

export function phase4_extractTriggerLua(module: any, outputDir: string): number {
  console.log('\n  🌙 Phase 4: TriggerLua 스크립트 추출');

  const luaDir = path.join(outputDir, 'lua');
  const triggers = module?.trigger;
  if (!Array.isArray(triggers) || triggers.length === 0) {
    console.log('     (module trigger 없음)');
    return 0;
  }

  console.log(`     module.trigger: ${triggers.length}개`);
  let luaCount = 0;
  let triggerCount = 0;

  for (let i = 0; i < triggers.length; i += 1) {
    const trigger = triggers[i];
    const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];

    for (let j = 0; j < effects.length; j += 1) {
      const effect = effects[j];
      if (effect?.type === 'triggerlua' && effect.code) {
        triggerCount += 1;
        const baseName = sanitizeFilename(
          trigger.comment || inferLuaFunctionName(effect.code) || `trigger_${i}`,
        );
        const triggerLuaCount = effects.filter((e: any) => e?.type === 'triggerlua').length;
        const name = triggerLuaCount > 1 ? `${baseName}_${j}` : baseName;
        const outPath = uniquePath(luaDir, name, '.lua');

        const header = [
          `-- Extracted from module trigger: ${trigger.comment || '(unnamed)'}`,
          `-- Trigger type: ${trigger.type || 'unknown'}`,
          `-- Low-level access: ${trigger.lowLevelAccess || module?.lowLevelAccess ? 'yes' : 'no'}`,
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

export function phase5_extractAssets(
  module: any,
  outputDir: string,
  assetBuffers: Buffer[],
  sourceFormat: 'risum' | 'json',
): number {
  console.log('\n  🖼️ Phase 5: 에셋 추출');

  if (sourceFormat === 'json') {
    console.log('     (JSON 소스 — 바이너리 에셋 버퍼 없음, 스킵)');
    return 0;
  }

  const assets = module?.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    console.log('     (assets 없음)');
    return 0;
  }

  console.log(`     module.assets: ${assets.length}개`);
  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest: {
    version: number;
    source_format: 'risum' | 'json';
    total: number;
    extracted: number;
    skipped: number;
    assets: Array<{
      index: number;
      name: string | null;
      uri: string | null;
      type: string | null;
      extracted_path: string | null;
      status: 'extracted' | 'missing_buffer';
      size_bytes: number | null;
    }>;
  } = {
    version: 1,
    source_format: sourceFormat,
    total: assets.length,
    extracted: 0,
    skipped: 0,
    assets: [],
  };

  for (let i = 0; i < assets.length; i += 1) {
    const tuple = assets[i];
    const name = Array.isArray(tuple) ? tuple[0] : null;
    const uri = Array.isArray(tuple) ? tuple[1] : null;
    const type = Array.isArray(tuple) ? tuple[2] : null;

    const buffer = assetBuffers[i];
    if (!buffer) {
      manifest.assets.push({
        index: i,
        name,
        uri,
        type,
        extracted_path: null,
        status: 'missing_buffer',
        size_bytes: null,
      });
      manifest.skipped += 1;
      continue;
    }

    const baseName = sanitizeFilename(name || `asset_${i}`);
    const outPath = uniquePath(assetsDir, baseName, '.bin');
    writeBinary(outPath, buffer);

    manifest.assets.push({
      index: i,
      name,
      uri,
      type,
      extracted_path: path.basename(outPath),
      status: 'extracted',
      size_bytes: buffer.length,
    });
    manifest.extracted += 1;
  }

  writeJson(path.join(assetsDir, 'manifest.json'), manifest);
  console.log(
    `     ✅ ${manifest.extracted}개 에셋 추출, ${manifest.skipped}개 스킵 → ${path.relative('.', assetsDir)}/`,
  );
  return manifest.extracted;
}

/** phase5_extractAssets의 async 버전 — 에셋 I/O를 동시성 제한기로 병렬 처리 */
export async function phase5_extractAssetsAsync(
  module: any,
  outputDir: string,
  assetBuffers: Buffer[],
  sourceFormat: 'risum' | 'json',
): Promise<number> {
  console.log('\n  🖼️ Phase 5: 에셋 추출 (async)');

  if (sourceFormat === 'json') {
    console.log('     (JSON 소스 — 바이너리 에셋 버퍼 없음, 스킵)');
    return 0;
  }

  const assets = module?.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    console.log('     (assets 없음)');
    return 0;
  }

  console.log(`     module.assets: ${assets.length}개`);
  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest: {
    version: number;
    source_format: 'risum' | 'json';
    total: number;
    extracted: number;
    skipped: number;
    assets: Array<{
      index: number;
      name: string | null;
      uri: string | null;
      type: string | null;
      extracted_path: string | null;
      status: 'extracted' | 'missing_buffer';
      size_bytes: number | null;
    }>;
  } = {
    version: 1,
    source_format: sourceFormat,
    total: assets.length,
    extracted: 0,
    skipped: 0,
    assets: [],
  };

  const writeJobs: Array<{ outPath: string; data: Buffer }> = [];

  for (let i = 0; i < assets.length; i += 1) {
    const tuple = assets[i];
    const name = Array.isArray(tuple) ? tuple[0] : null;
    const uri = Array.isArray(tuple) ? tuple[1] : null;
    const type = Array.isArray(tuple) ? tuple[2] : null;

    const buffer = assetBuffers[i];
    if (!buffer) {
      manifest.assets.push({
        index: i,
        name,
        uri,
        type,
        extracted_path: null,
        status: 'missing_buffer',
        size_bytes: null,
      });
      manifest.skipped += 1;
      continue;
    }

    const baseName = sanitizeFilename(name || `asset_${i}`);
    const outPath = uniquePath(assetsDir, baseName, '.bin');
    writeJobs.push({ outPath, data: buffer });

    manifest.assets.push({
      index: i,
      name,
      uri,
      type,
      extracted_path: path.basename(outPath),
      status: 'extracted',
      size_bytes: buffer.length,
    });
    manifest.extracted += 1;
  }

  const limiter = createLimiter();
  await limiter.map(writeJobs, (job) => writeBinaryAsync(job.outPath, job.data));

  await writeJsonAsync(path.join(assetsDir, 'manifest.json'), manifest);
  console.log(
    `     ✅ ${manifest.extracted}개 에셋 추출, ${manifest.skipped}개 스킵 → ${path.relative('.', assetsDir)}/`,
  );
  return manifest.extracted;
}

export function phase6_extractBackgroundEmbedding(module: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundEmbedding 추출');

  const html = module?.backgroundEmbedding;
  if (!html) {
    console.log('     (backgroundEmbedding 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, 'html', 'background.html');
  writeText(outPath, html);
  console.log(`     ✅ html/background.html → ${path.relative('.', path.join(outputDir, 'html'))}`);
  return 1;
}

export function phase7_extractModuleIdentity(module: any, outputDir: string): number {
  console.log('\n  🧾 Phase 7: Module Identity 추출');

  const metadata: Record<string, unknown> = {
    name: module?.name || '',
    description: module?.description || '',
    id: module?.id || '',
  };

  if (module?.namespace) metadata.namespace = module.namespace;
  if (typeof module?.lowLevelAccess === 'boolean') metadata.lowLevelAccess = module.lowLevelAccess;
  if (typeof module?.hideIcon === 'boolean') metadata.hideIcon = module.hideIcon;
  if (module?.mcp) metadata.mcp = module.mcp;
  if (module?.customModuleToggle) metadata.customModuleToggle = module.customModuleToggle;

  const metadataPath = path.join(outputDir, 'metadata.json');
  writeJson(metadataPath, metadata);
  console.log(`     ✅ metadata.json → ${path.relative('.', metadataPath)}`);
  return 1;
}

export function phase8_extractModuleToggle(module: any, outputDir: string): number {
  console.log('\n  🧩 Phase 8: Module Toggle 추출');

  const toggle = module?.customModuleToggle;
  if (!toggle) {
    console.log('     (customModuleToggle 없음)');
    return 0;
  }

  const moduleName = sanitizeFilename(module?.name || 'module');
  const outPath = path.join(outputDir, 'toggle', `${moduleName}.risutoggle`);
  writeText(outPath, String(toggle));
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${toggle.length} chars`);
  return 1;
}
