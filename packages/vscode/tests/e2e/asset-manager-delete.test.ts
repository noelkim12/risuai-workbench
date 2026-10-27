import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AssetManagerService } from '../../src/asset-manager/AssetManagerService';
import { isAssetManagerWebviewMessage } from '../../src/asset-manager/assetManagerMessages';
import { ASSET_MANAGER_PROTOCOL, ASSET_MANAGER_PROTOCOL_VERSION } from '../../src/asset-manager/assetManagerTypes';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-asset-delete-'));
  const assets = path.join(root, 'assets', 'additional');
  const trash = path.join(root, 'trash');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(trash);
  for (const name of ['a.png', 'b.png']) fs.writeFileSync(path.join(assets, name), Buffer.from([1]));
  const service = new AssetManagerService(root);
  service.applyAssignmentChanges([
    { path: 'additional/a.png', slots: { s1: 'a' } },
    { path: 'additional/b.png', slots: { s1: 'b' } },
  ]);
  const removeFile = async (absolutePath: string) => {
    fs.renameSync(absolutePath, path.join(trash, path.basename(absolutePath)));
  };
  return { root, service, removeFile };
}

test('deleteAssets validates paths at the message boundary', () => {
  const accepts = (paths: unknown) => isAssetManagerWebviewMessage({
    protocol: ASSET_MANAGER_PROTOCOL,
    version: ASSET_MANAGER_PROTOCOL_VERSION,
    type: 'asset-manager/deleteAssets',
    payload: { stableId: 'test', paths },
  });
  assert.equal(accepts(['additional/a.png', 'emotions/b.webp']), true);
  for (const paths of [[], ['../a.png'], ['/a.png'], ['additional/../a.png'], ['icons/a.png'],
    ['asset-catalog.json'], ['additional/folder'], [1], null]) {
    assert.equal(accepts(paths), false);
  }
});

test('batch deletion deduplicates paths and removes only their assignments', async () => {
  const { service, removeFile } = fixture();
  await service.deleteAssetFiles(['additional/a.png', 'additional/a.png'], removeFile);
  const snapshot = service.scan();
  assert.deepEqual(snapshot.entries.map((entry) => entry.path), ['additional/b.png']);
  assert.deepEqual(snapshot.catalog.assignments, { 'additional/b.png': { s1: 'b' } });
  assert.deepEqual(snapshot.orphanPaths, []);
  await service.deleteAssetFiles(['additional/b.png'], removeFile);
  assert.deepEqual(service.scan().entries, []);
});

test('a failed batch retains failed files and assignments but cleans completed deletions', async () => {
  const { service, removeFile } = fixture();
  await assert.rejects(service.deleteAssetFiles(['additional/a.png', 'additional/b.png'], async (file) => {
    if (file.endsWith('b.png')) throw new Error('Trash unavailable');
    await removeFile(file);
  }), /Trash unavailable/);
  const snapshot = service.scan();
  assert.deepEqual(snapshot.entries.map((entry) => entry.path), ['additional/b.png']);
  assert.deepEqual(snapshot.catalog.assignments, { 'additional/b.png': { s1: 'b' } });
  assert.deepEqual(snapshot.orphanPaths, []);
});

test('all deletion targets are checked before any file is moved', async () => {
  const { root, service } = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-asset-outside-'));
  fs.writeFileSync(path.join(outside, 'a.png'), Buffer.from([1]));
  fs.symlinkSync(outside, path.join(root, 'assets', 'additional', 'linked'), 'dir');
  fs.mkdirSync(path.join(root, 'assets', 'additional', 'directory.png'));
  let calls = 0;
  for (const invalid of ['../a.png', 'icons/a.png', 'additional/missing.png',
    'additional/linked/a.png', 'additional/directory.png']) {
    await assert.rejects(service.deleteAssetFiles(['additional/a.png', invalid], async () => { calls += 1; }));
  }
  assert.equal(calls, 0);
});
