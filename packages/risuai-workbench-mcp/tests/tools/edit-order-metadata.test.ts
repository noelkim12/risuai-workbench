/**
 * Tests for edit_order and edit_metadata direct mutation tools.
 * @file packages/risuai-workbench-mcp/tests/tools/edit-order-metadata.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleEditOrder } from '../../src/tools/mutation/edit-order';
import { handleEditMetadata } from '../../src/tools/mutation/edit-metadata';

interface MutationFixture {
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createOrderFixture 함수.
 * edit_order tests가 쓰는 isolated temp workspace를 구성함.
 */
async function createOrderFixture(): Promise<MutationFixture & { orderPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-order-'));
  const dir = path.join(root, 'characters', 'merry', 'lorebooks');
  await mkdir(dir, { recursive: true });
  const orderPath = path.join(dir, '_order.json');
  await writeFile(orderPath, `${JSON.stringify(['intro.risulorebook', 'background.risulorebook'], null, 2)}\n`, 'utf8');
  return { orderPath, root, workspace: { ok: true, path: root, reason: null } };
}

/**
 * createMetadataFixture 함수.
 * edit_metadata tests가 쓰는 isolated temp workspace를 구성함.
 */
async function createMetadataFixture(): Promise<MutationFixture & { metadataPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-metadata-'));
  const metadataPath = path.join(root, 'characters', 'merry', '.risuchar');
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify({ name: 'Merry', version: 1 }, null, 2)}\n`, 'utf8');
  return { metadataPath, root, workspace: { ok: true, path: root, reason: null } };
}

function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') {
    throw new Error(`Expected mutation result, got ${result.schema}`);
  }
  return result;
}

function diagnosticEnvelope(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') {
    throw new Error(`Expected diagnostic envelope, got ${result.schema}`);
  }
  return result;
}

describe('handleEditOrder', () => {
  it('returns preview with patchPlan in preview-only mutation mode', async () => {
    const fixture = await createOrderFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditOrder(
      {
        mode: 'commit',
        operations: [{ entry: 'combat.risulorebook', index: 1, kind: 'insert' }],
        orderPath: 'characters/merry/lorebooks/_order.json',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });

    const order = JSON.parse(await readFile(fixture.orderPath, 'utf8')) as string[];
    expect(order).toEqual(['intro.risulorebook', 'background.risulorebook']);
  });

  it('applies order insert in enabled commit mode', async () => {
    const fixture = await createOrderFixture();
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleEditOrder(
      {
        mode: 'commit',
        operations: [{ entry: 'combat.risulorebook', index: 1, kind: 'insert' }],
        orderPath: 'characters/merry/lorebooks/_order.json',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles).toHaveLength(1);

    const order = JSON.parse(await readFile(fixture.orderPath, 'utf8')) as string[];
    expect(order).toEqual(['intro.risulorebook', 'combat.risulorebook', 'background.risulorebook']);
  });

  it('returns preview in preview-only mode', async () => {
    const fixture = await createOrderFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditOrder(
      {
        mode: 'commit',
        operations: [{ entry: 'combat.risulorebook', index: 0, kind: 'insert' }],
        orderPath: 'characters/merry/lorebooks/_order.json',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });
  });

  it('applies despite stale hash', async () => {
    const fixture = await createOrderFixture();
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleEditOrder(
      {
        expectedHash: 'sha256:stalehash',
        mode: 'commit',
        operations: [{ entry: 'new.risulorebook', kind: 'remove' }],
        orderPath: 'characters/merry/lorebooks/_order.json',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');
  });

  it('edits an existing outside order path when explicitly provided', async () => {
    const fixture = await createOrderFixture();
    const patchStore = createPatchPlanStore();

    const outsideDir = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-outside-'));
    const outsideFile = path.join(outsideDir, '_order.json');
    await writeFile(outsideFile, '["outside", "x"]', 'utf8');

    const outsideRelative = path.relative(fixture.root, outsideFile);

    const result = mutationResult(await handleEditOrder(
      {
        mode: 'commit',
        operations: [{ entry: 'x', kind: 'remove' }],
        orderPath: outsideRelative,
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');

    const outsideContent = await readFile(outsideFile, 'utf8');
    expect(JSON.parse(outsideContent)).toEqual(['outside']);
  });
});

describe('handleEditMetadata', () => {
  it('returns preview with patchPlan in preview-only mutation mode', async () => {
    const fixture = await createMetadataFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditMetadata(
      {
        mode: 'commit',
        operations: [{ jsonPointer: '/name', kind: 'json.set', value: 'Updated' }],
        path: 'characters/merry/.risuchar',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({ preview: true });

    const content = JSON.parse(await readFile(fixture.metadataPath, 'utf8')) as Record<string, unknown>;
    expect(content.name).toBe('Merry');
  });

  it('rejects malformed JSON file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-metadata-'));
    const metadataPath = path.join(root, 'broken.json');
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, '{ invalid json', 'utf8');
    const workspace: WorkspaceRootStatus = { ok: true, path: root, reason: null };
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditMetadata(
      {
        mode: 'preview',
        operations: [{ jsonPointer: '/name', kind: 'json.set', value: 'x' }],
        path: 'broken.json',
      },
      workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((d) => d.id === 'METADATA_JSON_PARSE_FAILED')).toBe(true);
  });

  it('rejects unknown fields according to schema policy', async () => {
    const fixture = await createMetadataFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditMetadata(
      {
        allowedFields: ['name', 'version'],
        mode: 'preview',
        operations: [{ jsonPointer: '/unknown_field', kind: 'json.set', value: 'bad' }],
        path: 'characters/merry/.risuchar',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((d) => d.id === 'METADATA_UNKNOWN_FIELD')).toBe(true);
  });

  it('applies json.set in enabled commit mode', async () => {
    const fixture = await createMetadataFixture();
    const patchStore = createPatchPlanStore();

    const result = mutationResult(await handleEditMetadata(
      {
        mode: 'commit',
        operations: [{ jsonPointer: '/name', kind: 'json.set', value: 'Updated' }],
        path: 'characters/merry/.risuchar',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');

    const content = JSON.parse(await readFile(fixture.metadataPath, 'utf8')) as Record<string, unknown>;
    expect(content.name).toBe('Updated');
  });

  it('returns preview in preview-only mode', async () => {
    const fixture = await createMetadataFixture();
    const patchStore = createPatchPlanStore();

    const result = diagnosticEnvelope(await handleEditMetadata(
      {
        mode: 'commit',
        operations: [{ jsonPointer: '/name', kind: 'json.set', value: 'x' }],
        path: 'characters/merry/.risuchar',
      },
      fixture.workspace,
      'preview-only',
      patchStore,
    ));

    expect(result.status).toBe('ok');
  });

  it('edits an existing outside metadata path when explicitly provided', async () => {
    const fixture = await createMetadataFixture();
    const patchStore = createPatchPlanStore();

    const outsideDir = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-outside-meta-'));
    const outsideFile = path.join(outsideDir, 'metadata.json');
    await writeFile(outsideFile, '{"secret": "data"}', 'utf8');

    const outsideRelative = path.relative(fixture.root, outsideFile);

    const result = mutationResult(await handleEditMetadata(
      {
        mode: 'commit',
        operations: [{ jsonPointer: '/secret', kind: 'json.set', value: 'leaked' }],
        path: outsideRelative,
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));

    expect(result.status).toBe('applied');

    const outsideContent = await readFile(outsideFile, 'utf8');
    expect(JSON.parse(outsideContent)).toEqual({ secret: 'leaked' });
  });
});
