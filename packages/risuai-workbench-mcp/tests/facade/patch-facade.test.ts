/**
 * Phase 7 patch facade tool tests.
 * @file packages/risuai-workbench-mcp/tests/facade/patch-facade.test.ts
 */

import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../../src/actions/create-registry';
import type { ActionExecutionContext } from '../../src/actions/types';
import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import type { MutationResultEnvelope } from '../../src/contracts/mutation-result';
import type { PatchPlan } from '../../src/contracts/patch-plan';
import { createPatchPlanStore } from '../../src/mutation/patch-store';
import {
  handlePatchPreview,
  handlePatchApply,
} from '../../src/tools/facade';

function dummyContext(overrides: Partial<ActionExecutionContext> = {}): ActionExecutionContext {
  return {
    workspace: { ok: true, path: '/tmp/workspace', reason: null },
    mutationMode: 'preview-only',
    patchStore: createPatchPlanStore(),
    ...overrides,
  };
}

function mutationResult(result: DiagnosticEnvelope | MutationResultEnvelope): MutationResultEnvelope {
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') {
    throw new Error(`Expected mutation result, got ${result.schema}`);
  }
  return result;
}

function patchPlanFromPreview(result: DiagnosticEnvelope): PatchPlan {
  return (result.data as { patchPlan: PatchPlan }).patchPlan;
}

async function createPatchFixture(): Promise<{ root: string; workspace: { ok: true; path: string; reason: null } }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-patch-facade-'));
  const orderDirectory = path.join(root, 'characters', 'merry', 'lorebooks');
  await mkdir(orderDirectory, { recursive: true });
  await writeFile(path.join(orderDirectory, 'intro.risulorebook'), '---\nname: intro\n---\nbody\n', 'utf8');
  await writeFile(path.join(orderDirectory, 'background.risulorebook'), '---\nname: background\n---\nbody\n', 'utf8');
  await writeFile(path.join(orderDirectory, '_order.json'), `${JSON.stringify(['intro.risulorebook'], null, 2)}\n`, 'utf8');
  return {
    root,
    workspace: { ok: true, path: root, reason: null },
  };
}

describe('handlePatchPreview', () => {
  it('executes a registered preview action by actionId + args', async () => {
    const fixture = await createPatchFixture();
    const context = dummyContext({ workspace: fixture.workspace });
    const registry = createWorkbenchActionRegistry(context);

    const result = await handlePatchPreview(
      { actionId: 'patch.suggest_order', args: { directory: 'characters/merry/lorebooks', operations: [{ entry: 'background.risulorebook', kind: 'insert' }] } },
      registry,
      context,
    );

    const envelope = result as DiagnosticEnvelope;
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.suggest_order_patch');
    expect(envelope.data).toBeDefined();
    expect((envelope.data as { patchPlan?: PatchPlan }).patchPlan).toBeDefined();
  });

  it('stores and returns a supplied patchPlan pass-through', async () => {
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const plan: PatchPlan = {
      schema: 'risuai-workbench-mcp.patch-plan',
      schemaVersion: '0.2.0',
      patchPlanId: 'patch:test:abc123',
      createdAt: new Date().toISOString(),
      workspaceRoot: '/tmp/workspace',
      intent: 'Test pass-through',
      operations: [{ kind: 'file.create', path: 'test.txt', content: 'hello' }],
      preconditions: [],
      expectedDiagnostics: [],
      preview: { affectedFiles: [], resourceLinks: [] },
    safety: { destructive: false, touchesGeneratedOnly: false, touchesSourceArtifacts: true },
    };

    const result = await handlePatchPreview(
      { patchPlan: plan as unknown as Record<string, unknown> },
      registry,
      context,
    );

    const envelope = result as DiagnosticEnvelope;
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.patch_preview');
    expect((envelope.data as { patchPlan: PatchPlan }).patchPlan.patchPlanId).toBe('patch:test:abc123');
    expect(context.patchStore.getPatchPlan('patch:test:abc123')).not.toBeNull();
  });

  it('returns error for unknown actionId', async () => {
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const result = await handlePatchPreview(
      { actionId: 'patch.unknown_action' },
      registry,
      context,
    );

    const errorResult = result as { ok: false; error: { code: string } };
    expect(errorResult.ok).toBe(false);
    expect(errorResult.error.code).toBe('UNKNOWN_ACTION');
  });

  it('blocks commit_mutation actions at preview boundary', async () => {
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const result = await handlePatchPreview(
      { actionId: 'patch.apply', args: { patchPlanId: 'patch:test' } },
      registry,
      context,
    );

    const errorResult = result as { ok: false; error: { code: string; message: string } };
    expect(errorResult.ok).toBe(false);
    expect(errorResult.error.code).toBe('BLOCKED_MUTATION');
    expect(errorResult.error.message).toContain('patch_apply');
  });

  it('returns error when neither actionId nor patchPlan is provided', async () => {
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const result = await handlePatchPreview({}, registry, context);

    const envelope = result as DiagnosticEnvelope;
    expect(envelope.status).toBe('domain_error');
    expect(envelope.diagnostics[0].id).toBe('PATCH_PREVIEW_MISSING_INPUT');
  });

  it('returns error for invalid patchPlan pass-through', async () => {
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const result = await handlePatchPreview(
      { patchPlan: { intent: 'missing id' } as unknown as Record<string, unknown> },
      registry,
      context,
    );

    const envelope = result as DiagnosticEnvelope;
    expect(envelope.status).toBe('domain_error');
    expect(envelope.diagnostics[0].id).toBe('PATCH_PREVIEW_INVALID_PLAN');
  });
});

