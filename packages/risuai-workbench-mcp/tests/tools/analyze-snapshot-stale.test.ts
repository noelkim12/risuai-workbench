/**
 * Tests for analyze snapshot stale-state handling after mutations.
 * @file packages/risuai-workbench-mcp/tests/tools/analyze-snapshot-stale.test.ts
 */

import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import { computeFileHash } from '../../src/mutation/file-hash';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleEditMetadata } from '../../src/tools/mutation/edit-metadata';
import { handleQueryTokenBudget, handleQueryVariableFlow } from '../../src/tools/analyze/query-analyze';

interface StaleFixture {
  metadataPath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createStaleFixture 함수.
 * snapshot stale tests가 쓰는 mutation-capable metadata fixture를 만든다.
 *
 * @returns temp workspace fixture
 */
async function createStaleFixture(): Promise<StaleFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-stale-snapshot-'));
  const metadataPath = path.join(root, 'characters', 'merry', '.risuchar');
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify({ name: 'Merry', version: 1 }, null, 2)}\n`, 'utf8');
  return { metadataPath, root, workspace: { ok: true, path: root, reason: null } };
}

/**
 * mutationResult 함수.
 * handler union result를 mutation result로 좁힘.
 *
 * @param result - handler result
 * @returns mutation result envelope
 */
function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') {
    throw new Error(`Expected mutation result, got ${result.schema}`);
  }
  return result;
}

describe('analyze snapshot stale-state handling', () => {
  it('marks a previous analyze snapshot stale after a Task 8 metadata mutation changes the source hash', async () => {
    const fixture = await createStaleFixture();
    const patchStore = createPatchPlanStore();

    const initial = await handleQueryVariableFlow(
      {
        elements: [{ elementName: 'setup', elementType: 'metadata', reads: [], writes: ['mood'] }],
        sourcePath: 'characters/merry/.risuchar',
      },
      fixture.workspace,
    );
    const initialSnapshot = (initial.data as { snapshot: { snapshotId: string; sourceHash: string } }).snapshot;
    const initialHash = await computeFileHash(fixture.metadataPath);

    const mutation = mutationResult(await handleEditMetadata(
      {
        allowedFields: ['name', 'version'],
        mode: 'commit',
        operations: [{ jsonPointer: '/name', kind: 'json.set', value: 'Merry Updated' }],
        path: 'characters/merry/.risuchar',
      },
      fixture.workspace,
      'enabled',
      patchStore,
    ));
    const mutatedHash = await computeFileHash(fixture.metadataPath);

    const stale = await handleQueryVariableFlow(
      {
        elements: [{ elementName: 'setup', elementType: 'metadata', reads: [], writes: ['mood'] }],
        previousSnapshot: initialSnapshot,
        sourcePath: 'characters/merry/.risuchar',
      },
      fixture.workspace,
    );

    expect(mutation.status).toBe('applied');
    expect(mutatedHash).not.toBe(initialHash);
    expect(stale.status).toBe('domain_warning');
    expect(stale.diagnostics.some((diagnostic) => diagnostic.id === 'ANALYZE_SNAPSHOT_STALE')).toBe(true);
    expect(stale.data).toMatchObject({
      snapshot: {
        sourceHash: mutatedHash,
        stale: true,
        staleReasons: ['source-hash-changed'],
      },
    });
    expect(await computeFileHash(fixture.metadataPath)).toBe(mutatedHash);
  });

  it('can refuse stale snapshot queries without hiding the stale snapshot metadata', async () => {
    const fixture = await createStaleFixture();
    const first = await handleQueryTokenBudget(
      {
        components: [{ alwaysActive: true, category: 'prompt', name: 'system', text: 'hello' }],
        sourcePath: 'characters/merry/.risuchar',
      },
      fixture.workspace,
    );
    await writeFile(fixture.metadataPath, `${JSON.stringify({ name: 'Changed', version: 2 }, null, 2)}\n`, 'utf8');

    const refused = await handleQueryTokenBudget(
      {
        components: [{ alwaysActive: true, category: 'prompt', name: 'system', text: 'hello' }],
        previousSnapshot: (first.data as { snapshot: { snapshotId: string; sourceHash: string } }).snapshot,
        sourcePath: 'characters/merry/.risuchar',
        stalePolicy: 'refuse',
      },
      fixture.workspace,
    );

    expect(refused.status).toBe('domain_error');
    expect(refused.data).toMatchObject({ snapshot: { stale: true, staleReasons: ['source-hash-changed'] } });
    expect(refused.diagnostics.some((diagnostic) => diagnostic.ruleId === 'analyze.snapshot-stale')).toBe(true);
  });
});
