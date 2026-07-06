/**
 * Asset Manager icon exclusion boundary tests.
 * @file packages/vscode/tests/e2e/asset-manager-icon-filter.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');
const serviceModule = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/AssetManagerService.js'),
) as typeof import('../../src/asset-manager/AssetManagerService');

test('service excludes icon assets from asset manager but includes them in manifest build', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-icons-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'assets', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));
    fs.writeFileSync(path.join(workDir, 'assets', 'icons', 'profile.png'), Buffer.from([2]));

    const service = new serviceModule.AssetManagerService(workDir);
    const scan = service.scan();
    assert.deepEqual(scan.entries.map((entry) => entry.path), ['additional/rin_angry.png']);

    const bootstrap = service.bootstrapCatalog({ source: 'filename', mode: 'full' });
    assert.deepEqual(Object.keys(bootstrap.catalog.assignments), ['additional/rin_angry.png']);

    const manifest = service.buildManifest();
    assert.deepEqual(
      manifest.manifest.assets.map((entry) => entry.extracted_path).sort(),
      ['additional/rin_angry.png', 'icons/profile.png'],
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
