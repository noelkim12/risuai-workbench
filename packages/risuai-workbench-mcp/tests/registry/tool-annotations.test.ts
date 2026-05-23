/**
 * Registry-derived MCP tool annotation hint tests.
 * @file packages/risuai-workbench-mcp/tests/registry/tool-annotations.test.ts
 */

import { describe, expect, it } from 'vitest';

import { annotationsForTool } from '../../src/registry/tool-annotations';

describe('annotationsForTool', () => {
  it('returns read-only hints for a non-mutating inspect tool', () => {
    const result = annotationsForTool('workbench.inspect_path');

    expect(result).toEqual({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    });
  });

  it('returns destructive hint for apply_patch_plan', () => {
    const result = annotationsForTool('workbench.apply_patch_plan');

    expect(result).toEqual({
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    });
  });

  it('marks all destructive tools correctly', () => {
    const destructiveTools = [
      'workbench.delete_artifact',
      'workbench.move_artifact',
      'workbench.apply_patch_plan',
      'workbench.rollback_mutation',
      'workbench.creative.apply_idea_patch',
    ];

    for (const name of destructiveTools) {
      const result = annotationsForTool(name);
      expect(result.destructiveHint).toBe(true);
      expect(result.readOnlyHint).toBe(false);
      expect(result.idempotentHint).toBe(false);
      expect(result.openWorldHint).toBe(false);
    }
  });

  it('returns non-destructive mutating hints for non-destructive mutation tools', () => {
    const nonDestructiveMutatingTools = [
      'workbench.edit_order',
      'workbench.edit_frontmatter',
      'workbench.edit_metadata',
      'workbench.create_artifact',
      'workbench.run_extract',
      'workbench.run_scaffold',
      'workbench.refresh_wiki',
      'workbench.creative.save_idea_session',
      'workbench.creative.write_idea_memory',
    ];

    for (const name of nonDestructiveMutatingTools) {
      const result = annotationsForTool(name);
      expect(result.destructiveHint).toBe(false);
      expect(result.readOnlyHint).toBe(false);
      expect(result.idempotentHint).toBe(false);
      expect(result.openWorldHint).toBe(false);
    }
  });

  it('returns conservative false hints for a missing tool', () => {
    const result = annotationsForTool('workbench.nonexistent_tool');

    expect(result).toEqual({
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    });
  });

  it('returns read-only hints for all non-mutating tools consistently', () => {
    const readOnlyTools = [
      'workbench.smoke',
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
      'workbench.refresh_analyze_snapshot',
      'workbench.creative.gather_context',
      'workbench.creative.inspect_context',
      'workbench.creative.search_context',
      'workbench.creative.brainstorm_scamper',
      'workbench.creative.create_matrix',
      'workbench.creative.generate_combinations',
      'workbench.creative.extract_contradictions',
      'workbench.creative.suggest_contradiction_resolutions',
      'workbench.creative.critique_six_hats',
      'workbench.creative.rank_ideas',
      'workbench.creative.cluster_ideas',
      'workbench.creative.deduplicate_ideas',
      'workbench.creative.search_idea_graph',
      'workbench.creative.open_idea_neighborhood',
      'workbench.creative.preview_creative_impact',
      'workbench.creative.find_graph_bridge_ideas',
      'workbench.creative.critique_idea_with_analyze',
      'workbench.creative.remix_dead_code_into_ideas',
      'workbench.creative.optimize_prompt_chain_insertion',
      'workbench.creative.turn_idea_into_plan',
      'workbench.creative.turn_idea_into_patch_plan',
      'workbench.creative.preview_idea_patch',
      'workbench.creative.red_team_concept',
    ];

    for (const name of readOnlyTools) {
      const result = annotationsForTool(name);
      expect(result.readOnlyHint).toBe(true);
      expect(result.destructiveHint).toBe(false);
      expect(result.idempotentHint).toBe(true);
      expect(result.openWorldHint).toBe(false);
    }
  });
});
