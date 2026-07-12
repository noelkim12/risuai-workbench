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

export async function ensureAssets(
  entries: readonly HmrAssetEntry[],
  deps: AssetDeps,
  onProgress?: (progress: EnsureAssetsProgress) => void,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const misses = new Map<string, HmrAssetEntry>();
  const processed = new Set<string>();

  let probed = 0;
  for (const assetEntry of entries) {
    if (!processed.has(assetEntry.hash)) {
      processed.add(assetEntry.hash);
      const cached = deps.cacheGet(assetEntry.hash);

      if (cached !== undefined) {
        resolved.set(assetEntry.hash, cached);
      } else {
        const adoptedPath = await probeAsset(assetEntry, deps);
        if (adoptedPath !== undefined) {
          resolved.set(assetEntry.hash, adoptedPath);
          deps.cacheSet(assetEntry.hash, adoptedPath);
        } else {
          misses.set(assetEntry.hash, assetEntry);
        }
      }
    }

    probed += 1;
    onProgress?.({ phase: 'probe', done: probed, total: entries.length });
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
