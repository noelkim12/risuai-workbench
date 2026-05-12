/**
 * 모듈 asset 추출 phase와 asset manifest 구성 헬퍼.
 * @file packages/core/src/cli/extract/module/phases/assets.ts
 */

import path from 'node:path';
import { sanitizeFilename } from '@/domain';
import {
  ensureDir,
  writeBinary,
  writeBinaryAsync,
  writeJson,
  writeJsonAsync,
  uniquePath,
} from '@/node';
import { createLimiter } from '../../../shared/concurrency';
import type { ModuleAssetManifest } from './types';

/**
 * createModuleAssetManifest 함수.
 * module asset 추출 결과를 기록할 빈 manifest를 생성함.
 *
 * @param sourceFormat - manifest에 남길 module 입력 포맷
 * @param total - 추출 대상으로 관측한 module asset tuple 수
 * @returns 비어 있는 module asset manifest
 */
function createModuleAssetManifest(
  sourceFormat: 'risum' | 'json',
  total: number,
): ModuleAssetManifest {
  return {
    version: 1,
    source_format: sourceFormat,
    total,
    extracted: 0,
    skipped: 0,
    assets: [],
  };
}

export function phase5_extractAssets(
  module: any,
  outputDir: string,
  assetBuffers: Buffer[],
  sourceFormat: 'risum' | 'json',
): number {
  console.log('\n  🖼️ Phase 5: 에셋 추출');

  const assetsDir = path.join(outputDir, 'assets');

  if (sourceFormat === 'json') {
    ensureDir(assetsDir);
    writeJson(path.join(assetsDir, 'manifest.json'), createModuleAssetManifest(sourceFormat, 0));
    console.log('     (JSON 소스 — 바이너리 에셋 버퍼 없음, scaffold 생성)');
    return 0;
  }

  const assets = module?.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    ensureDir(assetsDir);
    writeJson(path.join(assetsDir, 'manifest.json'), createModuleAssetManifest(sourceFormat, 0));
    console.log('     (assets 없음 — scaffold 생성)');
    return 0;
  }

  console.log(`     module.assets: ${assets.length}개`);
  ensureDir(assetsDir);

  const manifest = createModuleAssetManifest(sourceFormat, assets.length);

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

  const assetsDir = path.join(outputDir, 'assets');

  if (sourceFormat === 'json') {
    ensureDir(assetsDir);
    await writeJsonAsync(
      path.join(assetsDir, 'manifest.json'),
      createModuleAssetManifest(sourceFormat, 0),
    );
    console.log('     (JSON 소스 — 바이너리 에셋 버퍼 없음, scaffold 생성)');
    return 0;
  }

  const assets = module?.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    ensureDir(assetsDir);
    await writeJsonAsync(
      path.join(assetsDir, 'manifest.json'),
      createModuleAssetManifest(sourceFormat, 0),
    );
    console.log('     (assets 없음 — scaffold 생성)');
    return 0;
  }

  console.log(`     module.assets: ${assets.length}개`);
  ensureDir(assetsDir);

  const manifest = createModuleAssetManifest(sourceFormat, assets.length);

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
