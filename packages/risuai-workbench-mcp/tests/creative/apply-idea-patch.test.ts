/**
 * Tests for creative apply_idea_patch as a narrow adapter over stored PatchPlan apply.
 * @file packages/risuai-workbench-mcp/tests/creative/apply-idea-patch.test.ts
 */

import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { readJournalEntries } from '../../src/mutation/journal';
import { createInsideWorkspacePrecondition, createNonexistencePrecondition, createPatchPlan } from '../../src/mutation/patch-preview';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { applyStoredIdeaPatch } from '../../src/creative';

interface Fixture {
  journalPath: string;
  root: string;
  targetPath: string;
  workspace: WorkspaceRootStatus;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-creative-apply-'));
  await mkdir(path.join(root, 'characters', 'merry', 'lorebooks'), { recursive: true });
  const targetPath = path.join(root, 'characters', 'merry', 'lorebooks', 'combat-emotion.risulorebook');
  return {
    journalPath: path.join(root, '.risuai-workbench-mcp', 'journal.jsonl'),
    root,
    targetPath,
    workspace: { ok: true, path: root, reason: null },
  };
}

function makePatchPlan(root: string, overrides: Partial<PatchPlan> = {}): PatchPlan {
  const target = 'characters/merry/lorebooks/combat-emotion.risulorebook';
  return {
    ...createPatchPlan({
      expectedDiagnostics: [{ category: 'creative-patch-plan', id: 'CREATIVE_PATCH_PREVIEW_CREATED', severity: 'info' }],
      intent: 'Implement selected creative idea idea:combat-emotion: Combat emotion lorebook cue',
      operations: [{ content: '---\ntitle: Combat Emotion\n---\nBody\n', kind: 'file.create', path: target, overwrite: false }],
      preconditions: [createInsideWorkspacePrecondition(target), createNonexistencePrecondition(target)],
      workspaceRoot: root,
    }),
    ...overrides,
  };
}

function diagnostic(result: DiagnosticEnvelope | MutationResultEnvelope): DiagnosticEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.diagnostics') throw new Error(`Expected diagnostics, got ${result.schema}`);
  return result;
}

function mutation(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') throw new Error(`Expected mutation result, got ${result.schema}`);
  return result;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('applyStoredIdeaPatch', () => {
  it('rejects raw edit authority fields without filesystem side effects', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const plan = makePatchPlan(fixture.root);
    store.savePatchPlan(plan);

    const rejectedInputs = [
      { path: 'characters/merry/lorebooks/combat-emotion.risulorebook' },
      { rawDiff: '--- a/file\n+++ b/file' },
      { replacementText: 'direct replacement' },
      { operations: [{ kind: 'file.create', path: 'x', content: 'y' }] },
      { shellCommand: 'rm -rf .' },
      { content: 'generated patch body' },
    ];

    for (const extra of rejectedInputs) {
      const result = diagnostic(await applyStoredIdeaPatch(
        { patchPlanId: plan.patchPlanId, ...extra },
        { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
      ));

      expect(result.status).toBe('domain_error');
      expect(result.diagnostics[0].id).toBe('MUTATION_INPUT_UNKNOWN_FIELD');
    }

    expect(await exists(fixture.targetPath)).toBe(false);
    expect(await exists(fixture.journalPath)).toBe(false);
  });

  it('returns CREATIVE_PATCH_PLAN_NOT_FOUND for missing and unknown patchPlanId', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();

    const missing = diagnostic(await applyStoredIdeaPatch(
      {},
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));
    const unknown = diagnostic(await applyStoredIdeaPatch(
      { patchPlanId: 'patch:missing' },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(missing.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
    expect(unknown.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
    expect(await exists(fixture.targetPath)).toBe(false);
  });

  it('rejects a PatchPlan stored for another workspace before applying', async () => {
    const fixture = await createFixture();
    const otherRoot = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-creative-other-'));
    const store = createPatchPlanStore();
    const plan = makePatchPlan(otherRoot);
    store.savePatchPlan(plan);

    const result = diagnostic(await applyStoredIdeaPatch(
      { patchPlanId: plan.patchPlanId },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('CREATIVE_WORKSPACE_MISMATCH');
    expect(await exists(fixture.targetPath)).toBe(false);
  });

  it('applies in preview-only mode because mutation gate is removed', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const plan = makePatchPlan(fixture.root);
    store.savePatchPlan(plan);

    const result = mutation(await applyStoredIdeaPatch(
      { patchPlanId: plan.patchPlanId },
      { mutationMode: 'preview-only', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('applied');
    expect(result.changedFiles).toHaveLength(1);
    expect(await exists(fixture.targetPath)).toBe(true);
  });

  it('applies a valid stored PatchPlan through the existing mutation envelope and journal metadata', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const plan = makePatchPlan(fixture.root);
    store.savePatchPlan(plan);

    const result = mutation(await applyStoredIdeaPatch(
      { options: { postValidate: true }, patchPlanId: plan.patchPlanId, sessionId: 'session:test' },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.schema).toBe('risuai-workbench-mcp.mutation-result');
    expect(result.tool).toBe('workbench.apply_patch_plan');
    expect(result.status).toBe('applied');
    expect(result.patchPlanId).toBe(plan.patchPlanId);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]).toMatchObject({ operationCount: 1, path: 'characters/merry/lorebooks/combat-emotion.risulorebook' });
    expect(result.changedFiles[0].afterHash).toMatch(/^sha256:/);
    expect(result.mutationId).toMatch(/^mutation:/);
    expect(result.resourceLinks[0]).toContain('risuai-workbench://mutations/journal/mutation%3A');
    expect(result.postValidation.status).toBe('ok');
    expect(await readFile(fixture.targetPath, 'utf8')).toContain('Combat Emotion');

    const entries = await readJournalEntries(fixture.journalPath);
    expect(entries[entries.length - 1]).toMatchObject({ affectedFiles: ['characters/merry/lorebooks/combat-emotion.risulorebook'], status: 'applied', toolName: 'workbench.apply_patch_plan' });
  });

  it('applies a valid stored PatchPlan without routeId (routeId is advisory, not required)', async () => {
    const fixture = await createFixture();
    const store = createPatchPlanStore();
    const plan = makePatchPlan(fixture.root);
    store.savePatchPlan(plan);

    const result = mutation(await applyStoredIdeaPatch(
      { patchPlanId: plan.patchPlanId },
      { mutationMode: 'enabled', patchStore: store, workspace: fixture.workspace },
    ));

    expect(result.status).toBe('applied');
    expect(result.patchPlanId).toBe(plan.patchPlanId);
    expect(await readFile(fixture.targetPath, 'utf8')).toContain('Combat Emotion');
  });
});
