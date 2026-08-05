import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import type { ActionExecutionContext } from '../src/actions/types';
import { createPatchPlanStore } from '../src/mutation/patch-store';
import { handleCatalog, handlePrepareAction, handleRunAction } from '../src/tools/facade';
import { handleRouteIntent } from '../src/tools/intent-route';

const context: ActionExecutionContext = {
  workspace: {
    ok: true,
    path: path.resolve(__dirname, 'fixtures', 'workspaces', 'standard'),
    reason: null,
  },
  mutationMode: 'preview-only',
  patchStore: createPatchPlanStore(),
};

describe('facade diagnostic contracts', () => {
  it('explains what a successful dry run guarantees', async () => {
    const registry = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'analyze.query_relationship_network', args: {}, dryRun: true },
      registry,
      context,
    );

    expect(result).toEqual({
      actionId: 'analyze.query_relationship_network',
      dryRun: true,
      executed: false,
      meaning: 'arguments_validated_only',
      next: {
        actionId: 'analyze.query_relationship_network',
        dryRun: false,
      },
      ok: true,
      risk: 'read_only',
    });
  });

  it('unwraps optional Zod fields into useful prepare_action types', () => {
    const registry = createWorkbenchActionRegistry(context);

    const result = handlePrepareAction(
      { actionId: 'analyze.query_relationship_network' },
      registry,
    );

    expect(result?.fields.sourcePath).toMatchObject({ required: false, type: 'string' });
    expect(result?.fields.elements).toMatchObject({ required: false, type: 'array' });
    expect(result?.fields.luaSources).toMatchObject({ required: false, type: 'array' });
  });

  it('discovers prompt-chain analysis from lorebook injection language', () => {
    const registry = createWorkbenchActionRegistry(context);

    const result = handleCatalog({ query: 'lorebook injection' }, registry);

    expect(result.actions.map((action) => action.id)).toContain('analyze.query_prompt_chain');
  });

  it.each([
    'inspect the current module workspace',
    'validate this artifact',
    'analyze variable flow',
    'analyze RisuLua syntax and call graph',
    'run a RisuLua runtime smoke regression',
    'explore the workspace wiki',
    'update the documentation skill',
  ])('only recommends registered action IDs for: %s', async (request) => {
    const registry = createWorkbenchActionRegistry(context);

    const result = await handleRouteIntent({ request });
    const route = result.data?.route;

    expect(route).toBeDefined();
    for (const actionId of route?.recommendedActions ?? []) {
      expect(registry.get(actionId), `${actionId} should be registered`).not.toBeNull();
    }
    for (const step of route?.workflow ?? []) {
      if (step.actionId) {
        expect(registry.get(step.actionId), `${step.actionId} should be registered`).not.toBeNull();
      }
    }
  });
});
