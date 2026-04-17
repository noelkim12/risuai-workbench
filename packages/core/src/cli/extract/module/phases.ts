import fs from 'node:fs';
import path from 'node:path';
import { sanitizeFilename, createLorebookDirAllocator, planLorebookExtraction } from '@/domain';
import {
  extractLorebooksFromModule,
  serializeLorebookContent,
  serializeLorebookOrder,
} from '@/domain/custom-extension/extensions/lorebook';
import { executeLorebookPlan } from '@/node/lorebook-io';
import {
  buildRegexPath,
  extractRegexFromModule,
  serializeRegexContent,
} from '@/domain/regex';
import { buildLuaPath, extractLuaFromModule } from '@/domain/custom-extension/extensions/lua';
import { buildHtmlPath, extractHtmlFromModule } from '@/domain/custom-extension/extensions/html';
import {
  buildVariablePath,
  extractVariablesFromModule,
  serializeVariableContent,
} from '@/domain/custom-extension/extensions/variable';
import { buildTogglePath, extractToggleFromModule } from '@/domain/custom-extension/extensions/toggle';
import {
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  writeBinaryAsync,
  writeJsonAsync,
  uniquePath,
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
  const lorebooks = extractLorebooksFromModule(module ?? {}, 'module');
  if (!lorebooks || lorebooks.length === 0) {
    console.log('     (lorebook 없음)');
    return 0;
  }

  console.log(`     module.lorebook: ${lorebooks.length}개`);
  ensureDir(lorebooksDir);

  // Use the planner/executor pattern for path-based lorebook extraction
  const allocateDir = createLorebookDirAllocator();
  const plan = planLorebookExtraction(lorebooks, 'module', allocateDir);

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

    writeText(path.join(lorebooksDir, '_order.json'), serializeLorebookOrder(fullOrderList));
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

export function phase3_extractRegex(module: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex(customscript) 추출');

  const regexDir = path.join(outputDir, 'regex');
  const scripts = extractRegexFromModule(module ?? {}, 'module');
  if (!scripts || scripts.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  ensureDir(regexDir);
  console.log(`     module.regex: ${scripts.length}개`);
  let count = 0;
  const orderList: string[] = [];
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const suggestedPath = buildRegexPath('module', script.comment || `regex_${i}`);
    const outPath = uniquePath(
      regexDir,
      path.basename(suggestedPath, '.risuregex'),
      '.risuregex',
    );
    writeText(outPath, serializeRegexContent(script));
    orderList.push(path.basename(outPath));
    count += 1;
  }

  if (orderList.length > 0) {
    writeText(path.join(regexDir, '_order.json'), `${JSON.stringify(orderList, null, 2)}\n`);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}

export function phase4_extractLua(module: any, outputDir: string): number {
  console.log('\n  🌙 Phase 4: Lua triggerscript 추출');

  const lua = extractLuaFromModule(module ?? {}, 'module');
  if (lua === null) {
    console.log('     (module triggerscript 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, buildLuaPath('module', resolveModuleTargetName(module)));
  writeText(outPath, lua);
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${lua.length} chars`);
  return 1;
}

export const phase4_extractTriggerLua = phase4_extractLua;

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

  const html = extractHtmlFromModule(module ?? {}, 'module');
  if (html === null) {
    console.log('     (backgroundEmbedding 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, buildHtmlPath('module'));
  writeText(outPath, html);
  console.log(`     ✅ ${path.relative('.', outPath)} → ${path.relative('.', path.join(outputDir, 'html'))}`);
  return 1;
}

export function phase7_extractVariables(module: any, outputDir: string): number {
  console.log('\n  🧮 Phase 7: Module Variables 추출');

  const variables = extractVariablesFromModule(module ?? {}, 'module');
  if (variables === null) {
    console.log('     (defaultVariables 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, buildVariablePath('module', resolveModuleTargetName(module)));
  writeText(outPath, serializeVariableContent(variables));
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${Object.keys(variables).length} vars`);
  return 1;
}

export function phase8_extractModuleIdentity(module: any, outputDir: string): number {
  console.log('\n  🧾 Phase 8: Module Identity 추출');

  const metadata: Record<string, unknown> = {
    name: module?.name || '',
    description: module?.description || '',
    id: module?.id || '',
  };

  if (module?.namespace) metadata.namespace = module.namespace;
  if (typeof module?.lowLevelAccess === 'boolean') metadata.lowLevelAccess = module.lowLevelAccess;
  if (typeof module?.hideIcon === 'boolean') metadata.hideIcon = module.hideIcon;
  if (module?.mcp) metadata.mcp = module.mcp;
  if (typeof module?.cjs === 'string' && module.cjs.length > 0) metadata.cjs = module.cjs;

  const metadataPath = path.join(outputDir, 'metadata.json');
  writeJson(metadataPath, metadata);
  console.log(`     ✅ metadata.json → ${path.relative('.', metadataPath)}`);
  return 1;
}

export const phase7_extractModuleIdentity = phase8_extractModuleIdentity;

export function phase9_extractModuleToggle(module: any, outputDir: string): number {
  console.log('\n  🧩 Phase 9: Module Toggle 추출');

  const toggle = extractToggleFromModule(module ?? {}, 'module');
  if (toggle === null) {
    console.log('     (customModuleToggle 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, buildTogglePath('module', resolveModuleTargetName(module)));
  writeText(outPath, toggle);
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${toggle.length} chars`);
  return 1;
}

export const phase8_extractModuleToggle = phase9_extractModuleToggle;

function resolveModuleTargetName(module: any): string {
  const name = typeof module?.name === 'string' ? module.name.trim() : '';
  return name.length > 0 ? name : 'module';
}
