/**
 * Tests for apply_patch_plan storage, safety, preconditions, and journal behavior.
 * @file packages/risuai-workbench-mcp/tests/tools/apply-patch-plan.test.ts
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { computeFileHash } from '../../src/mutation/file-hash';
import { readJournalEntries } from '../../src/mutation/journal';
import { createFileHashPrecondition, createInsideWorkspacePrecondition, createNonexistencePrecondition, createPatchPlan } from '../../src/mutation/patch-preview';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleApplyPatchPlan } from '../../src/tools/apply-patch-plan';
import { handleSuggestOrderPatch } from '../../src/tools/suggest-order-patch';

interface ApplyFixture {
  journalPath: string;
  orderPath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

/**
 * createApplyFixture 함수.
 * apply tests가 자유롭게 쓰는 isolated temp workspace를 구성함.
 *
 * @returns temp workspace fixture paths
 */
async function createApplyFixture(): Promise<ApplyFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-apply-'));
  const orderDirectory = path.join(root, 'characters', 'merry', 'lorebooks');
  await mkdir(orderDirectory, { recursive: true });
  await writeFile(path.join(orderDirectory, 'intro.risulorebook'), '---\nname: intro\n---\nbody\n', 'utf8');
  await writeFile(path.join(orderDirectory, 'background.risulorebook'), '---\nname: background\n---\nbody\n', 'utf8');
  const orderPath = path.join(orderDirectory, '_order.json');
  await writeFile(orderPath, `${JSON.stringify(['intro.risulorebook'], null, 2)}\n`, 'utf8');
  return {
    journalPath: path.join(root, '.risuai-workbench-mcp', 'journal.jsonl'),
    orderPath,
    root,
    workspace: { ok: true, path: root, reason: null },
  };
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

/**
 * patchPlanFromPreview 함수.
 * preview diagnostic data에서 PatchPlan을 추출함.
 *
 * @param result - preview result
 * @returns patch plan
 */
function patchPlanFromPreview(result: DiagnosticEnvelope): PatchPlan {
  return (result.data as { patchPlan: PatchPlan }).patchPlan;
}

