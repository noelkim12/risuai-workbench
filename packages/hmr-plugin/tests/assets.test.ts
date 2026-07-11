import { describe, expect, it } from 'vitest';
import { ensureAssets, type AssetDeps } from '../src/hmr/assets';
import type { HmrAssetEntry } from '../src/hmr/protocol';

function entry(hash: string, ext = 'png'): HmrAssetEntry {
  return { hash, ext, role: `asset:${hash}`, size: 3 };
}

function makeDeps(overrides: Partial<AssetDeps> = {}): AssetDeps & { readonly calls: string[] } {
  const calls: string[] = [];
  const cache = new Map<string, string>();

  return {
    calls,
    cacheGet: (hash) => cache.get(hash),
    cacheSet: (hash, path) => void cache.set(hash, path),
    probeImage: async (fileName) => {
      calls.push(`probe:${fileName}`);
      return false;
    },
    downloadAsset: async (hash) => {
      calls.push(`download:${hash}`);
      return new Uint8Array([1, 2, 3]);
    },
    saveAsset: async () => {
      calls.push('save');
      return 'assets/saved.png';
    },
    ...overrides,
  };
}

describe('ensureAssets', () => {
  it('uses cache first without probing or downloading', async () => {
    const deps = makeDeps();
    deps.cacheSet('aaa', 'assets/aaa.png');

    const result = await ensureAssets([entry('aaa')], deps);

    expect(result.get('aaa')).toBe('assets/aaa.png');
    expect(deps.calls).toEqual([]);
  });

  it('adopts existing asset on probe hit with extension before png fallback', async () => {
    const deps = makeDeps({
      probeImage: async (fileName) => {
        deps.calls.push(`probe:${fileName}`);
        return fileName === 'bbb.png';
      },
    });

    const result = await ensureAssets([entry('bbb', 'webp')], deps);

    expect(result.get('bbb')).toBe('assets/bbb.png');
    expect(deps.calls).toEqual(['probe:bbb.webp', 'probe:bbb.png']);
    expect(deps.cacheGet('bbb')).toBe('assets/bbb.png');
  });

  it('downloads and saves on probe miss, then caches', async () => {
    const deps = makeDeps();

    const result = await ensureAssets([entry('ccc')], deps);

    expect(result.get('ccc')).toBe('assets/saved.png');
    expect(deps.calls).toEqual(['probe:ccc.png', 'download:ccc', 'save']);
    expect(deps.cacheGet('ccc')).toBe('assets/saved.png');
  });

  it('reports probe progress over entries and download progress over misses', async () => {
    const deps = makeDeps();
    const progress: string[] = [];

    await ensureAssets([entry('a'), entry('b')], deps, (item) => progress.push(`${item.phase}:${item.done}/${item.total}`));

    expect(progress).toEqual(['probe:1/2', 'probe:2/2', 'download:1/2', 'download:2/2']);
  });

  it('reports one empty probe progress event without downloads for empty entries', async () => {
    const deps = makeDeps();
    const progress: string[] = [];

    const result = await ensureAssets([], deps, (item) => progress.push(`${item.phase}:${item.done}/${item.total}`));

    expect(result).toEqual(new Map());
    expect(progress).toEqual(['probe:0/0']);
    expect(deps.calls).toEqual([]);
  });

  it('does not duplicate probes or downloads for repeated hashes', async () => {
    const deps = makeDeps();

    const result = await ensureAssets([entry('dup'), entry('dup', 'webp')], deps);

    expect(result).toEqual(new Map([['dup', 'assets/saved.png']]));
    expect(deps.calls).toEqual(['probe:dup.png', 'download:dup', 'save']);
  });
});
