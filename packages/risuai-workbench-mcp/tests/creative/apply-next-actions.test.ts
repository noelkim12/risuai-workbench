/**
 * Tests for creative apply_idea_patch post-apply metadata and non-blocking next actions.
 * @file packages/risuai-workbench-mcp/tests/creative/apply-next-actions.test.ts
 */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { applyStoredIdeaPatch } from '../../src/creative';
import { computeFileHash } from '../../src/mutation/file-hash';
import { readJournalEntries } from '../../src/mutation/journal';
import { createFileHashPrecondition, createInsideWorkspacePrecondition, createPatchPlan } from '../../src/mutation/patch-preview';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

interface Fixture {
  journalPath: string;
  orderPath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

type CreativeApplyMutationResult = MutationResultEnvelope & {
  backupIdentifiers?: readonly string[];
  journal?: { mutationId: string; resourceUri: string };
  nextActions?: readonly string[];
  rollback?: { eligible: boolean; mutationId?: string; unavailableReason?: string };
};

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-creative-next-actions-'));
  const directory = path.join(root, 'characters', 'merry', 'lorebooks');
  await mkdir(directory, { recursive: true });
  const orderPath = path.join(directory, '_order.json');
  await writeFile(orderPath, `${JSON.stringify(['intro.risulorebook'], null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'intro.risulorebook'), '---\nname: intro\n---\nbody\n', 'utf8');
  await writeFile(path.join(directory, 'background.risulorebook'), '---\nname: background\n---\nbody\n', 'utf8');
  return {
    journalPath: path.join(root, '.risuai-workbench-mcp', 'journal.jsonl'),
    orderPath,
    root,
    workspace: { ok: true, path: root, reason: null },
  };
}

function mutation(result: DiagnosticEnvelope | MutationResultEnvelope): CreativeApplyMutationResult {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result as CreativeApplyMutationResult;
}

async function makeOrderInsertPlan(fixture: Fixture): Promise<PatchPlan> {
  const target = 'characters/merry/lorebooks/_order.json';
  return createPatchPlan({
    expectedDiagnostics: [],
    intent: 'Implement selected creative idea idea:order-insert: add background lorebook order entry',
    operations: [{ entry: 'background.risulorebook', index: 1, kind: 'order.insert', orderPath: target }],
    preconditions: [createInsideWorkspacePrecondition(target), createFileHashPrecondition(target, await computeFileHash(fixture.orderPath))],
    workspaceRoot: fixture.root,
  });
}

describe('applyStoredIdeaPatch next actions', () => {
  it('surfaces post-validation, journal metadata, rollback unavailability, and refresh recommendations without side effects', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const plan = await makeOrderInsertPlan(fixture);
    store.savePatchPlan(plan);

    const result = mutation(await applyStoredIdeaPatch(
      { options: { postValidate: true }, patchPlanId: plan.patchPlanId, sessionId: 'session:next-actions' },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('applied');
    expect(result.postValidation).toMatchObject({ diagnostics: [], status: 'ok' });
    expect(result.journal).toEqual({ mutationId: result.mutationId, resourceUri: result.resourceLinks[0] });
    expect(result.backupIdentifiers).toEqual([]);
    expect(result.rollback).toMatchObject({ eligible: false, mutationId: result.mutationId });
    expect(result.rollback?.unavailableReason).toContain('sufficient inverse state');
    expect(result.nextActions).toEqual(expect.arrayContaining([
      'workbench.refresh_analyze_snapshot',
      'workbench.refresh_wiki',
      'workbench.rollback_mutation',
    ]));

    const entries = await readJournalEntries(fixture.journalPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ mutationId: result.mutationId, rollbackAvailable: false, status: 'applied', toolName: 'workbench.apply_patch_plan' });
    expect(entries.some((entry) => entry.toolName === 'workbench.rollback_mutation')).toBe(false);
    expect(JSON.parse(await readFile(fixture.orderPath, 'utf8'))).toEqual(['intro.risulorebook', 'background.risulorebook']);
  });

  it('preserves failed post-validation diagnostics and does not auto-rollback even when rollbackOnValidationError is requested', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const target = 'characters/merry/lorebooks/_order.json';
    const before = await readFile(fixture.orderPath, 'utf8');
    const plan = createPatchPlan({
      expectedDiagnostics: [],
      intent: 'Implement selected creative idea idea:break-order: malformed order for validation coverage',
      operations: [{ endOffset: before.length, kind: 'text.replace', path: target, startOffset: 0, text: '{invalid json\n' }],
      preconditions: [createInsideWorkspacePrecondition(target), createFileHashPrecondition(target, await computeFileHash(fixture.orderPath))],
      workspaceRoot: fixture.root,
    });
    store.savePatchPlan(plan);

    const result = mutation(await applyStoredIdeaPatch(
      { options: { postValidate: true, rollbackOnValidationError: true }, patchPlanId: plan.patchPlanId },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('failed');
    expect(result.postValidation.status).toBe('error');
    expect(result.postValidation.diagnostics.some((diagnostic) => diagnostic.id === 'ORDER_FILE_MALFORMED_AFTER_APPLY')).toBe(true);
    expect(result.rollback).toMatchObject({ eligible: false, mutationId: result.mutationId });
    expect(result.nextActions).toEqual(expect.arrayContaining(['workbench.rollback_mutation', 'workbench.refresh_analyze_snapshot', 'workbench.refresh_wiki']));
    expect(await readFile(fixture.orderPath, 'utf8')).toBe('{invalid json\n');

    const entries = await readJournalEntries(fixture.journalPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ mutationId: result.mutationId, rollbackAvailable: false, status: 'failed-validation', toolName: 'workbench.apply_patch_plan' });
    expect(entries.some((entry) => entry.toolName === 'workbench.rollback_mutation')).toBe(false);
  });
});
