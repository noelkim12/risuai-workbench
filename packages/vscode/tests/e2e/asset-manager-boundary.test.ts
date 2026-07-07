/**
 * Asset Manager 프로토콜/서비스 boundary 테스트.
 * @file packages/vscode/tests/e2e/asset-manager-boundary.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const messages = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/assetManagerMessages.js'),
) as typeof import('../../src/asset-manager/assetManagerMessages');
const types = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/assetManagerTypes.js'),
) as typeof import('../../src/asset-manager/assetManagerTypes');
const serviceModule = localRequire(
  path.join(vscodeDistRoot, 'asset-manager/AssetManagerService.js'),
) as typeof import('../../src/asset-manager/AssetManagerService');

function envelope(type: string, payload: unknown): unknown {
  return { protocol: types.ASSET_MANAGER_PROTOCOL, version: types.ASSET_MANAGER_PROTOCOL_VERSION, type, payload };
}

test('asset manager accepts valid webview messages', () => {
  assert.equal(messages.isAssetManagerWebviewMessage(envelope('asset-manager/ready', {})), true);
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/updateAssignments', {
        stableId: 'abc',
        changes: [{ path: 'additional/a.webp', slots: { s1: 'Rin', s2: 'angry' } }],
      }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/saveOutput', {
        stableId: 'abc',
        kind: 'missingReport',
        targetPath: 'assets/missing.md',
        content: '# Missing\n',
      }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/bootstrapCatalog', { stableId: 'abc', source: 'filename', mode: 'missing' }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: { separator: '_', slotTokenCounts: { s1: 2 } },
      }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: {
          separator: '_',
          slotTokenCounts: { s1: 2 },
          groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
        },
      }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(envelope('asset-manager/bootstrapFromManifest', { stableId: 'abc' })),
    true,
  );
});

test('asset manager validates undoAutoAssign payloads', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/undoAutoAssign', {
        stableId: 'abc',
        assignedPaths: ['additional/rin_excited.png'],
        addedVocab: { s2: ['excited'] },
      }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/undoAutoAssign', { stableId: 'abc', assignedPaths: ['../evil.png'], addedVocab: {} }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/undoAutoAssign', { stableId: 'abc', assignedPaths: [], addedVocab: { s9: ['x'] } }),
    ),
    false,
  );
});

test('asset manager accepts valid dropped-file write messages', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [
          { targetPath: 'additional/rin_angry.png', bytesBase64: Buffer.from([1, 2, 3]).toString('base64') },
          {
            targetPath: 'emotions/rin_happy.webp',
            bytesBase64: Buffer.from([4]).toString('base64'),
            deletePath: 'emotions/rin_happy.png',
          },
        ],
      }),
    ),
    true,
  );
});

test('asset manager validates replaceAssetFile payloads', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/replaceAssetFile', { stableId: 'abc', path: 'additional/rin_angry.png' }),
    ),
    true,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/replaceAssetFile', { stableId: 'abc', path: '../evil.png' }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(envelope('asset-manager/replaceAssetFile', { stableId: 'abc' })),
    false,
  );
});

test('asset manager validates pickAssetFiles payloads and creates filesPicked messages', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(envelope('asset-manager/pickAssetFiles', { stableId: 'abc' })),
    true,
  );
  assert.equal(messages.isAssetManagerWebviewMessage(envelope('asset-manager/pickAssetFiles', {})), false);

  const message = messages.createAssetManagerExtensionMessage('asset-manager/filesPicked', {
    stableId: 'abc',
    files: [{ name: 'rin_angry.png', bytesBase64: Buffer.from([1]).toString('base64'), sizeBytes: 1 }],
    skipped: ['huge.mp4'],
  });
  assert.deepEqual(message, {
    protocol: types.ASSET_MANAGER_PROTOCOL,
    version: types.ASSET_MANAGER_PROTOCOL_VERSION,
    type: 'asset-manager/filesPicked',
    payload: {
      stableId: 'abc',
      files: [{ name: 'rin_angry.png', bytesBase64: Buffer.from([1]).toString('base64'), sizeBytes: 1 }],
      skipped: ['huge.mp4'],
    },
  });
});

test('asset manager rejects unsafe dropped-file write messages', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', { stableId: 'abc', files: [] }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [{ targetPath: 'icons/rin.png', bytesBase64: Buffer.from([1]).toString('base64') }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [{ targetPath: 'additional/manifest.json', bytesBase64: Buffer.from([1]).toString('base64') }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [{ targetPath: 'additional/rin.txt', bytesBase64: Buffer.from([1]).toString('base64') }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [{ targetPath: 'additional/rin.png', bytesBase64: 'not base64' }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/writeAssets', {
        stableId: 'abc',
        files: [
          {
            targetPath: 'additional/rin.webp',
            bytesBase64: Buffer.from([1]).toString('base64'),
            deletePath: 'other/mel.png',
          },
        ],
      }),
    ),
    false,
  );
});

test('asset manager creates assetsWritten extension messages', () => {
  const message = messages.createAssetManagerExtensionMessage('asset-manager/assetsWritten', {
    stableId: 'abc',
    writtenPaths: ['additional/rin_angry.png'],
    deletedPaths: ['additional/rin_angry.webp'],
  });

  assert.deepEqual(message, {
    protocol: types.ASSET_MANAGER_PROTOCOL,
    version: types.ASSET_MANAGER_PROTOCOL_VERSION,
    type: 'asset-manager/assetsWritten',
    payload: {
      stableId: 'abc',
      writtenPaths: ['additional/rin_angry.png'],
      deletedPaths: ['additional/rin_angry.webp'],
    },
  });
});

test('asset manager rejects traversal paths absolute output targets and wrong protocol', () => {
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/readImageMeta', { stableId: 'abc', path: '../escape.png' }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/readImageMeta', { stableId: 'abc', path: '..\\outside.png' }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/updateAssignments', {
        stableId: 'abc',
        changes: [{ path: 'additional/./a.webp', slots: { s1: 'Rin' } }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/updateAssignments', {
        stableId: 'abc',
        changes: [{ path: 'additional\\..\\outside.png', slots: { s1: 'Rin' } }],
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage({
      protocol: 'other',
      version: 1,
      type: 'asset-manager/ready',
      payload: {},
    }),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/saveOutput', {
        stableId: 'abc',
        kind: 'promptBlock',
        targetPath: '/etc/passwd',
        content: 'x',
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/saveOutput', {
        stableId: 'abc',
        kind: 'promptBlock',
        targetPath: '..\\escape.md',
        content: 'x',
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/saveOutput', {
        stableId: 'abc',
        kind: 'promptBlock',
        targetPath: 'C:\\temp\\x.md',
        content: 'x',
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: { separator: '_', groupOverrides: [{ firstToken: '', slotTokenCounts: { s1: 1 } }] },
      }),
    ),
    false,
  );
  assert.equal(
    messages.isAssetManagerWebviewMessage(
      envelope('asset-manager/previewCatalogBootstrap', {
        stableId: 'abc',
        source: 'filename',
        mode: 'full',
        split: { separator: '_', groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 0 } }] },
      }),
    ),
    false,
  );
});

test('asset manager creates typed extension messages', () => {
  const message = messages.createAssetManagerExtensionMessage('asset-manager/error', {
    stableId: 'abc',
    context: 'load',
    message: 'failed',
  });

  assert.deepEqual(message, {
    protocol: types.ASSET_MANAGER_PROTOCOL,
    version: types.ASSET_MANAGER_PROTOCOL_VERSION,
    type: 'asset-manager/error',
    payload: {
      stableId: 'abc',
      context: 'load',
      message: 'failed',
    },
  });
});

test('service scans assets, applies assignments, persists catalog', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-service-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    const first = service.scan();
    assert.equal(first.catalogExists, false);
    assert.equal(first.entries.length, 1);
    assert.equal(first.entries[0]?.flags.unassigned, true);

    const updated = service.applyAssignmentChanges([
      { path: 'additional/rin_angry.png', slots: { s1: 'Rin', s2: 'angry' } },
    ]);
    assert.equal(updated.entries[0]?.generatedName, 'Rin_angry');
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'asset-catalog.json')), true);

    const again = new serviceModule.AssetManagerService(workDir).scan();
    assert.equal(again.catalogExists, true);
    assert.equal(again.entries[0]?.generatedName, 'Rin_angry');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service bootstraps catalog from filenames', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-bootstrap-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    const updated = service.bootstrapCatalog({ source: 'filename', mode: 'full' });

    assert.equal(updated.entries[0]?.generatedName, 'rin_angry');
    assert.deepEqual(updated.catalog.assignments, { 'additional/rin_angry.png': { s1: 'rin', s2: 'angry' } });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service persists bootstrap rules when bootstrapCatalog is applied with split options', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-bootstrap-persist-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'mel_flower_smile.png'), Buffer.from([1]));

    const split = {
      separator: '_',
      slotTokenCounts: { s1: 1 },
      groupOverrides: [{ firstToken: 'mel', slotTokenCounts: { s1: 2 } }],
    };
    const service = new serviceModule.AssetManagerService(workDir);
    const updated = service.bootstrapCatalog({ source: 'filename', mode: 'full', split });

    assert.deepEqual(updated.catalog.bootstrap, split);
    const onDisk = JSON.parse(fs.readFileSync(path.join(workDir, 'assets', 'asset-catalog.json'), 'utf-8'));
    assert.deepEqual(onDisk.bootstrap, split);

    const after = service.applyAssignmentChanges([
      { path: 'additional/rin_angry.png', slots: { s1: 'Rin', s2: 'angry' } },
    ]);
    assert.deepEqual(after.catalog.bootstrap, split);

    const again = service.bootstrapCatalog({ source: 'filename', mode: 'missing' });
    assert.deepEqual(again.catalog.bootstrap, split);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service auto-assigns new files using persisted bootstrap rules', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-autoassign-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    service.bootstrapCatalog({ source: 'filename', mode: 'full', split: { separator: '_', slotTokenCounts: { s1: 1 } } });

    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_excited.png'), Buffer.from([1]));
    const result = service.autoAssignNewAssets(['additional/rin_excited.png']);

    assert.deepEqual(result.assignedPaths, ['additional/rin_excited.png']);
    assert.deepEqual(result.anomalyPaths, []);
    assert.deepEqual(result.addedVocab, { s2: ['excited'] });
    assert.deepEqual(result.snapshot.catalog.assignments['additional/rin_excited.png'], { s1: 'rin', s2: 'excited' });
    assert.equal(result.snapshot.catalog.vocab.s2?.includes('excited'), true);
    assert.deepEqual(result.snapshot.catalog.assignments['additional/rin_angry.png'], { s1: 'rin', s2: 'angry' });

    const onDisk = JSON.parse(fs.readFileSync(path.join(workDir, 'assets', 'asset-catalog.json'), 'utf-8'));
    assert.deepEqual(onDisk.assignments['additional/rin_excited.png'], { s1: 'rin', s2: 'excited' });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service reports anomalies without saving when nothing is assignable', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-autoassign-anomaly-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_summer_blue_smile.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    service.bootstrapCatalog({
      source: 'filename',
      mode: 'full',
      split: { separator: '_', slotTokenCounts: { s1: 2, s2: 1 } },
      schema: {
        slots: [
          { id: 's1', label: 'character' },
          { id: 's2', label: 'attire' },
          { id: 's3', label: 'emotion' },
        ],
        joinTemplate: '{s1}_{s2}_{s3}',
      },
    });
    const savedBefore = fs.readFileSync(path.join(workDir, 'assets', 'asset-catalog.json'), 'utf-8');

    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'mel_smile.png'), Buffer.from([1]));
    const result = service.autoAssignNewAssets(['additional/mel_smile.png']);

    assert.deepEqual(result.assignedPaths, []);
    assert.deepEqual(result.anomalyPaths, ['additional/mel_smile.png']);
    assert.deepEqual(result.addedVocab, {});
    assert.equal(fs.readFileSync(path.join(workDir, 'assets', 'asset-catalog.json'), 'utf-8'), savedBefore);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service auto-assign is a no-op when no bootstrap rules are persisted', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-autoassign-norules-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    const result = service.autoAssignNewAssets(['additional/rin_angry.png']);

    assert.deepEqual(result.assignedPaths, []);
    assert.deepEqual(result.anomalyPaths, []);
    assert.deepEqual(result.addedVocab, {});
    assert.equal(result.snapshot.entries[0]?.flags.unassigned, true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service writes dropped asset files and migrates extension-change assignments', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-write-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'emotions'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'emotions', 'rin_happy.png'), Buffer.from([9]));

    const service = new serviceModule.AssetManagerService(workDir);
    service.applyAssignmentChanges([{ path: 'emotions/rin_happy.png', slots: { s1: 'Rin', s2: 'happy' } }]);

    const result = service.writeAssetFiles([
      {
        targetPath: 'emotions/rin_happy.webp',
        bytesBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        deletePath: 'emotions/rin_happy.png',
      },
    ]);

    assert.deepEqual(result.writtenPaths, ['emotions/rin_happy.webp']);
    assert.deepEqual(result.deletedPaths, ['emotions/rin_happy.png']);
    assert.equal(fs.readFileSync(path.join(workDir, 'assets', 'emotions', 'rin_happy.webp')).toString('base64'), 'AQIDBA==');
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'emotions', 'rin_happy.png')), false);

    const again = new serviceModule.AssetManagerService(workDir).scan();
    assert.deepEqual(again.catalog.assignments['emotions/rin_happy.webp'], { s1: 'Rin', s2: 'happy' });
    assert.equal(again.catalog.assignments['emotions/rin_happy.png'], undefined);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('replacementTargetForAsset keeps the asset stem and swaps only the extension', () => {
  assert.deepEqual(serviceModule.replacementTargetForAsset('additional/rin_angry.png', 'final_v3_수정본.png'), {
    targetPath: 'additional/rin_angry.png',
  });
  assert.deepEqual(serviceModule.replacementTargetForAsset('emotions/mel_sad.webp', 'export (1).png'), {
    targetPath: 'emotions/mel_sad.png',
    deletePath: 'emotions/mel_sad.webp',
  });
  assert.deepEqual(serviceModule.replacementTargetForAsset('additional/rin_angry.png', 'IMG_0001.WEBP'), {
    targetPath: 'additional/rin_angry.webp',
    deletePath: 'additional/rin_angry.png',
  });
  assert.deepEqual(serviceModule.replacementTargetForAsset('additional/sub/luna_smile.png', 'x.webp'), {
    targetPath: 'additional/sub/luna_smile.webp',
    deletePath: 'additional/sub/luna_smile.png',
  });
});

test('replacementTargetForAsset output passes writeAssetFiles replacement validation', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-replace-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    service.applyAssignmentChanges([{ path: 'additional/rin_angry.png', slots: { s1: 'Rin', s2: 'angry' } }]);

    const target = serviceModule.replacementTargetForAsset('additional/rin_angry.png', 'downloaded.webp');
    const result = service.writeAssetFiles([
      { targetPath: target.targetPath, bytesBase64: Buffer.from([2, 3]).toString('base64'), deletePath: target.deletePath },
    ]);

    assert.deepEqual(result.writtenPaths, ['additional/rin_angry.webp']);
    assert.deepEqual(result.deletedPaths, ['additional/rin_angry.png']);
    const snapshot = service.scan();
    assert.deepEqual(snapshot.catalog.assignments['additional/rin_angry.webp'], { s1: 'Rin', s2: 'angry' });
    assert.equal(snapshot.catalog.assignments['additional/rin_angry.png'], undefined);
    assert.deepEqual(snapshot.orphanPaths, []);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service rejects unsafe dropped asset writes at the service boundary', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-write-reject-'));
  try {
    const service = new serviceModule.AssetManagerService(workDir);
    assert.throws(() => service.writeAssetFiles([]));
    assert.throws(() => service.writeAssetFiles([{ targetPath: 'icons/rin.png', bytesBase64: 'AQ==' }]));
    assert.throws(() => service.writeAssetFiles([{ targetPath: 'additional/asset-catalog.json', bytesBase64: 'AQ==' }]));
    assert.throws(() => service.writeAssetFiles([{ targetPath: 'additional/rin.txt', bytesBase64: 'AQ==' }]));
    assert.throws(() => service.writeAssetFiles([{ targetPath: 'additional/rin.png', bytesBase64: 'not base64' }]));
    assert.throws(() =>
      service.writeAssetFiles([
        { targetPath: 'additional/rin.webp', bytesBase64: 'AQ==', deletePath: 'additional/mel.png' },
      ]),
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service undoAutoAssign removes auto assignments and added vocab values', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-undo-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1]));

    const service = new serviceModule.AssetManagerService(workDir);
    service.bootstrapCatalog({ source: 'filename', mode: 'full', split: { separator: '_', slotTokenCounts: { s1: 1 } } });

    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_excited.png'), Buffer.from([1]));
    const applied = service.autoAssignNewAssets(['additional/rin_excited.png']);
    assert.deepEqual(applied.addedVocab, { s2: ['excited'] });

    const undone = service.undoAutoAssign({ assignedPaths: applied.assignedPaths, addedVocab: applied.addedVocab });
    assert.equal(undone.catalog.assignments['additional/rin_excited.png'], undefined);
    assert.equal(undone.catalog.vocab.s2?.includes('excited'), false);
    assert.deepEqual(undone.catalog.assignments['additional/rin_angry.png'], { s1: 'rin', s2: 'angry' });
    assert.equal(undone.catalog.vocab.s2?.includes('angry'), true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service previews configured catalog bootstrap without saving', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-preview-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Ahn_Do-hyun_angry.png'), Buffer.from([1]));
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Rivea_angry.png'), Buffer.from([2]));

    const service = new serviceModule.AssetManagerService(workDir);
    const { rows, groups } = service.previewCatalogBootstrap({
      source: 'filename',
      mode: 'full',
      split: {
        separator: '_',
        slotTokenCounts: { s1: 2 },
        groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
      },
    });

    assert.deepEqual(rows.find((row) => row.name === 'Ahn_Do-hyun_angry')?.slots, { s1: 'Ahn_Do-hyun', s2: 'angry' });
    assert.deepEqual(rows.find((row) => row.name === 'Rivea_angry')?.slots, { s1: 'Rivea', s2: 'angry' });
    assert.deepEqual(
      groups.map((group) => group.firstToken).sort(),
      ['Ahn', 'Rivea'],
    );
    assert.deepEqual(groups.find((group) => group.firstToken === 'Rivea')?.anomalies, []);
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'asset-catalog.json')), false);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service applies a bootstrap-supplied schema (slot count) to preview and persisted catalog', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-schema-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Kang_do-gyun_happy.png'), Buffer.from([1]));
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'Kang_do-gyun_angry.png'), Buffer.from([2]));

    const schema = {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'emotion' },
        { id: 's3' as const, label: 'attire' },
      ],
      joinTemplate: '{s1}_{s2}_{s3}',
    };
    const split = { separator: '_', slotTokenCounts: { s1: 2, s2: 1 } };

    const service = new serviceModule.AssetManagerService(workDir);
    // Preview honors the supplied 3-slot schema without persisting it.
    const { rows } = service.previewCatalogBootstrap({ source: 'filename', mode: 'full', split, schema });
    // 3-slot schema with s1=2, s2=1 → s3 is the (empty) remainder for a 3-token name.
    assert.deepEqual(rows.find((row) => row.name === 'Kang_do-gyun_happy')?.slots, { s1: 'Kang_do-gyun', s2: 'happy', s3: undefined });
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'asset-catalog.json')), false);

    // Applying persists the 3-slot schema and the split assignments.
    const saved = service.bootstrapCatalog({ source: 'filename', mode: 'full', split, schema });
    assert.deepEqual(
      saved.catalog.schema.slots.map((slot) => slot.id),
      ['s1', 's2', 's3'],
    );
    assert.deepEqual(saved.catalog.assignments['additional/Kang_do-gyun_happy.png'], { s1: 'Kang_do-gyun', s2: 'happy' });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service rejects traversal paths', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-service-'));
  try {
    const service = new serviceModule.AssetManagerService(workDir);
    assert.throws(() => service.applyAssignmentChanges([{ path: '../outside.png', slots: { s1: 'Rin' } }]));
    assert.throws(() => service.readMeta('../outside.png'));
    assert.throws(() => service.readMeta('..\\outside.png'));
    assert.throws(() => service.saveOutput('../escape.md', 'x'));
    assert.throws(() => service.saveOutput('..\\escape.md', 'x'));
    assert.throws(() => service.saveOutput('additional\\..\\escape.md', 'x'));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('service delegates catalog updates metadata outputs lorebooks tokenization and manifest build', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-vscode-asset-service-'));
  try {
    fs.mkdirSync(path.join(workDir, 'assets', 'additional'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'additional', 'rin_angry.png'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(workDir, 'lorebooks', 'rin.risulorebook'), '---\nname: Rin\n---\n');

    const service = new serviceModule.AssetManagerService(workDir);
    const withVocab = service.updateVocab({ s1: ['Rin'], s2: ['angry', 'sad'] });
    assert.deepEqual(withVocab.catalog.vocab, { s1: ['Rin'], s2: ['angry', 'sad'] });

    const withExpected = service.updateExpected({ Rin: { s2: ['angry'] } });
    assert.deepEqual(withExpected.catalog.expected, { Rin: { s2: ['angry'] } });

    const withSchema = service.updateSchema(withExpected.catalog.schema, {
      tagFormat: { prefix: '<asset:', suffix: '>' },
      fallbackTemplate: '{s1}_fallback',
      outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">',
    });
    assert.equal(withSchema.catalog.outputs?.tagFormat.prefix, '<asset:');

    const tokenized = service.tokenizeUnassigned();
    assert.equal(tokenized.proposals[0]?.matched, true);
    assert.deepEqual(tokenized.proposals[0]?.slots, { s1: 'Rin', s2: 'angry' });

    const outputs = service.generateOutputs(['promptBlock', 'whitelistRegex', 'missingReport']);
    assert.match(outputs.promptBlock ?? '', /<asset:\{character\}_\{emotion\}>/);
    assert.equal(typeof outputs.whitelistRegex?.inPattern, 'string');
    assert.equal(outputs.missingCombos?.length, 1);

    const meta = service.readMeta('additional/rin_angry.png');
    assert.equal(meta.info.sizeBytes, 3);
    assert.equal(meta.info.format, 'unknown');

    assert.deepEqual(service.lorebookNames(), [{ name: 'Rin', filePath: 'lorebooks/rin.risulorebook', folderPath: 'lorebooks' }]);
    const savedPath = service.saveOutput('assets/missing.md', outputs.missingReport ?? '');
    assert.equal(fs.existsSync(savedPath), true);

    const manifest = service.buildManifest();
    assert.equal(manifest.total, 1);
    assert.equal(manifest.unassigned, 1);
    assert.equal(fs.existsSync(path.join(workDir, 'assets', 'manifest.json')), true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
