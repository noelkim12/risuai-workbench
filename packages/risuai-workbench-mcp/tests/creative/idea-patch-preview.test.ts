/**
 * Tests for creative idea patch preview — reads stored PatchPlan data and returns
 * compact summaries without mutating PatchPlanStore, session store, or source files.
 * @file packages/risuai-workbench-mcp/tests/creative/idea-patch-preview.test.ts
 */

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { IdeaPatchPreviewEnvelope } from '../../src/creative/idea-patch-preview';
import { previewStoredIdeaPatch } from '../../src/creative/idea-patch-preview';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import { readWorkbenchResource } from '../../src/resources';
import { WORKBENCH_REGISTRY } from '../../src/registry';

function makePatchPlan(overrides: Partial<PatchPlan> = {}): PatchPlan {
  return {
    createdAt: '2026-05-22T00:00:00Z',
    expectedDiagnostics: [
      { category: 'creative-patch-plan', id: 'CREATIVE_PATCH_PREVIEW_CREATED', severity: 'info' as const },
    ],
    intent: 'Implement selected creative idea idea:combat-emotion: Combat emotion lorebook cue',
    operations: [
      { content: '---\ntitle: Test\n---', kind: 'file.create', overwrite: false, path: 'characters/merry/lorebooks/combat-emotion.risulorebook' },
      { entry: 'combat-emotion.risulorebook', kind: 'order.insert', orderPath: 'characters/merry/lorebooks/_order.json' },
    ],
    patchPlanId: 'patch:test-001',
    preconditions: [
      { kind: 'path.inside-workspace', message: 'Target must be inside workspace.', path: 'characters/merry/lorebooks/combat-emotion.risulorebook' },
      { kind: 'path.not-exists', message: 'Target file must not already exist.', path: 'characters/merry/lorebooks/combat-emotion.risulorebook' },
    ],
    preview: {
      affectedFiles: [
        { operationKinds: ['file.create'], path: 'characters/merry/lorebooks/combat-emotion.risulorebook' },
        { operationKinds: ['order.insert'], path: 'characters/merry/lorebooks/_order.json' },
      ],
      resourceLinks: ['risuai-workbench://mutations/patch-plans/patch:test-001'],
      unifiedDiff: '--- /dev/null\n+++ b/characters/merry/lorebooks/combat-emotion.risulorebook',
    },
    safety: {
      destructive: false,
      requiresConfirmation: true,
      touchesGeneratedOnly: false,
      touchesSourceArtifacts: true,
    },
    schema: 'risuai-workbench-mcp.patch-plan',
    schemaVersion: '0.2.0',
    workspaceRoot: '/tmp/test-workspace',
    ...overrides,
  };
}