describe('handleApplyPatchPlan', () => {
  it('applies a stored order patch plan in enabled mode and journals changed hashes', async () => {
    const fixture = await createApplyFixture();
    const patchStore = createPatchPlanStore();
    const preview = await handleSuggestOrderPatch(
      {
        directory: 'characters/merry/lorebooks',
        operations: [{ entry: 'background.risulorebook', index: 1, kind: 'insert' }],
      },
      fixture.workspace,
      patchStore,
    );
    const patchPlan = patchPlanFromPreview(preview);

    const result = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true }, options: { postValidate: true }, patchPlanId: patchPlan.patchPlanId },
      { mutationMode: 'enabled', patchStore, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('applied');
    expect(result.patchPlanId).toBe(patchPlan.patchPlanId);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]).toMatchObject({ operationCount: 1, path: 'characters/merry/lorebooks/_order.json' });
    expect(result.changedFiles[0].beforeHash).toMatch(/^sha256:/);
    expect(result.changedFiles[0].afterHash).toMatch(/^sha256:/);
    expect(result.changedFiles[0].afterHash).not.toBe(result.changedFiles[0].beforeHash);
    expect(result.postValidation.status).toBe('ok');
    expect(result.resourceLinks[0]).toContain('risuai-workbench://mutations/journal/mutation%3A');
    expect(JSON.parse(await readFile(fixture.orderPath, 'utf8'))).toEqual(['intro.risulorebook', 'background.risulorebook']);

    const entries = await readJournalEntries(fixture.journalPath);
    expect(entries[entries.length - 1]).toMatchObject({ affectedFiles: ['characters/merry/lorebooks/_order.json'], status: 'applied', toolName: 'workbench.apply_patch_plan' });
  });

  it('stale hash blocks a multi-file plan with zero target writes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-stale-'));
    await writeFile(path.join(root, 'first.txt'), 'first original\n', 'utf8');
    await writeFile(path.join(root, 'second.txt'), 'second original\n', 'utf8');
    const workspace: WorkspaceRootStatus = { ok: true, path: root, reason: null };
    const firstHash = await computeFileHash(path.join(root, 'first.txt'));
    const secondHash = await computeFileHash(path.join(root, 'second.txt'));
    const patchStore = createPatchPlanStore();
    const patchPlan = createPatchPlan({
      expectedDiagnostics: [],
      intent: 'Replace two files with stale guard',
      operations: [
        { endOffset: 'first original\n'.length, kind: 'text.replace', path: 'first.txt', startOffset: 0, text: 'first changed\n' },
        { endOffset: 'second original\n'.length, kind: 'text.replace', path: 'second.txt', startOffset: 0, text: 'second changed\n' },
      ],
      preconditions: [
        createInsideWorkspacePrecondition('first.txt'),
        createFileHashPrecondition('first.txt', firstHash),
        createInsideWorkspacePrecondition('second.txt'),
        createFileHashPrecondition('second.txt', secondHash),
      ],
      workspaceRoot: root,
    });
    patchStore.savePatchPlan(patchPlan);
    await writeFile(path.join(root, 'second.txt'), 'second stale\n', 'utf8');

    const result = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true, confirmationText: `APPLY ${patchPlan.patchPlanId}` }, patchPlanId: patchPlan.patchPlanId },
      { mutationMode: 'enabled', patchStore, workspace },
    ));

    expect(result.status).toBe('failed');
    expect(result.changedFiles).toEqual([]);
    expect(result.postValidation.diagnostics.some((diagnostic) => diagnostic.ruleId === 'patch.apply.hash-stale')).toBe(true);
    expect(await readFile(path.join(root, 'first.txt'), 'utf8')).toBe('first original\n');
    expect(await readFile(path.join(root, 'second.txt'), 'utf8')).toBe('second stale\n');
    const entries = await readJournalEntries(path.join(root, '.risuai-workbench-mcp', 'journal.jsonl'));
    expect(entries[entries.length - 1]?.status).toBe('failed-precondition');
  });

  it('rejects missing confirmation, preview-only mode, unknown id, and outside paths without target writes', async () => {
    const fixture = await createApplyFixture();
    const patchStore = createPatchPlanStore();
    const preview = await handleSuggestOrderPatch(
      { directory: 'characters/merry/lorebooks', operations: [{ entry: 'background.risulorebook', kind: 'insert' }] },
      fixture.workspace,
      patchStore,
    );
    const patchPlan = patchPlanFromPreview(preview);
    const beforeOrder = await readFile(fixture.orderPath, 'utf8');

    const missingConfirmation = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: false }, patchPlanId: patchPlan.patchPlanId },
      { mutationMode: 'enabled', patchStore, workspace: fixture.workspace },
    ));
    const previewOnly = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true }, patchPlanId: patchPlan.patchPlanId },
      { mutationMode: 'preview-only', patchStore, workspace: fixture.workspace },
    ));
    const unknown = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true }, patchPlanId: 'patch:missing' },
      { mutationMode: 'enabled', patchStore, workspace: fixture.workspace },
    ));
    const outsidePlan = createPatchPlan({
      expectedDiagnostics: [],
      intent: 'Outside create must fail',
      operations: [{ content: 'escape\n', kind: 'file.create', path: '../escape.txt' }],
      preconditions: [createNonexistencePrecondition('../escape.txt')],
      workspaceRoot: fixture.root,
    });
    patchStore.savePatchPlan(outsidePlan);
    const outside = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true }, patchPlanId: outsidePlan.patchPlanId },
      { mutationMode: 'enabled', patchStore, workspace: fixture.workspace },
    ));

    expect(missingConfirmation.status).toBe('rejected');
    expect(previewOnly.status).toBe('rejected');
    expect(unknown.status).toBe('rejected');
    expect(outside.status).toBe('rejected');
    expect(outside.postValidation.diagnostics.some((diagnostic) => diagnostic.ruleId === 'patch.apply.path-outside-workspace')).toBe(true);
    expect(await readFile(fixture.orderPath, 'utf8')).toBe(beforeOrder);
  });

  it('records failed-validation without automatic rollback when post-validation fails', async () => {
    const fixture = await createApplyFixture();
    const patchStore = createPatchPlanStore();
    const before = await readFile(fixture.orderPath, 'utf8');
    const patchPlan = createPatchPlan({
      expectedDiagnostics: [],
      intent: 'Break order json to prove no automatic rollback',
      operations: [{ endOffset: before.length, kind: 'text.replace', path: 'characters/merry/lorebooks/_order.json', startOffset: 0, text: '{invalid json\n' }],
      preconditions: [
        createInsideWorkspacePrecondition('characters/merry/lorebooks/_order.json'),
        createFileHashPrecondition('characters/merry/lorebooks/_order.json', await computeFileHash(fixture.orderPath)),
      ],
      workspaceRoot: fixture.root,
    });
    patchStore.savePatchPlan(patchPlan);

    const result = mutationResult(await handleApplyPatchPlan(
      { confirmation: { accepted: true }, options: { postValidate: true, rollbackOnValidationError: false }, patchPlanId: patchPlan.patchPlanId },
      { mutationMode: 'enabled', patchStore, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('failed');
    expect(result.changedFiles).toHaveLength(1);
    expect(result.postValidation.status).toBe('error');
    expect(result.postValidation.diagnostics.some((diagnostic) => diagnostic.id === 'ORDER_FILE_MALFORMED_AFTER_APPLY')).toBe(true);
    expect(await readFile(fixture.orderPath, 'utf8')).toBe('{invalid json\n');
    const entries = await readJournalEntries(fixture.journalPath);
    expect(entries[entries.length - 1]?.status).toBe('failed-validation');
  });
});
