/**
 * Phase 5 creative action adapters.
 * Thin wrappers over existing handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/creative-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

import {
  GatherContextInputSchema,
  InspectContextInputSchema,
  SearchContextInputSchema,
  BrainstormScamperInputSchema,
  CreateMatrixInputSchema,
  GenerateCombinationsInputSchema,
  ExtractContradictionsInputSchema,
  SuggestContradictionResolutionsInputSchema,
  CritiqueSixHatsInputSchema,
  RankIdeasInputSchema,
  ClusterIdeasInputSchema,
  DeduplicateIdeasInputSchema,
  SearchIdeaGraphInputSchema,
  OpenIdeaNeighborhoodInputSchema,
  PreviewCreativeImpactInputSchema,
  FindGraphBridgeIdeasInputSchema,
  CritiqueIdeaWithAnalyzeInputSchema,
  RemixDeadCodeIntoIdeasInputSchema,
  OptimizePromptChainInsertionInputSchema,
  TurnIdeaIntoPlanInputSchema,
  TurnIdeaIntoPatchPlanInputSchema,
  PreviewIdeaPatchInputSchema,
  RedTeamConceptInputSchema,
  ApplyIdeaPatchInputSchema,
  SaveIdeaSessionInputSchema,
  WriteIdeaMemoryInputSchema,
} from '../schemas/creative-schemas';

import { handleCreativeAction } from '../../tools/creative';

/**
 * registerCreativeActions 함수.
 * Populates the ActionRegistry with all 26 creative actions.
 * Read-only ideation/advisory actions are `read_only`.
 * Preview/patch-plan creation actions that store patch-plan preview state are `preview_mutation`.
 * Apply/session/memory write actions that can write files are `commit_mutation`.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerCreativeActions(registry: ActionRegistry): void {
  // Context (read-only)
  registry.register({
    id: 'creative.gather_context',
    legacyToolName: 'workbench.creative.gather_context',
    title: 'Gather creative context',
    summary: 'Read-only creative context bundle from artifact, analyze, wiki, and relationship summaries.',
    capability: 'creative.context',
    risk: 'read_only',
    inputSchema: GatherContextInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.gather_context', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.inspect_context',
    legacyToolName: 'workbench.creative.inspect_context',
    title: 'Inspect creative context',
    summary: 'Read-only context source and coverage inspection for creative sessions.',
    capability: 'creative.context',
    risk: 'read_only',
    inputSchema: InspectContextInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.inspect_context', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.search_context',
    legacyToolName: 'workbench.creative.search_context',
    title: 'Search creative context',
    summary: 'Read-only search across compact creative context cards and resource links.',
    capability: 'creative.context',
    risk: 'read_only',
    inputSchema: SearchContextInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.search_context', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  // Ideation (read-only)
  registry.register({
    id: 'creative.brainstorm_scamper',
    legacyToolName: 'workbench.creative.brainstorm_scamper',
    title: 'Brainstorm with SCAMPER',
    summary: 'Read-only SCAMPER ideation candidates with method metadata.',
    capability: 'creative.ideation',
    risk: 'read_only',
    inputSchema: BrainstormScamperInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.brainstorm_scamper', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.create_matrix',
    legacyToolName: 'workbench.creative.create_matrix',
    title: 'Create creative matrix',
    summary: 'Read-only morphological matrix dimensions and option scaffolding.',
    capability: 'creative.ideation',
    risk: 'read_only',
    inputSchema: CreateMatrixInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.create_matrix', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.generate_combinations',
    legacyToolName: 'workbench.creative.generate_combinations',
    title: 'Generate matrix combinations',
    summary: 'Read-only combination candidates from a creative matrix.',
    capability: 'creative.ideation',
    risk: 'read_only',
    inputSchema: GenerateCombinationsInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.generate_combinations', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.extract_contradictions',
    legacyToolName: 'workbench.creative.extract_contradictions',
    title: 'Extract creative contradictions',
    summary: 'Read-only trade-off and contradiction extraction for TRIZ-style review.',
    capability: 'creative.ideation',
    risk: 'read_only',
    inputSchema: ExtractContradictionsInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.extract_contradictions', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.suggest_contradiction_resolutions',
    legacyToolName: 'workbench.creative.suggest_contradiction_resolutions',
    title: 'Suggest contradiction resolutions',
    summary: 'Read-only contradiction resolution suggestions for creative planning.',
    capability: 'creative.ideation',
    risk: 'read_only',
    inputSchema: SuggestContradictionResolutionsInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.suggest_contradiction_resolutions', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  // Review / critique (read-only)
  registry.register({
    id: 'creative.critique_six_hats',
    legacyToolName: 'workbench.creative.critique_six_hats',
    title: 'Critique with Six Hats',
    summary: 'Read-only Six Hats critique of an idea or session.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: CritiqueSixHatsInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.critique_six_hats', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.rank_ideas',
    legacyToolName: 'workbench.creative.rank_ideas',
    title: 'Rank creative ideas',
    summary: 'Read-only idea ranking by impact, feasibility, novelty, risk, token cost, and independent patch readiness.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: RankIdeasInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.rank_ideas', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.cluster_ideas',
    legacyToolName: 'workbench.creative.cluster_ideas',
    title: 'Cluster creative ideas',
    summary: 'Read-only clustering metadata for related ideas.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: ClusterIdeasInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.cluster_ideas', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.deduplicate_ideas',
    legacyToolName: 'workbench.creative.deduplicate_ideas',
    title: 'Deduplicate creative ideas',
    summary: 'Read-only duplicate and near-duplicate idea merge candidates.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: DeduplicateIdeasInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.deduplicate_ideas', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.search_idea_graph',
    legacyToolName: 'workbench.creative.search_idea_graph',
    title: 'Search idea graph',
    summary: 'Read-only session idea graph search metadata.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: SearchIdeaGraphInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.search_idea_graph', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.open_idea_neighborhood',
    legacyToolName: 'workbench.creative.open_idea_neighborhood',
    title: 'Open idea neighborhood',
    summary: 'Read-only neighborhood context for one idea graph node.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: OpenIdeaNeighborhoodInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.open_idea_neighborhood', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.preview_creative_impact',
    legacyToolName: 'workbench.creative.preview_creative_impact',
    title: 'Preview creative impact',
    summary: 'Read-only analyze-backed impact preview for a creative concept.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: PreviewCreativeImpactInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.preview_creative_impact', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.find_graph_bridge_ideas',
    legacyToolName: 'workbench.creative.find_graph_bridge_ideas',
    title: 'Find graph bridge ideas',
    summary: 'Read-only graph bridge opportunity finder for creative ideas.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: FindGraphBridgeIdeasInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.find_graph_bridge_ideas', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.critique_idea_with_analyze',
    legacyToolName: 'workbench.creative.critique_idea_with_analyze',
    title: 'Critique idea with analyze',
    summary: 'Read-only analyze-backed critique helper for idea risk and evidence.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: CritiqueIdeaWithAnalyzeInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.critique_idea_with_analyze', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.remix_dead_code_into_ideas',
    legacyToolName: 'workbench.creative.remix_dead_code_into_ideas',
    title: 'Remix dead code into ideas',
    summary: 'Read-only dead-code findings remix helper for creative candidates.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: RemixDeadCodeIntoIdeasInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.remix_dead_code_into_ideas', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.optimize_prompt_chain_insertion',
    legacyToolName: 'workbench.creative.optimize_prompt_chain_insertion',
    title: 'Optimize prompt chain insertion',
    summary: 'Read-only prompt-chain insertion optimizer for creative concept placement.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: OptimizePromptChainInsertionInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.optimize_prompt_chain_insertion', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.red_team_concept',
    legacyToolName: 'workbench.creative.red_team_concept',
    title: 'Red-team creative concept',
    summary: 'Preview-only failure mode and side-effect review before mutation.',
    capability: 'creative.review',
    risk: 'read_only',
    inputSchema: RedTeamConceptInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.red_team_concept', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  // Patch preview (read-only or preview_mutation)
  registry.register({
    id: 'creative.turn_idea_into_plan',
    legacyToolName: 'workbench.creative.turn_idea_into_plan',
    title: 'Turn idea into plan',
    summary: 'Preview-only conversion from selected idea to artifact change plan.',
    capability: 'creative.patch',
    risk: 'read_only',
    inputSchema: TurnIdeaIntoPlanInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.turn_idea_into_plan', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.turn_idea_into_patch_plan',
    legacyToolName: 'workbench.creative.turn_idea_into_patch_plan',
    title: 'Turn idea into patch plan',
    summary: 'Preview-only conversion from selected idea to a structured PatchPlan.',
    capability: 'creative.patch',
    risk: 'preview_mutation',
    inputSchema: TurnIdeaIntoPatchPlanInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.turn_idea_into_patch_plan', input, context.workspace, context.patchStore),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.preview_idea_patch',
    legacyToolName: 'workbench.creative.preview_idea_patch',
    title: 'Preview idea patch',
    summary: 'Preview-only idea patch diff and diagnostic summary.',
    capability: 'creative.patch',
    risk: 'preview_mutation',
    inputSchema: PreviewIdeaPatchInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.preview_idea_patch', input, context.workspace, context.patchStore),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  // Commit mutations (blocked by run_action)
  registry.register({
    id: 'creative.apply_idea_patch',
    legacyToolName: 'workbench.creative.apply_idea_patch',
    title: 'Apply idea patch',
    summary: 'Creative mutation adapter for an approved stored idea PatchPlan.',
    capability: 'creative.patch',
    risk: 'commit_mutation',
    inputSchema: ApplyIdeaPatchInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.apply_idea_patch', input, context.workspace, context.patchStore, context.mutationMode),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.save_idea_session',
    legacyToolName: 'workbench.creative.save_idea_session',
    title: 'Save idea session',
    summary: 'Creative persistence tool for an explicitly approved idea session artifact.',
    capability: 'creative.patch',
    risk: 'commit_mutation',
    inputSchema: SaveIdeaSessionInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.save_idea_session', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);

  registry.register({
    id: 'creative.write_idea_memory',
    legacyToolName: 'workbench.creative.write_idea_memory',
    title: 'Write idea memory',
    summary: 'Creative persistence tool for workspace-local idea memory records.',
    capability: 'creative.patch',
    risk: 'commit_mutation',
    inputSchema: WriteIdeaMemoryInputSchema,
    execute: (input, context) => handleCreativeAction('workbench.creative.write_idea_memory', input, context.workspace),
  } as WorkbenchAction<Record<string, unknown>, DiagnosticEnvelope>);
}
