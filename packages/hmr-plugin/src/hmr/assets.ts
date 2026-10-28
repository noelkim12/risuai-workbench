import type { HmrAssetEntry } from './protocol';

export interface AssetDeps {
  cacheGet(hash: string): string | undefined;
  cacheSet(hash: string, path: string): void;
  probeImage(fileName: string): Promise<boolean>;
  downloadAsset(hash: string): Promise<Uint8Array>;
  saveAsset(bytes: Uint8Array): Promise<string>;
}

export interface EnsureAssetsProgress {
  readonly phase: 'probe' | 'download';
  readonly done: number;
  readonly total: number;
}

const PROBE_CONCURRENCY = 6;

export async function ensureAssets(
  entries: readonly HmrAssetEntry[],
  deps: AssetDeps,
  onProgress?: (progress: EnsureAssetsProgress) => void,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const misses = new Map<string, HmrAssetEntry>();
  const unique = entries.filter((assetEntry, index) => entries.findIndex((other) => other.hash === assetEntry.hash) === index);

  // readImage는 이미지 바이트 전체를 호스트 저장소(노드 서버면 HTTP)에서 읽어 오므로 하나씩 기다리면 에셋 수만큼 느려진다.
  let probed = 0;
  for (let start = 0; start < unique.length; start += PROBE_CONCURRENCY) {
    await Promise.all(unique.slice(start, start + PROBE_CONCURRENCY).map(async (assetEntry) => {
      const path = deps.cacheGet(assetEntry.hash) ?? await probeAsset(assetEntry, deps);
      if (path !== undefined) {
        resolved.set(assetEntry.hash, path);
        deps.cacheSet(assetEntry.hash, path);
      } else {
        misses.set(assetEntry.hash, assetEntry);
      }
      probed += 1;
      onProgress?.({ phase: 'probe', done: probed, total: unique.length });
    }));
  }

  if (entries.length === 0) {
    onProgress?.({ phase: 'probe', done: 0, total: 0 });
  }

  let downloaded = 0;
  for (const assetEntry of misses.values()) {
    const bytes = await deps.downloadAsset(assetEntry.hash);
    const savedPath = await deps.saveAsset(bytes);
    resolved.set(assetEntry.hash, savedPath);
    deps.cacheSet(assetEntry.hash, savedPath);
    downloaded += 1;
    onProgress?.({ phase: 'download', done: downloaded, total: misses.size });
  }

  return resolved;
}

async function probeAsset(assetEntry: HmrAssetEntry, deps: AssetDeps): Promise<string | undefined> {
  const candidates = assetEntry.ext === 'png'
    ? [`${assetEntry.hash}.png`]
    : [`${assetEntry.hash}.${assetEntry.ext}`, `${assetEntry.hash}.png`];

  for (const candidate of candidates) {
    if (await deps.probeImage(candidate)) {
      return `assets/${candidate}`;
    }
  }

  return undefined;
}
