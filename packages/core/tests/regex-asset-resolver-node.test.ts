import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PNG_1X1_TRANSPARENT } from '../src/node/png';
import { resolveRegexAssets } from '../src/node/regex-asset-resolver';

let rootDir: string;

beforeAll(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-asset-'));
  const additional = path.join(rootDir, 'assets', 'additional');
  fs.mkdirSync(additional, { recursive: true });
  fs.writeFileSync(path.join(additional, 'anelia_default.png'), PNG_1X1_TRANSPARENT);
  const catalog = {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: ['anelia'], s2: ['default'] },
    expected: {},
    assignments: { 'additional/anelia_default.png': { s1: 'anelia', s2: 'default' } },
  };
  fs.writeFileSync(path.join(rootDir, 'assets', 'asset-catalog.json'), JSON.stringify(catalog));
});

afterAll(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('resolveRegexAssets', () => {
  it('resolves a catalog join-name to a png data URI', () => {
    const result = resolveRegexAssets({ rootDir, names: ['anelia_default'] });
    expect(result.truncated).toBe(false);
    expect(result.resolved[0]?.matchedName).toBe('anelia_default');
    expect(result.resolved[0]?.src?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns null src for an unknown name', () => {
    const result = resolveRegexAssets({ rootDir, names: ['zzz_nonexistent_zzz'] });
    expect(result.resolved[0]?.src).toBeNull();
  });

  it('sets truncated when the image cap is exceeded', () => {
    const result = resolveRegexAssets({ rootDir, names: ['anelia_default'], maxImages: 0 });
    expect(result.truncated).toBe(true);
    expect(result.resolved[0]?.src).toBeNull();
  });

  it('returns null src without throwing when assets dir is missing', () => {
    const result = resolveRegexAssets({ rootDir: path.join(rootDir, 'nope'), names: ['anelia_default'] });
    expect(result.resolved[0]?.src).toBeNull();
  });
});
