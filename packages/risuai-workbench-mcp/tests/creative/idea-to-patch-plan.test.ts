/**
 * Tests for selected creative idea to implementation plan and PatchPlan preview conversion.
 * @file packages/risuai-workbench-mcp/tests/creative/idea-to-patch-plan.test.ts
 */

import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildPatchPlanUri } from '../../src/contracts/resource-uri';
import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { IdeaPatchEnvelope } from '../../src/contracts/creative';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { createPatchPlanStore, type PatchPlanStore } from '../../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleTurnIdeaIntoPatchPlan, handleTurnIdeaIntoPlan } from '../../src/tools/creative/idea-to-patch-handlers';

const TARGET_PATH = 'characters/merry/lorebooks/combat-emotion.risulorebook';
const ORDER_PATH = 'characters/merry/lorebooks/_order.json';

function makeWorkspace(root: string): WorkspaceRootStatus {
  return { ok: true, path: root, reason: null };
}

function validInput(): Record<string, unknown> {
  return {
    idea: {
      assumptions: ['combat mood should be visible to prompt context'],
      candidateMutations: ['create_artifact', 'edit_order'],
      evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
      id: 'idea:combat-emotion',
      ranking: { mutationReadiness: 'ready-with-validation', requiredValidation: ['workbench.query_token_budget'], score: 82 },
      summary: 'Create a lorebook entry that reacts to combat mood changes.',
      title: 'Combat emotion lorebook cue',
    },
    ideaId: 'idea:combat-emotion',
    target: {
      artifact: 'lorebook',
      root: 'characters/merry',
      stem: 'combat-emotion',
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return false;
    throw error;
  }
}

function expectDiagnostic(result: unknown): DiagnosticEnvelope {
  expect(result).toMatchObject({ schema: 'risuai-workbench-mcp.diagnostics', status: 'domain_error' });
  return result as DiagnosticEnvelope;
}

describe('idea to implementation plan and patch plan conversion', () => {
  it('turns a selected idea into a non-mutating CreativeImplementationPlan', async () => {
    const result = await handleTurnIdeaIntoPlan(validInput());

    expect(result).toMatchObject({
      planId: expect.stringContaining('creative-plan:idea:combat-emotion'),
      schema: 'risuai-workbench-mcp.creative.implementation-plan',
      schemaVersion: '0.2.0',
      selectedIdeaIds: ['idea:combat-emotion'],
    });
    if ('schema' in result && result.schema === 'risuai-workbench-mcp.creative.implementation-plan') {
      expect(result.targetChanges).toEqual([
        expect.objectContaining({ artifact: 'lorebook', kind: 'create-artifact', path: TARGET_PATH, stem: 'combat-emotion' }),
        expect.objectContaining({ entry: 'combat-emotion.risulorebook', kind: 'edit-order', orderPath: ORDER_PATH }),
      ]);
      expect(result.validationPlan).toEqual(expect.arrayContaining(['validate_path', 'validate_frontmatter', 'validate_order', 'query_token_budget']));
      expect(result.steps[0].affectedFiles).toEqual([
        { operationKinds: ['order.insert'], path: ORDER_PATH },
        { operationKinds: ['file.create'], path: TARGET_PATH },
      ]);
      expect(result.steps[0].operations).toEqual([{ kind: 'file.create' }, { kind: 'order.insert' }]);
    }
  });

  it('stores an existing-contract PatchPlan preview and returns an idea-patch envelope', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-idea-patch-'));
    const patchStore = createPatchPlanStore();
    const targetAbsolutePath = path.join(tempRoot, TARGET_PATH);

    const beforeExists = await fileExists(targetAbsolutePath);
    const result = await handleTurnIdeaIntoPatchPlan(validInput(), makeWorkspace(tempRoot), patchStore) as IdeaPatchEnvelope;
    const afterExists = await fileExists(targetAbsolutePath);

    expect(beforeExists).toBe(false);
    expect(afterExists).toBe(false);
    expect(result).toMatchObject({
      affectedFiles: [ORDER_PATH, TARGET_PATH],
      ideaId: 'idea:combat-emotion',
      mutationTarget: { touchesGeneratedOnly: false, touchesSourceArtifacts: true },
      operationKinds: ['file.create', 'order.insert'],
      schema: 'risuai-workbench-mcp.creative.idea-patch',
      status: 'preview-created',
      tool: 'workbench.creative.turn_idea_into_patch_plan',
    });
    expect(result.patchPlanResource).toBe(buildPatchPlanUri(result.patchPlanId));
    expect(result.resourceLinks).toEqual([result.patchPlanResource]);
    expect(result.preApplyValidation.required).toEqual(expect.arrayContaining(['validate_path', 'validate_frontmatter', 'validate_order', 'query_token_budget']));

    const stored = patchStore.getPatchPlan(result.patchPlanId);
    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      schema: 'risuai-workbench-mcp.patch-plan',
      schemaVersion: '0.2.0',
      patchPlanId: result.patchPlanId,
      safety: { touchesSourceArtifacts: true },
      workspaceRoot: tempRoot,
    });
    expect(stored?.operations.map((operation) => operation.kind)).toEqual(['file.create', 'order.insert']);
    expect(stored?.preview.resourceLinks).toEqual([buildPatchPlanUri(result.patchPlanId)]);
    expect(stored?.preview.affectedFiles).toEqual([
      { operationKinds: ['order.insert'], path: ORDER_PATH },
      { operationKinds: ['file.create'], path: TARGET_PATH },
    ]);
  });

  it('rejects underspecified selected ideas without saving a patch plan', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-idea-patch-reject-'));
    const trackingStore = new TrackingPatchPlanStore();

    const result = await handleTurnIdeaIntoPatchPlan(
      {
        idea: {
          assumptions: [],
          evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
          id: 'idea:underspecified',
          summary: 'Maybe improve combat mood.',
          title: 'Combat mood improvement',
        },
        ideaId: 'idea:underspecified',
      },
      makeWorkspace(tempRoot),
      trackingStore,
    );

    const diagnostic = expectDiagnostic(result);
    expect(diagnostic.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_INVALID');
    expect(diagnostic.diagnostics[0].message).toContain('underspecified');
    expect(trackingStore.saved).toHaveLength(0);
  });

  it('rejects raw operation arrays and raw diffs as direct caller authority', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-idea-patch-raw-'));
    const trackingStore = new TrackingPatchPlanStore();

    const result = await handleTurnIdeaIntoPatchPlan(
      {
        ...validInput(),
        operations: [{ kind: 'file.create', path: TARGET_PATH, content: 'caller controlled' }],
        rawDiff: '--- a/file\n+++ b/file',
      },
      makeWorkspace(tempRoot),
      trackingStore,
    );

    const diagnostic = expectDiagnostic(result);
    expect(diagnostic.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_INVALID');
    expect(diagnostic.diagnostics[0].message).toContain('rawDiff');
    expect(diagnostic.diagnostics[0].message).toContain('operations');
    expect(trackingStore.saved).toHaveLength(0);
  });
});

class TrackingPatchPlanStore implements PatchPlanStore {
  readonly saved: PatchPlan[] = [];

  getPatchPlan(patchPlanId: string): PatchPlan | null {
    return this.saved.find((patchPlan) => patchPlan.patchPlanId === patchPlanId) ?? null;
  }

  findByIdeaId(_ideaId: string): PatchPlan | null {
    return null;
  }

  savePatchPlan(patchPlan: PatchPlan): void {
    this.saved.push(patchPlan);
  }
}
