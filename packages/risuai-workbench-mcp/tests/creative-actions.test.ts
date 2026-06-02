/**
 * Phase 5 creative action adapter tests.
 * @file packages/risuai-workbench-mcp/tests/creative-actions.test.ts
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import { handleCatalog, handleRunAction } from '../src/tools/facade';
import type { ActionExecutionContext } from '../src/actions/types';

const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');

const dummyContext: ActionExecutionContext = {
  workspace: { ok: true, path: fixturesRoot, reason: null },
  mutationMode: 'preview-only',
  patchStore: {
    getPatchPlan: () => null,
    savePatchPlan: () => {},
    findByIdeaId: () => null,
  },
};

const ALL_CREATIVE_ACTION_IDS = [
  'creative.gather_context',
  'creative.inspect_context',
  'creative.search_context',
  'creative.brainstorm_scamper',
  'creative.create_matrix',
  'creative.generate_combinations',
  'creative.extract_contradictions',
  'creative.suggest_contradiction_resolutions',
  'creative.critique_six_hats',
  'creative.rank_ideas',
  'creative.cluster_ideas',
  'creative.deduplicate_ideas',
  'creative.search_idea_graph',
  'creative.open_idea_neighborhood',
  'creative.preview_creative_impact',
  'creative.find_graph_bridge_ideas',
  'creative.critique_idea_with_analyze',
  'creative.remix_dead_code_into_ideas',
  'creative.optimize_prompt_chain_insertion',
  'creative.turn_idea_into_plan',
  'creative.turn_idea_into_patch_plan',
  'creative.preview_idea_patch',
  'creative.red_team_concept',
  'creative.apply_idea_patch',
  'creative.save_idea_session',
  'creative.write_idea_memory',
] as const;

const READ_ONLY_CREATIVE_ACTION_IDS = [
  'creative.gather_context',
  'creative.inspect_context',
  'creative.search_context',
  'creative.brainstorm_scamper',
  'creative.create_matrix',
  'creative.generate_combinations',
  'creative.extract_contradictions',
  'creative.suggest_contradiction_resolutions',
  'creative.critique_six_hats',
  'creative.rank_ideas',
  'creative.cluster_ideas',
  'creative.deduplicate_ideas',
  'creative.search_idea_graph',
  'creative.open_idea_neighborhood',
  'creative.preview_creative_impact',
  'creative.find_graph_bridge_ideas',
  'creative.critique_idea_with_analyze',
  'creative.remix_dead_code_into_ideas',
  'creative.optimize_prompt_chain_insertion',
  'creative.turn_idea_into_plan',
  'creative.red_team_concept',
] as const;

const PREVIEW_MUTATION_CREATIVE_ACTION_IDS = [
  'creative.turn_idea_into_patch_plan',
  'creative.preview_idea_patch',
] as const;

const COMMIT_MUTATION_CREATIVE_ACTION_IDS = [
  'creative.apply_idea_patch',
  'creative.save_idea_session',
  'creative.write_idea_memory',
] as const;

describe('creative action registry', () => {
  it('registers all 26 creative actions', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();

    for (const id of ALL_CREATIVE_ACTION_IDS) {
      expect(registry.get(id)).toBeDefined();
    }

    const creativeActions = actions.filter((a) => a.id.startsWith('creative.'));
    expect(creativeActions.length).toBe(26);
  });

  it('maps legacy tool names correctly', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of ALL_CREATIVE_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.legacyToolName).toBe(`workbench.${id}`);
    }
  });

  it('classifies read-only creative actions correctly', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of READ_ONLY_CREATIVE_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('read_only');
    }
  });

  it('classifies preview_mutation creative actions correctly', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of PREVIEW_MUTATION_CREATIVE_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('preview_mutation');
    }
  });

  it('classifies commit_mutation creative actions correctly', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of COMMIT_MUTATION_CREATIVE_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('commit_mutation');
    }
  });

  it('assigns correct capabilities to creative actions', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    const contextActions = ['creative.gather_context', 'creative.inspect_context', 'creative.search_context'];
    for (const id of contextActions) {
      expect(registry.get(id)!.capability).toBe('creative.context');
    }

    const ideationActions = [
      'creative.brainstorm_scamper',
      'creative.create_matrix',
      'creative.generate_combinations',
      'creative.extract_contradictions',
      'creative.suggest_contradiction_resolutions',
    ];
    for (const id of ideationActions) {
      expect(registry.get(id)!.capability).toBe('creative.ideation');
    }

    const reviewActions = [
      'creative.critique_six_hats',
      'creative.rank_ideas',
      'creative.cluster_ideas',
      'creative.deduplicate_ideas',
      'creative.search_idea_graph',
      'creative.open_idea_neighborhood',
      'creative.preview_creative_impact',
      'creative.find_graph_bridge_ideas',
      'creative.critique_idea_with_analyze',
      'creative.remix_dead_code_into_ideas',
      'creative.optimize_prompt_chain_insertion',
      'creative.red_team_concept',
    ];
    for (const id of reviewActions) {
      expect(registry.get(id)!.capability).toBe('creative.review');
    }

    const patchActions = [
      'creative.turn_idea_into_plan',
      'creative.turn_idea_into_patch_plan',
      'creative.preview_idea_patch',
      'creative.apply_idea_patch',
      'creative.save_idea_session',
      'creative.write_idea_memory',
    ];
    for (const id of patchActions) {
      expect(registry.get(id)!.capability).toBe('creative.patch');
    }
  });
});

describe('creative facade integration', () => {
  it('catalog returns creative actions by capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    const contextResult = handleCatalog({ capability: 'creative.context' }, registry);
    expect(contextResult.actions.length).toBe(3);
    expect(contextResult.actions.every((a) => a.capability === 'creative.context')).toBe(true);

    const ideationResult = handleCatalog({ capability: 'creative.ideation' }, registry);
    expect(ideationResult.actions.length).toBe(5);
    expect(ideationResult.actions.every((a) => a.capability === 'creative.ideation')).toBe(true);

    const reviewResult = handleCatalog({ capability: 'creative.review', limit: 20 }, registry);
    expect(reviewResult.actions.length).toBe(12);
    expect(reviewResult.actions.every((a) => a.capability === 'creative.review')).toBe(true);

    const patchResult = handleCatalog({ capability: 'creative.patch', limit: 20 }, registry);
    expect(patchResult.actions.length).toBe(6);
    expect(patchResult.actions.every((a) => a.capability === 'creative.patch')).toBe(true);
  });

  it('run_action executes a read-only creative action', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    const result = await handleRunAction(
      { actionId: 'creative.gather_context', args: { theme: 'test-theme' } },
      registry,
      dummyContext,
    );

    const envelope = result as { status?: string; tool?: string };
    // gather_context returns domain_warning with minimal input; execution still succeeds
    expect(envelope.status).toBe('domain_warning');
    expect(envelope.tool).toBe('workbench.creative.gather_context');
  });

  it('run_action blocks commit_mutation creative actions', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const actionId of COMMIT_MUTATION_CREATIVE_ACTION_IDS) {
      const result = (await handleRunAction(
        { actionId, args: {} },
        registry,
        dummyContext,
      )) as { ok: false; error: { code: string } };

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('BLOCKED_MUTATION');
    }
  });

  it('run_action allows preview_mutation creative actions', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const actionId of PREVIEW_MUTATION_CREATIVE_ACTION_IDS) {
      const result = await handleRunAction(
        { actionId, args: {} },
        registry,
        dummyContext,
      );

      // preview_mutation actions are not blocked; they may return domain warnings
      // because no patch plan is stored, but they should not be BLOCKED_MUTATION
      const errorResult = result as { ok?: false; error?: { code: string } };
      expect(errorResult.error?.code).not.toBe('BLOCKED_MUTATION');
    }
  });
});
