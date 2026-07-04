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
