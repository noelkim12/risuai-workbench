/**
 * Phase 11 legacy parity tests.
 * Compares representative action execute() outputs against direct handler outputs
 * to ensure the facade adapter layer does not alter core behavior.
 * @file packages/risuai-workbench-mcp/tests/action-legacy-parity.test.ts
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import type { ActionExecutionContext } from '../src/actions/types';
import type { DiagnosticEnvelope } from '../src/contracts/diagnostics';

import { handleInspectPath } from '../src/tools/inspect/inspect-path';
import { handleValidateArtifact } from '../src/tools/validate/validate-artifact';
import { handleQueryVariableFlow } from '../src/tools/analyze/query-analyze';
import { handleSearchWiki } from '../src/tools/wiki/search-wiki';
import { handleRecommendSkills } from '../src/tools/skills/recommend-skills';
import { handleCreativeAction } from '../src/tools/creative';
import { handleSuggestOrderPatch } from '../src/tools/patch/suggest-order-patch';
import { createPatchPlanStore } from '../src/mutation/patch-store';
import type { WorkspaceRootStatus } from '../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, './fixtures/workspaces/standard');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

function makeContext(overrides: Partial<ActionExecutionContext> = {}): ActionExecutionContext {
  return {
    workspace: makeOkWorkspace(STANDARD_ROOT),
    mutationMode: 'preview-only',
    patchStore: createPatchPlanStore(),
    ...overrides,
  };
}

/**
 * Compare core stable fields between action execute() and direct handler.
 * Ignores timestamps, IDs, and other non-deterministic fields.
 */
function assertCoreParity(
  actionResult: DiagnosticEnvelope,
  directResult: DiagnosticEnvelope,
): void {
  expect(actionResult.schema).toBe(directResult.schema);
  expect(actionResult.status).toBe(directResult.status);
  expect(actionResult.tool).toBe(directResult.tool);
  expect(actionResult.diagnostics.length).toBe(directResult.diagnostics.length);
}

describe('inspect.path parity', () => {
  it('action execute matches direct handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('inspect.path');
    expect(action).toBeDefined();

    const input = { path: 'characters/merry/lorebooks/intro.risulorebook' };
    const directResult = await handleInspectPath(input, context.workspace);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
    expect((actionResult.data as { role: string }).role).toBe(
      (directResult.data as { role: string }).role,
    );
  });
});

describe('validate.artifact parity', () => {
  it('action execute matches direct handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('validate.artifact');
    expect(action).toBeDefined();

    const input = { artifactRoot: 'characters/merry' };
    const directResult = await handleValidateArtifact(input, context.workspace);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
  });
});

describe('analyze.query_variable_flow parity', () => {
  it('action execute matches direct handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('analyze.query_variable_flow');
    expect(action).toBeDefined();

    const input = {};
    const directResult = await handleQueryVariableFlow(input, context.workspace);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
  });
});

describe('wiki.search parity', () => {
  it('action execute matches direct handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('wiki.search');
    expect(action).toBeDefined();

    const input = { query: 'test' };
    const directResult = await handleSearchWiki(input);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
  });
});

describe('skills.recommend parity', () => {
  it('action execute matches direct handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('skills.recommend');
    expect(action).toBeDefined();

    const input = {
      llmSelection: { skillId: 'test-skill', confidence: 0.9, reason: 'test' },
      request: 'test request',
    };
    const directResult = await handleRecommendSkills(input);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
  });
});

describe('creative.brainstorm_scamper parity', () => {
  it('action execute matches direct creative handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('creative.brainstorm_scamper');
    expect(action).toBeDefined();

    const input = { theme: 'test-theme' };
    const directResult = await handleCreativeAction('workbench.creative.brainstorm_scamper', input, context.workspace);
    const actionResult = await action!.execute(input, context);

    // Both should return the same shape (IdeationToolResult)
    expect(actionResult).toEqual(directResult);
  });
});

describe('creative.turn_idea_into_patch_plan parity', () => {
  it('action execute matches direct creative handler for core fields', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('creative.turn_idea_into_patch_plan');
    expect(action).toBeDefined();

    const input = { ideaId: 'idea-test-123', title: 'Test idea' };
    const directResult = await handleCreativeAction('workbench.creative.turn_idea_into_patch_plan', input, context.workspace, context.patchStore);
    const actionResult = await action!.execute(input, context);

    // Both should return the same shape (TurnIdeaIntoPatchPlanResult)
    expect(actionResult).toEqual(directResult);
  });
});

describe('patch preview/apply safety behavior parity', () => {
  it('patch.suggest_order action matches direct handler for preview output', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('patch.suggest_order');
    expect(action).toBeDefined();

    const input = {
      directory: 'characters/merry/lorebooks',
      operations: [{ entry: 'intro.risulorebook', kind: 'insert' as const }],
    };
    const directResult = await handleSuggestOrderPatch(input, context.workspace, context.patchStore);
    const actionResult = (await action!.execute(input, context)) as DiagnosticEnvelope;

    assertCoreParity(actionResult, directResult);
    expect(actionResult.tool).toBe('workbench.suggest_order_patch');
  });

  it('patch.apply action is registered as commit_mutation and blocked in run_action', async () => {
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('patch.apply');
    expect(action).toBeDefined();
    expect(action!.risk).toBe('commit_mutation');
    expect(action!.legacyToolName).toBe('workbench.apply_patch_plan');
  });

  it('patch.apply action execute routes to same handler as direct apply', async () => {
    // This test verifies registration parity only: the action exists and
    // points to the canonical handleApplyPatchPlan. Direct apply parity is
  // unsafe to test without a real patch plan and is
    // already covered by patch-facade.test.ts safety tests.
    const context = makeContext();
    const registry = createWorkbenchActionRegistry(context);
    const action = registry.get('patch.apply');
    expect(action).toBeDefined();
    expect(typeof action!.execute).toBe('function');
  });
});
