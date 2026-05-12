/**
 * 캐릭터 asset 추출 phase와 asset manifest 구성 헬퍼.
 * @file packages/core/src/cli/extract/character/phases/assets.ts
 */

import path from 'node:path';
import { sanitizeFilename, resolveAssetUri, guessMimeExt } from '@/domain';
import { ensureDir, writeBinary, writeBinaryAsync, writeJson, writeJsonAsync, uniquePath } from '@/node';
import { createLimiter } from '../../../shared/concurrency';
import type { ExtractedAssetManifest } from './types';

interface CharacterAssetManifest {
  version: number;
  source_format: string;
  total: number;
  extracted: number;
  skipped: number;
  assets: CharacterAssetManifestEntry[];
}

interface CharacterAssetManifestEntry {
  index: number;
  original_uri: string | null;
  extracted_path: string | null;
  status: string;
  type: string | null;
  name: string | null;
  ext: string | null;
  subdir: string;
  size_bytes: number | null;
}

interface CharacterAssetLike {
  uri?: string;
  type?: string;
  name?: string;
  ext?: string;
}

/**
 * bufferFromResolvedData 함수.
 * URI resolver가 반환한 unknown payload를 쓰기 가능한 Buffer로 변환함.
 *
 * @param data - resolver가 돌려준 asset payload
 * @returns 쓰기 가능한 Buffer 또는 변환 불가 시 null
 */
function bufferFromResolvedData(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') return Buffer.from(data);
  return null;
}

/**
 * createAssetManifest 함수.
 * 캐릭터 asset 추출 결과를 기록할 빈 manifest를 생성함.
 *
 * @param assetSources - 입력 포맷 추론에 쓸 원본 asset dictionary
 * @param total - 추출 대상으로 관측한 asset 수
 * @returns 비어 있는 asset manifest
 */
function createAssetManifest(
  assetSources: Record<string, Uint8Array>,
  total: number,
): CharacterAssetManifest {
  return {
    version: 1,
    source_format: detectSourceFormat(assetSources),
    total,
    extracted: 0,
    skipped: 0,
    assets: [],
  };
}

export function detectSourceFormat(assetSources: Record<string, Uint8Array>): string {
  const keys = Object.keys(assetSources || {});
  if (keys.length === 0) return 'json';
  if (keys.every((key) => /^\d+$/.test(key))) return 'png';
  return 'charx';
}

export function assetTypeToSubdir(type: string): string {
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

  const manifest = createAssetManifest(assetSources, assets.length);

  const subdirCounts: Record<string, number> = {};

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i] as CharacterAssetLike | null | undefined;
    const resolved = resolveAssetUri(asset?.uri ?? '', assetSources);
    const subdir = assetTypeToSubdir(asset?.type ?? '');
    const entry: CharacterAssetManifestEntry = {
      index: i,
      original_uri: asset?.uri ?? null,
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
    const buf = bufferFromResolvedData(resolved.data);
    if (!buf) {
      entry.status = 'unresolved';
      console.warn(`     ⚠️ asset[${i}] 데이터 변환 실패: ${asset?.uri || '(missing uri)'}`);
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }
    writeBinary(outPath, buf);

    entry.extracted_path = `${subdir}/${path.basename(outPath)}`;
    entry.status = 'extracted';
    entry.size_bytes = buf.length;
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
): Promise<ExtractedAssetManifest | null> {
  const assets = charx.data?.assets;
  if (assets == null) {
    console.log('     (V2 카드 — assets 배열 없음)');
    return null;
  }

  if (assets.length === 0) {
    console.log('     (에셋 없음)');
    return { assets: [] };
  }

  console.log('\n  🖼️ Phase 5: 에셋 추출 (async)');
  console.log(`     assets: ${assets.length}개`);

  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest = createAssetManifest(assetSources, assets.length);

  const subdirCounts: Record<string, number> = {};
  const writeJobs: Array<{ outPath: string; data: Buffer }> = [];

  // Path allocation must be serial (uniquePath uses existsSync)
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i] as CharacterAssetLike | null | undefined;
    const resolved = resolveAssetUri(asset?.uri ?? '', assetSources);
    const subdir = assetTypeToSubdir(asset?.type ?? '');
    const entry: CharacterAssetManifestEntry = {
      index: i,
      original_uri: asset?.uri ?? null,
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
    const buf = bufferFromResolvedData(resolved.data);
    if (!buf) {
      entry.status = 'unresolved';
      manifest.assets.push(entry);
      manifest.skipped += 1;
      continue;
    }
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

  return manifest;
}