describe('handlePatchApply', () => {
  it('applies a stored patch plan in enabled mode', async () => {
    const fixture = await createPatchFixture();
    const context = dummyContext({ workspace: fixture.workspace, mutationMode: 'enabled' });
    const registry = createWorkbenchActionRegistry(context);

    // Create a preview first
    const preview = await handlePatchPreview(
      { actionId: 'patch.suggest_order', args: { directory: 'characters/merry/lorebooks', operations: [{ entry: 'background.risulorebook', kind: 'insert' }] } },
      registry,
      context,
    );
    const patchPlan = patchPlanFromPreview(preview as DiagnosticEnvelope);

    const result = mutationResult(await handlePatchApply(
      { patchPlanId: patchPlan.patchPlanId, options: { postValidate: true } },
      context,
    ));

    expect(result.status).toBe('applied');
    expect(result.patchPlanId).toBe(patchPlan.patchPlanId);
    expect(result.changedFiles).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(fixture.root, 'characters', 'merry', 'lorebooks', '_order.json'), 'utf8'))).toEqual(['intro.risulorebook', 'background.risulorebook']);
  });

  it('applies without confirmation input', async () => {
    const fixture = await createPatchFixture();
    const context = dummyContext({ workspace: fixture.workspace, mutationMode: 'enabled' });
    const registry = createWorkbenchActionRegistry(context);

    const preview = await handlePatchPreview(
      { actionId: 'patch.suggest_order', args: { directory: 'characters/merry/lorebooks', operations: [{ entry: 'background.risulorebook', kind: 'insert' }] } },
      registry,
      context,
    );
    const patchPlan = patchPlanFromPreview(preview as DiagnosticEnvelope);
    const result = mutationResult(await handlePatchApply(
      { patchPlanId: patchPlan.patchPlanId },
      context,
    ));

    expect(result.status).toBe('applied');
    expect(JSON.parse(await readFile(path.join(fixture.root, 'characters', 'merry', 'lorebooks', '_order.json'), 'utf8'))).toEqual(['intro.risulorebook', 'background.risulorebook']);
  });

  it('applies in preview-only mode because mutation gate is removed', async () => {
    const fixture = await createPatchFixture();
    const context = dummyContext({ workspace: fixture.workspace, mutationMode: 'preview-only' });
    const registry = createWorkbenchActionRegistry(context);

    const preview = await handlePatchPreview(
      { actionId: 'patch.suggest_order', args: { directory: 'characters/merry/lorebooks', operations: [{ entry: 'background.risulorebook', kind: 'insert' }] } },
      registry,
      context,
    );
    const patchPlan = patchPlanFromPreview(preview as DiagnosticEnvelope);

    const result = mutationResult(await handlePatchApply(
      { patchPlanId: patchPlan.patchPlanId },
      context,
    ));

    expect(result.status).toBe('applied');
  });

  it('returns error for unknown patchPlanId', async () => {
    const fixture = await createPatchFixture();
    const context = dummyContext({ workspace: fixture.workspace, mutationMode: 'enabled' });

    const result = mutationResult(await handlePatchApply(
      { patchPlanId: 'patch:missing:plan' },
      context,
    ));

    expect(result.status).toBe('rejected');
    expect(result.postValidation.diagnostics[0].id).toBe('PATCH_PLAN_NOT_FOUND');
  });

  it('returns patch-store error when patch plan is missing', async () => {
    const context = dummyContext({ mutationMode: 'enabled' });

    const result = mutationResult(await handlePatchApply(
      { patchPlanId: 'patch:test' } as unknown as Parameters<typeof handlePatchApply>[0],
      context,
    ));

    expect(result.status).toBe('rejected');
    expect(result.postValidation.diagnostics[0].id).toBe('PATCH_PLAN_NOT_FOUND');
  });
});

describe('run_action allows patch commit mutations', () => {
  it('passes patch.apply through run_action', async () => {
    const { handleRunAction } = await import('../../src/tools/facade/run-action-tool.js');
    const context = dummyContext();
    const registry = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'patch.apply', args: { patchPlanId: 'patch:test' } },
      registry,
      context,
    );

    const envelope = result as { status: string; postValidation: { diagnostics: Array<{ id: string }> } };
    expect(envelope.status).toBe('rejected');
    expect(envelope.postValidation.diagnostics[0]?.id).toBe('PATCH_PLAN_NOT_FOUND');
  });
});
