import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  RISUMODULE_KIND,
  RISUMODULE_SCHEMA_URL,
  RISUMODULE_SCHEMA_VERSION,
} from '../src/cli/shared/risumodule';
import { buildHmrModulePayload } from '../src/node/hmr-build';
import { sha256Hex } from '../src/node/hmr-asset-hash';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeRisumodule(root: string): void {
  writeFileSync(
    path.join(root, '.risumodule'),
    JSON.stringify({
      $schema: RISUMODULE_SCHEMA_URL,
      kind: RISUMODULE_KIND,
      schemaVersion: RISUMODULE_SCHEMA_VERSION,
      id: 'hmr-module-id',
      name: 'HMR Module',
      description: 'module desc',
      createdAt: null,
      modifiedAt: null,
      sourceFormat: 'json',
    }),
  );
}

describe('buildHmrModulePayload', () => {
  it('replaces asset tuple uris with placeholders and exposes buffer sources', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-module-'));
    tempDirs.push(root);
    writeRisumodule(root);
    const bytes = Buffer.from('module-asset-bytes');
    mkdirSync(path.join(root, 'assets', 'other'), { recursive: true });
    writeFileSync(path.join(root, 'assets', 'other', 'bg.bin'), bytes);
    writeFileSync(
      path.join(root, 'assets', 'manifest.json'),
      JSON.stringify({
        assets: [
          {
            index: 1,
            original_uri: 'embeded://assets/other/file/bg.bin',
            extracted_path: 'other/bg.bin',
            status: 'extracted',
            type: 'asset',
            name: 'bg',
            subdir: 'other',
            size_bytes: bytes.byteLength,
          },
        ],
      }),
    );

    const result = buildHmrModulePayload(root);
    const hash = sha256Hex(bytes);

    expect(result.kind).toBe('module');
    expect(result.data.name).toBe('HMR Module');
    expect(result.data.assets).toEqual([['bg', `hmr-asset://${hash}`, 'asset']]);
    expect(result.assets).toEqual([{ hash, ext: 'bin', role: 'asset:bg', size: bytes.byteLength }]);
    expect(result.assetSources.get(hash)).toEqual({ kind: 'buffer', buffer: bytes });
    expect(existsSync(path.join(root, 'lua', 'dist'))).toBe(false);
  });

  it('bundles modular lua without writing dist files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-module-lua-'));
    tempDirs.push(root);
    writeRisumodule(root);
    mkdirSync(path.join(root, 'lua', 'common'), { recursive: true });
    writeFileSync(
      path.join(root, 'lua', 'main.risulua'),
      'local helper = require("common.helper")\nfunction onOutput(data) return helper.wrap(data) end\n',
    );
    writeFileSync(
      path.join(root, 'lua', 'common', 'helper.risulua'),
      'return { wrap = function(data) return data end }\n',
    );

    const result = buildHmrModulePayload(root);

    expect(JSON.stringify(result.data.trigger)).toContain('local helper = __risulua_loaders');
    expect(existsSync(path.join(root, 'dist'))).toBe(false);
  });
});
