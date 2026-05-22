/**
 * Creative capability registry metadata tests.
 * @file packages/risuai-workbench-mcp/tests/registry/creative-registry.test.ts
 */

import { describe, expect, it } from 'vitest';

import { buildRegistrySnapshot, WORKBENCH_REGISTRY } from '../../src/registry';

const creativeKbReference = 'docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md';

const readOnlyCreativeToolNames = [
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
] as const;

const implementedCreativeToolNames = [
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
  'workbench.creative.apply_idea_patch',
  'workbench.creative.save_idea_session',
  'workbench.creative.write_idea_memory',
] as const;

const previewCreativeToolNames = [
  'workbench.creative.turn_idea_into_plan',
  'workbench.creative.turn_idea_into_patch_plan',
  'workbench.creative.preview_idea_patch',
  'workbench.creative.red_team_concept',
] as const;

const mutatingCreativeToolNames = [
  'workbench.creative.apply_idea_patch',
  'workbench.creative.save_idea_session',
  'workbench.creative.write_idea_memory',
] as const;

const creativeResourceUriTemplates = [
  'risuai-workbench://methods',
  'risuai-workbench://methods/scamper',
  'risuai-workbench://methods/six-hats',
  'risuai-workbench://methods/morphological-analysis',
  'risuai-workbench://methods/triz',
  'risuai-workbench://methods/reverse-brainstorming',
  'risuai-workbench://rubrics/idea-quality',
  'risuai-workbench://rubrics/artifact-fit',
  'risuai-workbench://ideas/sessions/{sessionId}',
  'risuai-workbench://ideas/{ideaId}',
  'risuai-workbench://ideas/{ideaId}/patch-plan',
] as const;

const creativePromptNames = [
  'workbench.creative.brainstorm_from_context',
  'workbench.creative.scamper_lorebook_entries',
  'workbench.creative.scamper_prompt_chain_variants',
  'workbench.creative.six_hats_idea_review',
  'workbench.creative.morphological_explore',
  'workbench.creative.triz_resolve_contradiction',
  'workbench.creative.reverse_brainstorm_failure_modes',
  'workbench.creative.combine_concepts',
  'workbench.creative.find_distant_analogies',
  'workbench.creative.turn_idea_into_patch',
  'workbench.creative.apply_selected_idea',
  'workbench.creative.red_team_concept',
  'workbench.creative.synthesize_idea_session',
] as const;

describe('creative registry metadata', () => {
  it('exposes creative tools with all Task 15 surfaces marked implemented', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);
    const creativeTools = snapshot.tools.filter((tool) => tool.name.startsWith('workbench.creative.'));
    const creativeToolsByName = new Map(creativeTools.map((tool) => [tool.name, tool]));

    expect(creativeTools.map((tool) => tool.name)).toEqual([
      ...readOnlyCreativeToolNames,
      ...previewCreativeToolNames,
      ...mutatingCreativeToolNames,
    ]);
    for (const name of implementedCreativeToolNames) {
      expect(creativeToolsByName.get(name)).toMatchObject({ implementationStatus: 'implemented', name, notImplementedResult: undefined });
    }

    expect(creativeTools.every((tool) => tool.implementationStatus === 'implemented')).toBe(true);
    expect(creativeTools.every((tool) => tool.notImplementedResult === undefined)).toBe(true);
  });

  it('distinguishes read-only, preview, mutation, and persistence creative tools', () => {
    const toolsByName = new Map(WORKBENCH_REGISTRY.tools.map((tool) => [tool.name, tool]));

    for (const name of [...readOnlyCreativeToolNames, ...previewCreativeToolNames]) {
      expect(toolsByName.get(name)).toMatchObject({ mutates: false, name });
    }

    const mutatingCreativeTools = WORKBENCH_REGISTRY.tools.filter(
      (tool) => tool.name.startsWith('workbench.creative.') && tool.mutates,
    );
    expect(mutatingCreativeTools.map((tool) => tool.name)).toEqual([...mutatingCreativeToolNames]);
    expect(toolsByName.get('workbench.creative.apply_idea_patch')?.description).toContain('mutation adapter');
    expect(toolsByName.get('workbench.creative.save_idea_session')?.description).toContain('persistence tool');
    expect(toolsByName.get('workbench.creative.write_idea_memory')?.description).toContain('persistence tool');
  });

  it('exposes creative resources and prompts by their own registry kind', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);
    const creativeResources = snapshot.resources.filter((resource) => resource.name.startsWith('workbench.creative.resource.'));
    const creativePrompts = snapshot.prompts.filter((prompt) => prompt.name.startsWith('workbench.creative.'));

    expect(creativeResources.map((resource) => resource.uriTemplate)).toEqual([...creativeResourceUriTemplates]);
    expect(creativeResources.every((resource) => resource.readOnly)).toBe(true);
    expect(creativePrompts.map((prompt) => prompt.name)).toEqual([...creativePromptNames]);
    expect(snapshot.tools.some((tool) => tool.name === 'workbench.creative.red_team_concept')).toBe(true);
    expect(snapshot.prompts.some((prompt) => prompt.name === 'workbench.creative.red_team_concept')).toBe(true);
  });

  it('keeps registry descriptions concise and references the creative KB instead of copying it', () => {
    const snapshot = buildRegistrySnapshot(WORKBENCH_REGISTRY);
    const creativeDescriptions = [
      ...snapshot.tools.filter((tool) => tool.name.startsWith('workbench.creative.')).map((tool) => tool.description),
      ...snapshot.resources.filter((resource) => resource.name.startsWith('workbench.creative.resource.')).map((resource) => resource.description),
      ...snapshot.prompts.filter((prompt) => prompt.name.startsWith('workbench.creative.')).map((prompt) => prompt.description),
    ];

    expect(creativeDescriptions.every((description) => description.includes(creativeKbReference))).toBe(true);
    expect(creativeDescriptions.every((description) => description.length < 220)).toBe(true);
    expect(creativeDescriptions.every((description) => !description.includes('\n') && !description.includes('|'))).toBe(true);
    expect(creativeDescriptions).not.toContain('artifact/analyze/wiki/relationship summary를 창작 context bundle로 모음');
    expect(creativeDescriptions).not.toContain('선택된 idea patch plan을 실제 workspace에 적용');
    expect(creativeDescriptions).not.toContain('privacy/retention policy가 있는 persistent memory에 저장');
  });
});
