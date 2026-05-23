/**
 * Registry contract tests for roadmap MCP tools, resources, and prompts.
 * @file packages/risuai-workbench-mcp/tests/contracts/registry.test.ts
 */

import { describe, expect, it } from 'vitest';

import { buildRegistrySnapshot, WORKBENCH_REGISTRY } from '../../src/registry';
import {
  buildMutationJournalCollectionUri,
  buildMutationJournalUri,
  buildPatchPlanUri,
} from '../../src/contracts/resource-uri';

const proposalPhaseToolNames = [
  'workbench.inspect_path',
  'workbench.inspect_artifact',
  'workbench.validate_artifact',
  'workbench.validate_path',
  'workbench.validate_order',
  'workbench.validate_root_markers',
  'workbench.validate_metadata',
  'workbench.validate_frontmatter',
  'workbench.build_path',
  'workbench.search_wiki',
  'workbench.suggest_tests',
  'workbench.route_intent',
  'workbench.suggest_patch',
  'workbench.suggest_order_patch',
  'workbench.suggest_frontmatter_patch',
  'workbench.suggest_root_marker_patch',
  'workbench.plan_wiki_update',
  'workbench.diff_wiki',
  'workbench.apply_patch_plan',
  'workbench.edit_order',
  'workbench.edit_frontmatter',
  'workbench.edit_metadata',
  'workbench.create_artifact',
  'workbench.run_extract',
  'workbench.run_scaffold',
  'workbench.query_variable_flow',
  'workbench.query_variable',
  'workbench.query_lua_analysis',
  'workbench.query_lua_call_graph',
  'workbench.query_lua_state_access',
  'workbench.query_button_actions',
  'workbench.query_relationship_network',
  'workbench.query_prompt_chain',
  'workbench.query_composition_conflicts',
  'workbench.query_dead_code_findings',
  'workbench.query_token_budget',
  'workbench.explain_risulua_workspace',
  'workbench.guide_risulua_module',
  'workbench.explain_risulua_runtime_api',
  'workbench.explain_lorebook_prompt_injection',
  'workbench.explain_context_feedback_loop',
  'workbench.plan_structured_output_loop',
  'workbench.move_artifact',
  'workbench.delete_artifact',
  'workbench.refresh_wiki',
  'workbench.rollback_mutation',
  'workbench.refresh_analyze_snapshot',
] as const;

const proposalPromptNames = [
  'workbench.review_artifact_change',
  'workbench.apply_artifact_change',
  'workbench.plan_structure_migration',
  'workbench.explain_diagnostic',
  'workbench.audit_workspace_structure',
  'workbench.prepare_tests_for_change',
  'workbench.explore_wiki',
  'workbench.refresh_wiki_from_analyze',
  'workbench.trace_variable_flow',
  'workbench.explain_button_action',
  'workbench.trace_lua_handler',
  'workbench.review_relationship_network',
  'workbench.review_prompt_chain',
  'workbench.explain_analyze_diagnostic',
] as const;

describe('workbench registry contracts', () => {
  it('lists roadmap tools in deterministic proposal phase order with implementation status', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);

    expect(snapshot.tools.map((tool) => tool.name).slice(0, proposalPhaseToolNames.length + 1)).toEqual([
      'workbench.smoke',
      ...proposalPhaseToolNames,
    ]);
    expect(snapshot.tools[0]).toMatchObject({ implementationStatus: 'implemented', mutates: false, name: 'workbench.smoke' });
    expect(snapshot.tools.find((tool) => tool.name === 'workbench.suggest_order_patch')).toMatchObject({
      implementationStatus: 'implemented',
      mutates: false,
      phase: 'phase-2',
    });
    expect(snapshot.tools.find((tool) => tool.name === 'workbench.edit_order')).toMatchObject({
      implementationStatus: 'implemented',
      mutates: true,
      phase: 'phase-3',
    });

    const phase1ReadOnlyTools = [
      'workbench.validate_artifact',
      'workbench.validate_root_markers',
      'workbench.validate_metadata',
      'workbench.build_path',
    ];
    expect(phase1ReadOnlyTools.every((name) => {
      const tool = snapshot.tools.find((t) => t.name === name);
      return tool && tool.implementationStatus === 'implemented' && tool.mutates === false && tool.phase === 'phase-1';
    })).toBe(true);

    expect(snapshot.tools.find((tool) => tool.name === 'workbench.route_intent')).toMatchObject({
      implementationStatus: 'implemented',
      mutates: false,
      phase: 'phase-1',
    });

    const phase4ReadOnlyTools = [
      'workbench.query_lua_analysis',
      'workbench.query_lua_state_access',
      'workbench.query_dead_code_findings',
    ];
    expect(phase4ReadOnlyTools.every((name) => {
      const tool = snapshot.tools.find((t) => t.name === name);
      return tool && tool.implementationStatus === 'implemented' && tool.mutates === false && tool.phase === 'phase-4';
    })).toBe(true);
  });

  it('marks implemented Phase 5 mutation tools without notImplemented payloads', () => {
    const phase5Tools = WORKBENCH_REGISTRY.tools.filter(
      (tool) => tool.phase === 'phase-5' && !tool.name.startsWith('workbench.creative.'),
    );

    expect(phase5Tools.map((tool) => tool.name)).toEqual([
      'workbench.move_artifact',
      'workbench.delete_artifact',
      'workbench.refresh_wiki',
      'workbench.rollback_mutation',
      'workbench.refresh_analyze_snapshot',
    ]);
    expect(phase5Tools.every((tool) => tool.implementationStatus === 'implemented')).toBe(true);
    expect(phase5Tools.every((tool) => tool.notImplementedResult === undefined)).toBe(true);
  });

  it('lists read-only resource URI templates including mutation journal and patch plans', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);

    expect(snapshot.resources.map((resource) => resource.name).slice(0, 8)).toEqual([
      'workbench.resource.wiki',
      'workbench.resource.rule_catalog',
      'workbench.resource.schema',
      'workbench.resource.analyze_graph',
      'workbench.resource.diagnostics',
      'workbench.resource.patch_preview',
      'workbench.resource.mutation_journal',
      'workbench.resource.patch_plan',
    ]);
    expect(snapshot.resources.every((resource) => resource.readOnly)).toBe(true);
    expect(buildMutationJournalCollectionUri()).toBe('risuai-workbench://mutations/journal');
    expect(buildMutationJournalUri('mutation:001')).toBe('risuai-workbench://mutations/journal/mutation%3A001');
    expect(buildPatchPlanUri('patch:001')).toBe('risuai-workbench://mutations/patch-plans/patch%3A001');
  });

  it('lists prompt names from the proposal in stable order', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);

    expect(snapshot.prompts.map((prompt) => prompt.name).slice(0, proposalPromptNames.length)).toEqual([...proposalPromptNames]);
  });
});
