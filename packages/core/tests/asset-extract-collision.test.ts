import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { phase5_extractAssetsAsync } from '../src/cli/extract/character/phases/assets';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'asset-collision-'));
  tempDirs.push(dir);
  return dir;
}

describe('phase5_extractAssetsAsync — same-named asset collision', () => {
  it('gives distinct on-disk paths to assets sharing name/type/ext', async () => {
    const outDir = makeTempDir();
    // Three separate icons that all carry name="iconx" (real RisuAI charx shape).
    // Deferred writes previously let uniquePath's existsSync collapse them into one file.
    const assetSources: Record<string, Uint8Array> = {
      'assets/icon/image/iconx.png': new Uint8Array(100).fill(1),
      'assets/icon/image/iconx_1.png': new Uint8Array(200).fill(2),
      'assets/icon/image/iconx_2.png': new Uint8Array(300).fill(3),
    };
    const charx = {
      data: {
        assets: [
          { uri: 'embeded://assets/icon/image/iconx.png', type: 'icon', name: 'iconx', ext: 'png' },
          { uri: 'embeded://assets/icon/image/iconx_1.png', type: 'icon', name: 'iconx', ext: 'png' },
          { uri: 'embeded://assets/icon/image/iconx_2.png', type: 'icon', name: 'iconx', ext: 'png' },
        ],
      },
    };

    const manifest = await phase5_extractAssetsAsync(charx, outDir, assetSources, null);

    // Every asset keeps a unique extracted_path.
    const paths = (manifest?.assets ?? []).map((a) => a.extracted_path);
    expect(paths).toEqual([
      'icons/iconx.png',
      'icons/iconx_1.png',
      'icons/iconx_2.png',
    ]);

    // All three physical files survive on disk, with their original sizes intact.
    const iconsDir = path.join(outDir, 'assets', 'icons');
    const files = readdirSync(iconsDir).sort();
    expect(files).toEqual(['iconx.png', 'iconx_1.png', 'iconx_2.png']);
    expect(statSync(path.join(iconsDir, 'iconx.png')).size).toBe(100);
    expect(statSync(path.join(iconsDir, 'iconx_1.png')).size).toBe(200);
    expect(statSync(path.join(iconsDir, 'iconx_2.png')).size).toBe(300);
  });
});
