import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AssetHashCache, sha256Hex } from '../src/node/hmr-asset-hash';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-hash-'));
  tempDirs.push(dir);
  return dir;
}

describe('sha256Hex', () => {
  it('matches RisuAI hasher output shape (lowercase hex, 64 chars)', () => {
    const hash = sha256Hex(Buffer.from('hello'));

    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('AssetHashCache', () => {
  it('hashes a file and reuses cache when mtime and size are unchanged', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'a.bin');
    writeFileSync(file, Buffer.from('hello'));
    const cache = new AssetHashCache();

    const first = cache.hashFile(file);

    expect(first).toBe(sha256Hex(Buffer.from('hello')));
    expect(cache.hashFile(file)).toBe(first);
  });

  it('rehashes when content mtime changes', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'a.bin');
    writeFileSync(file, Buffer.from('hello'));
    const cache = new AssetHashCache();
    cache.hashFile(file);
    writeFileSync(file, Buffer.from('world'));
    const future = new Date(Date.now() + 5_000);
    utimesSync(file, future, future);

    expect(cache.hashFile(file)).toBe(sha256Hex(Buffer.from('world')));
  });
});
