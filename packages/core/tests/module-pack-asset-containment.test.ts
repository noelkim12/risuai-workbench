import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildModuleFromCanonicalDirectory } from '../src/cli/pack/module/workflow';

function createModuleFixture(): { assetDir: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-pack-assets-'));
  const assetDir = path.join(root, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(root, '.risumodule'), JSON.stringify({
    $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
    kind: 'risu.module',
    schemaVersion: 1,
    id: 'asset-fixture',
    name: 'Asset Fixture',
    description: '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
  }));
  return { assetDir, root };
}

describe('module pack asset containment', () => {
  it('rejects extracted_path traversal outside assets', () => {
    const fixture = createModuleFixture();
    fs.writeFileSync(path.join(fixture.root, 'secret.txt'), 'secret');
    fs.writeFileSync(path.join(fixture.assetDir, 'manifest.json'), JSON.stringify({
      assets: [{ index: 0, name: 'secret', extracted_path: '../secret.txt' }],
    }));

    expect(() => buildModuleFromCanonicalDirectory(fixture.root)).toThrow(/outside assets directory/i);
  });

  it('rejects asset symlinks that resolve outside assets', () => {
    const fixture = createModuleFixture();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'module-pack-external-'));
    const externalAsset = path.join(external, 'secret.bin');
    fs.writeFileSync(externalAsset, 'secret');
    fs.symlinkSync(externalAsset, path.join(fixture.assetDir, 'linked.bin'));
    fs.writeFileSync(path.join(fixture.assetDir, 'manifest.json'), JSON.stringify({
      assets: [{ index: 0, name: 'linked', extracted_path: 'linked.bin' }],
    }));

    expect(() => buildModuleFromCanonicalDirectory(fixture.root)).toThrow(/outside assets directory/i);
  });
});