describe('previewStoredIdeaPatch', () => {
  it('returns compact summary for a stored PatchPlan', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    const result = previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store);

    expect(result).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.idea-patch',
      schemaVersion: '0.2.0',
      status: 'ok',
      tool: 'workbench.creative.preview_idea_patch',
      patchPlanId: 'patch:test-001',
    });

    const preview = result as IdeaPatchPreviewEnvelope;

    // Affected files
    expect(preview.affectedFiles).toEqual([
      'characters/merry/lorebooks/combat-emotion.risulorebook',
      'characters/merry/lorebooks/_order.json',
    ]);

    // Operation kinds
    expect(preview.operationKinds).toEqual(['file.create', 'order.insert']);

    // Expected diagnostics
    expect(preview.expectedDiagnostics).toEqual([
      { category: 'creative-patch-plan', id: 'CREATIVE_PATCH_PREVIEW_CREATED', severity: 'info' },
    ]);

    // Preconditions
    expect(preview.preconditions).toHaveLength(2);
    expect(preview.preconditions[0]).toMatchObject({ kind: 'path.inside-workspace' });
    expect(preview.preconditions[1]).toMatchObject({ kind: 'path.not-exists' });

    // Safety flags
    expect(preview.safety).toEqual({
      destructive: false,
      requiresConfirmation: true,
      touchesGeneratedOnly: false,
      touchesSourceArtifacts: true,
    });

    // Resource links
    expect(preview.resourceLinks).toContain('risuai-workbench://mutations/patch-plans/patch:test-001');
    expect(preview.patchPlanResource).toContain('patch-plans');

    // Pre-apply validation
    expect(preview.preApplyValidation.required).toEqual(expect.arrayContaining(['validate_path', 'validate_nonexistence']));
  });

  it('returns CREATIVE_PATCH_PLAN_NOT_FOUND for missing patchPlanId', () => {
    const store = createPatchPlanStore();

    const result = previewStoredIdeaPatch({}, store);

    expect(result).toMatchObject({
      schema: 'risuai-workbench-mcp.diagnostics',
      status: 'domain_error',
      tool: 'workbench.creative.preview_idea_patch',
    });

    const diag = result as DiagnosticEnvelope;
    expect(diag.diagnostics).toHaveLength(1);
    expect(diag.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
    expect(diag.diagnostics[0].severity).toBe('error');
    expect(diag.diagnostics[0].category).toBe('creative-patch-plan');
  });

  it('returns CREATIVE_PATCH_PLAN_NOT_FOUND for unknown patchPlanId', () => {
    const store = createPatchPlanStore();

    const result = previewStoredIdeaPatch({ patchPlanId: 'missing' }, store);

    expect(result).toMatchObject({
      schema: 'risuai-workbench-mcp.diagnostics',
      status: 'domain_error',
    });

    const diag = result as DiagnosticEnvelope;
    expect(diag.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
    expect(diag.diagnostics[0].message).toContain('missing');
  });

  it('returns CREATIVE_PATCH_PLAN_NOT_FOUND when patchStore is not provided', () => {
    const result = previewStoredIdeaPatch({ patchPlanId: 'any-id' }, undefined);

    expect(result).toMatchObject({
      schema: 'risuai-workbench-mcp.diagnostics',
      status: 'domain_error',
    });

    const diag = result as DiagnosticEnvelope;
    expect(diag.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
  });

  it('is read-only and does not alter PatchPlanStore', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    // Preview multiple times
    previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store);
    previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store);
    previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store);

    // Original plan unchanged
    const stored = store.getPatchPlan('patch:test-001');
    expect(stored).toEqual(plan);
    expect(stored!.operations).toHaveLength(2);
    expect(stored!.patchPlanId).toBe('patch:test-001');
  });

  it('accepts alternative input field names for patchPlanId', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    const result = previewStoredIdeaPatch({ patchPlanRef: 'patch:test-001' }, store);
    expect(result).toMatchObject({ status: 'ok' });

    const result2 = previewStoredIdeaPatch({ patchPlan: 'patch:test-001' }, store);
    expect(result2).toMatchObject({ status: 'ok' });
  });

  it('extracts ideaId from patch plan intent', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    const result = previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store) as IdeaPatchPreviewEnvelope;
    expect(result.ideaId).toBe('idea:combat-emotion');
  });

  it('falls back to patchPlanId as ideaId when intent has no idea reference', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan({ intent: 'Generic patch plan' });
    store.savePatchPlan(plan);

    const result = previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store) as IdeaPatchPreviewEnvelope;
    expect(result.ideaId).toBe('patch:test-001');
  });

  it('accepts patchPlanId via MCP input schema field', () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    // Regression: patchPlanId must be accepted by the MCP input schema.
    // The handler receives this after zod parsing, so the raw object
    // should have patchPlanId as a top-level key.
    const result = previewStoredIdeaPatch({ patchPlanId: 'patch:test-001' }, store);
    expect(result).toMatchObject({ status: 'ok', patchPlanId: 'patch:test-001' });
  });
});

describe('idea patch-plan resource URI decoding', () => {
  const ideaPatchPlanEntry = WORKBENCH_REGISTRY.resources.find(
    (entry) => entry.name === 'workbench.creative.resource.idea_patch_plan',
  );
  const workspace = { ok: true as const, path: '/tmp/test-workspace', reason: null };

  it('finds stored PatchPlan via risuai-workbench://ideas/{ideaId}/patch-plan resource', async () => {
    const store = createPatchPlanStore();
    const plan = makePatchPlan();
    store.savePatchPlan(plan);

    // In Node URL semantics, 'ideas' is the host, pathname is '/idea%3Acombat-emotion/patch-plan'
    const uri = new URL('risuai-workbench://ideas/idea%3Acombat-emotion/patch-plan');

    const result = await readWorkbenchResource(ideaPatchPlanEntry!, uri, workspace, store);

    const body = JSON.parse((result.contents[0] as { text: string }).text);
    expect(body.status).toBe('ok');
    expect(body.data.ideaId).toBe('idea:combat-emotion');
    expect(body.data.patchPlanId).toBe('patch:test-001');
    expect(body.data.affectedFiles).toEqual([
      'characters/merry/lorebooks/combat-emotion.risulorebook',
      'characters/merry/lorebooks/_order.json',
    ]);
    expect(body.data.operationKinds).toEqual(['file.create', 'order.insert']);
    expect(body.data.safety).toEqual({
      destructive: false,
      requiresConfirmation: true,
      touchesGeneratedOnly: false,
      touchesSourceArtifacts: true,
    });
  });

  it('returns not_found for unknown ideaId via resource URI', async () => {
    const store = createPatchPlanStore();

    const uri = new URL('risuai-workbench://ideas/unknown-idea/patch-plan');
    const result = await readWorkbenchResource(ideaPatchPlanEntry!, uri, workspace, store);

    const body = JSON.parse((result.contents[0] as { text: string }).text);
    expect(body.status).toBe('not_found');
    expect(body.data.requestedId).toBe('unknown-idea');
  });

  it('returns not_found when no patchStore is provided', async () => {
    const uri = new URL('risuai-workbench://ideas/idea%3Acombat-emotion/patch-plan');
    const result = await readWorkbenchResource(ideaPatchPlanEntry!, uri, workspace, undefined);

    const body = JSON.parse((result.contents[0] as { text: string }).text);
    expect(body.status).toBe('not_found');
  });
});
