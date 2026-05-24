/**
 * Stable registry surface for MCP roadmap tools, resources, and prompts.
 * @file packages/risuai-workbench-mcp/src/registry/index.ts
 */

import { createNotImplementedDiagnosticEnvelope, type DiagnosticEnvelope } from '../contracts/diagnostics';

export type RegistryPhase = 'task-1' | 'phase-1' | 'phase-2' | 'phase-3' | 'phase-4' | 'phase-5';

export type RegistryImplementationStatus = 'implemented' | 'notImplemented';

export interface WorkbenchToolRegistryEntry {
  name: string;
  title: string;
  description: string;
  mutates: boolean;
  phase: RegistryPhase;
  implementationStatus: RegistryImplementationStatus;
  notImplementedResult?: DiagnosticEnvelope;
}

export interface WorkbenchResourceRegistryEntry {
  name: string;
  title: string;
  description: string;
  uriTemplate: string;
  readOnly: true;
}

export interface WorkbenchPromptRegistryEntry {
  name: string;
  title: string;
  description: string;
}

export interface WorkbenchRegistry {
  tools: readonly WorkbenchToolRegistryEntry[];
  resources: readonly WorkbenchResourceRegistryEntry[];
  prompts: readonly WorkbenchPromptRegistryEntry[];
}

export interface WorkbenchRegistrySnapshot extends WorkbenchRegistry {
  schema: 'risuai-workbench-mcp.registry';
  schemaVersion: '0.2.0';
}

interface RoadmapToolDefinition {
  name: string;
  title: string;
  description: string;
  mutates: boolean;
  phase: RegistryPhase;
  phaseDescription: string;
}

const CREATIVE_KB_REFERENCE = 'docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md';

const CREATIVE_TOOL_PHASE_DESCRIPTION = `Creative capability manifest (${CREATIVE_KB_REFERENCE} §§397-432)`;
const CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION = `Creative analyze helper manifest (${CREATIVE_KB_REFERENCE} §§439-585)`;

function createCreativeToolDefinition(
  name: string,
  title: string,
  capability: string,
  mutates: boolean,
  phase: RegistryPhase,
  phaseDescription = CREATIVE_TOOL_PHASE_DESCRIPTION,
): RoadmapToolDefinition {
  return {
    description: `${capability}; see ${CREATIVE_KB_REFERENCE}.`,
    mutates,
    name,
    phase,
    phaseDescription,
    title,
  };
}

const ROADMAP_TOOLS: readonly RoadmapToolDefinition[] = [
  {
    description: 'Describe the role and artifact ownership of a workspace path.',
    mutates: false,
    name: 'workbench.inspect_path',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Inspect path',
  },
  {
    description: 'Summarize artifact root contracts, marker files, and related docs.',
    mutates: false,
    name: 'workbench.inspect_artifact',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Inspect artifact',
  },
  {
    description: 'Validate full artifact root structure.',
    mutates: false,
    name: 'workbench.validate_artifact',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate artifact',
  },
  {
    description: 'Validate canonical directory, suffix, and stem policy.',
    mutates: false,
    name: 'workbench.validate_path',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate path',
  },
  {
    description: 'Validate _order.json entries against canonical files.',
    mutates: false,
    name: 'workbench.validate_order',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate order',
  },
  {
    description: 'Validate .risuchar/.risumodule conflicts and schema.',
    mutates: false,
    name: 'workbench.validate_root_markers',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate root markers',
  },
  {
    description: 'Validate structured metadata owner and legacy/deferred surface.',
    mutates: false,
    name: 'workbench.validate_metadata',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate metadata',
  },
  {
    description: 'Validate frontmatter delimiter, field schema, and round-trip risk.',
    mutates: false,
    name: 'workbench.validate_frontmatter',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate frontmatter',
  },
  {
    description: 'Validate CBS syntax, tag usage, and bracket balance in CBS content.',
    mutates: false,
    name: 'workbench.validate_cbs_syntax',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Validate CBS syntax',
  },
  {
    description: 'Build canonical relative path from target/artifact/stem components.',
    mutates: false,
    name: 'workbench.build_path',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Build path',
  },
  {
    description: 'Search docs, wiki, and rule resources.',
    mutates: false,
    name: 'workbench.search_wiki',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Search wiki',
  },
  {
    description: 'Suggest focused tests for a planned path change.',
    mutates: false,
    name: 'workbench.suggest_tests',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Suggest tests',
  },
  {
    description: 'Classify caller intent into a deterministic route with allowed tools, risk, and next step.',
    mutates: false,
    name: 'workbench.route_intent',
    phase: 'phase-1',
    phaseDescription: 'Phase 1 inspect / validate MVP',
    title: 'Route intent',
  },
  {
    description: 'Create a structured multi-operation patch plan preview.',
    mutates: false,
    name: 'workbench.suggest_patch',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Suggest patch',
  },
  {
    description: 'Create an _order.json patch preview.',
    mutates: false,
    name: 'workbench.suggest_order_patch',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Suggest order patch',
  },
  {
    description: 'Create a frontmatter field patch preview.',
    mutates: false,
    name: 'workbench.suggest_frontmatter_patch',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Suggest frontmatter patch',
  },
  {
    description: 'Create a root marker repair patch preview.',
    mutates: false,
    name: 'workbench.suggest_root_marker_patch',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Suggest root marker patch',
  },
  {
    description: 'Preview generated wiki refresh targets and write scope.',
    mutates: false,
    name: 'workbench.plan_wiki_update',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Plan wiki update',
  },
  {
    description: 'Summarize differences between temporary render and current wiki.',
    mutates: false,
    name: 'workbench.diff_wiki',
    phase: 'phase-2',
    phaseDescription: 'Phase 2 patch preview MVP',
    title: 'Diff wiki',
  },
  {
    description: 'Apply a previously confirmed patch plan to the workspace.',
    mutates: true,
    name: 'workbench.apply_patch_plan',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Apply patch plan',
  },
  {
    description: 'Edit _order.json through structured operations.',
    mutates: true,
    name: 'workbench.edit_order',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Edit order',
  },
  {
    description: 'Edit frontmatter fields while preserving artifact body text.',
    mutates: true,
    name: 'workbench.edit_frontmatter',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Edit frontmatter',
  },
  {
    description: 'Edit root marker or metadata JSON through structured operations.',
    mutates: true,
    name: 'workbench.edit_metadata',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Edit metadata',
  },
  {
    description: 'Create a new artifact at a canonical path with optional order insertion. Note: For creating entire project skeletons (charx/module/preset), use workbench.run_scaffold instead.',
    mutates: true,
    name: 'workbench.create_artifact',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Create artifact',
  },
  {
    description: 'Extract a .risum (module), .risuchar (character), or .risup (preset) file into a canonical workspace directory. Use this tool when the user mentions a risum/charx/risup file path and asks to extract, unpack, open, or import it. If outDir is omitted, the output directory defaults to the same directory as the source file with the filename (without extension). Risk: medium.',
    mutates: true,
    name: 'workbench.run_extract',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Run extract workflow',
  },
  {
    description: 'Generate a new charx, module, or preset workspace skeleton using risu-core scaffold. This is the ONLY tool for creating new RisuAI projects. Use when the user asks to create, initialize, or scaffold a new RisuAI character, module, or preset project. Do NOT use create_artifact or manual file writes for project skeletons. If outDir is omitted, the output directory defaults to the project name in the workspace root. Risk: medium.',
    mutates: true,
    name: 'workbench.run_scaffold',
    phase: 'phase-3',
    phaseDescription: 'Phase 3 direct structured mutation MVP',
    title: 'Run scaffold workflow',
  },
  {
    description: 'Query variable read/write flow and diagnostics.',
    mutates: false,
    name: 'workbench.query_variable_flow',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query variable flow',
  },
  {
    description: 'Query one variable and its bridge diagnostics.',
    mutates: false,
    name: 'workbench.query_variable',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query variable',
  },
  {
    description: 'Query normalized Lua analysis artifact JSON view.',
    mutates: false,
    name: 'workbench.query_lua_analysis',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query Lua analysis',
  },
  {
    description: 'Query Lua handler and function call graph data.',
    mutates: false,
    name: 'workbench.query_lua_call_graph',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query Lua call graph',
  },
  {
    description: 'Query Lua state and chat variable read/write occurrences.',
    mutates: false,
    name: 'workbench.query_lua_state_access',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query Lua state access',
  },
  {
    description: 'Query button action declarations and usage.',
    mutates: false,
    name: 'workbench.query_button_actions',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query button actions',
  },
  {
    description: 'Query relationship network nodes, edges, and groups.',
    mutates: false,
    name: 'workbench.query_relationship_network',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query relationship network',
  },
  {
    description: 'Query prompt chain dependencies and issues.',
    mutates: false,
    name: 'workbench.query_prompt_chain',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query prompt chain',
  },
  {
    description: 'Query artifact composition conflicts and compatibility score.',
    mutates: false,
    name: 'workbench.query_composition_conflicts',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query composition conflicts',
  },
  {
    description: 'Query cleanup candidates from analyze outputs.',
    mutates: false,
    name: 'workbench.query_dead_code_findings',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query dead code findings',
  },
  {
    description: 'Query token budget summaries and threshold warnings.',
    mutates: false,
    name: 'workbench.query_token_budget',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query token budget',
  },
  {
    description: 'Explain source-first split RisuLua workspace authoring and generated dist boundaries.',
    mutates: false,
    name: 'workbench.explain_risulua_workspace',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Explain RisuLua workspace',
  },
  {
    description: 'Guide RisuLua source module authoring with static require and dist runtime boundaries.',
    mutates: false,
    name: 'workbench.guide_risulua_module',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Guide RisuLua module',
  },
  {
    description: 'Explain RisuAI Lua lifecycle hooks, runtime API, id threading, async, and access tiers.',
    mutates: false,
    name: 'workbench.explain_risulua_runtime_api',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Explain RisuLua runtime API',
  },
  {
    description: 'Explain Lorebook as prompt injection and context activation layer.',
    mutates: false,
    name: 'workbench.explain_lorebook_prompt_injection',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Explain Lorebook prompt injection',
  },
  {
    description: 'Explain the Lorebook, Structured Output, Regex, Button, RisuLua, Variable/Lorebook feedback loop.',
    mutates: false,
    name: 'workbench.explain_context_feedback_loop',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Explain context feedback loop',
  },
  {
    description: 'Plan a structured output, regex, button, RisuLua state, Lorebook feedback loop.',
    mutates: false,
    name: 'workbench.plan_structured_output_loop',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Plan structured output loop',
  },
  {
    description: 'Query CBS tag usage, bracket balance, and reference statistics from source text.',
    mutates: false,
    name: 'workbench.query_cbs_usage',
    phase: 'phase-4',
    phaseDescription: 'Phase 4 analyze / impact expansion',
    title: 'Query CBS usage',
  },
  {
    description: 'Move or rename an artifact while preserving order ownership.',
    mutates: true,
    name: 'workbench.move_artifact',
    phase: 'phase-5',
    phaseDescription: 'Phase 5 advanced mutation',
    title: 'Move artifact',
  },
  {
    description: 'Delete an artifact through gated backup and confirmation policy.',
    mutates: true,
    name: 'workbench.delete_artifact',
    phase: 'phase-5',
    phaseDescription: 'Phase 5 advanced mutation',
    title: 'Delete artifact',
  },
  {
    description: 'Refresh generated wiki files through the core write-protect layer.',
    mutates: true,
    name: 'workbench.refresh_wiki',
    phase: 'phase-5',
    phaseDescription: 'Phase 5 advanced mutation',
    title: 'Refresh wiki',
  },
  {
    description: 'Rollback a journaled mutation when inverse patch data is available.',
    mutates: true,
    name: 'workbench.rollback_mutation',
    phase: 'phase-5',
    phaseDescription: 'Phase 5 advanced mutation',
    title: 'Rollback mutation',
  },
  {
    description: 'Refresh analyze snapshot resources after mutation changes.',
    mutates: false,
    name: 'workbench.refresh_analyze_snapshot',
    phase: 'phase-5',
    phaseDescription: 'Phase 5 advanced mutation',
    title: 'Refresh analyze snapshot',
  },
];

const CREATIVE_ROADMAP_TOOLS: readonly RoadmapToolDefinition[] = [
  createCreativeToolDefinition(
    'workbench.creative.gather_context',
    'Gather creative context',
    'Read-only creative context bundle from artifact, analyze, wiki, and relationship summaries',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.inspect_context',
    'Inspect creative context',
    'Read-only context source and coverage inspection for creative sessions',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.search_context',
    'Search creative context',
    'Read-only search across compact creative context cards and resource links',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.brainstorm_scamper',
    'Brainstorm with SCAMPER',
    'Read-only SCAMPER ideation candidates with method metadata',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.create_matrix',
    'Create creative matrix',
    'Read-only morphological matrix dimensions and option scaffolding',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.generate_combinations',
    'Generate matrix combinations',
    'Read-only combination candidates from a creative matrix',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.extract_contradictions',
    'Extract creative contradictions',
    'Read-only trade-off and contradiction extraction for TRIZ-style review',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.suggest_contradiction_resolutions',
    'Suggest contradiction resolutions',
    'Read-only contradiction resolution suggestions for creative planning',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.critique_six_hats',
    'Critique with Six Hats',
    'Read-only Six Hats critique of an idea or session',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.rank_ideas',
    'Rank creative ideas',
    'Read-only idea ranking by impact, feasibility, novelty, risk, token cost, and independent patch readiness',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.cluster_ideas',
    'Cluster creative ideas',
    'Read-only clustering metadata for related ideas',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.deduplicate_ideas',
    'Deduplicate creative ideas',
    'Read-only duplicate and near-duplicate idea merge candidates',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.search_idea_graph',
    'Search idea graph',
    'Read-only session idea graph search metadata',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.open_idea_neighborhood',
    'Open idea neighborhood',
    'Read-only neighborhood context for one idea graph node',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.preview_creative_impact',
    'Preview creative impact',
    'Read-only analyze-backed impact preview for a creative concept',
    false,
    'phase-4',
    CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION,
  ),
  createCreativeToolDefinition(
    'workbench.creative.find_graph_bridge_ideas',
    'Find graph bridge ideas',
    'Read-only graph bridge opportunity finder for creative ideas',
    false,
    'phase-4',
    CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION,
  ),
  createCreativeToolDefinition(
    'workbench.creative.critique_idea_with_analyze',
    'Critique idea with analyze',
    'Read-only analyze-backed critique helper for idea risk and evidence',
    false,
    'phase-4',
    CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION,
  ),
  createCreativeToolDefinition(
    'workbench.creative.remix_dead_code_into_ideas',
    'Remix dead code into ideas',
    'Read-only dead-code findings remix helper for creative candidates',
    false,
    'phase-4',
    CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION,
  ),
  createCreativeToolDefinition(
    'workbench.creative.optimize_prompt_chain_insertion',
    'Optimize prompt chain insertion',
    'Read-only prompt-chain insertion optimizer for creative concept placement',
    false,
    'phase-4',
    CREATIVE_ANALYZE_TOOL_PHASE_DESCRIPTION,
  ),
  createCreativeToolDefinition(
    'workbench.creative.turn_idea_into_plan',
    'Turn idea into plan',
    'Preview-only conversion from selected idea to artifact change plan',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.turn_idea_into_patch_plan',
    'Turn idea into patch plan',
    'Preview-only conversion from selected idea to a structured PatchPlan',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.preview_idea_patch',
    'Preview idea patch',
    'Preview-only idea patch diff and diagnostic summary',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.red_team_concept',
    'Red-team creative concept',
    'Preview-only failure mode and side-effect review before mutation',
    false,
    'phase-4',
  ),
  createCreativeToolDefinition(
    'workbench.creative.apply_idea_patch',
    'Apply idea patch',
    'Creative mutation adapter for an approved stored idea PatchPlan',
    true,
    'phase-5',
  ),
  createCreativeToolDefinition(
    'workbench.creative.save_idea_session',
    'Save idea session',
    'Creative persistence tool for an explicitly approved idea session artifact',
    true,
    'phase-5',
  ),
  createCreativeToolDefinition(
    'workbench.creative.write_idea_memory',
    'Write idea memory',
    'Creative persistence tool for workspace-local idea memory records',
    true,
    'phase-5',
  ),
];

const PROMPTS: readonly WorkbenchPromptRegistryEntry[] = [
  ['workbench.review_artifact_change', 'Review artifact change', 'Review a proposed artifact mutation with relevant rules.'],
  ['workbench.apply_artifact_change', 'Apply artifact change', 'Guide inspect, validate, preview, apply, and post-validate workflow.'],
  ['workbench.plan_structure_migration', 'Plan structure migration', 'Plan a canonical artifact structure migration.'],
  ['workbench.explain_diagnostic', 'Explain diagnostic', 'Explain one diagnostic and likely fixes.'],
  ['workbench.audit_workspace_structure', 'Audit workspace structure', 'Audit artifact roots, marker files, and ordering policy.'],
  ['workbench.prepare_tests_for_change', 'Prepare tests for change', 'Select focused tests for an artifact change.'],
  ['workbench.explore_wiki', 'Explore wiki', 'Use wiki and rule resources for task context.'],
  ['workbench.refresh_wiki_from_analyze', 'Refresh wiki from analyze', 'Plan generated wiki refresh from analyze outputs.'],
  ['workbench.trace_variable_flow', 'Trace variable flow', 'Trace variable readers, writers, and diagnostics.'],
  ['workbench.explain_button_action', 'Explain button action', 'Explain button action declaration and usage.'],
  ['workbench.trace_lua_handler', 'Trace Lua handler', 'Trace Lua handler and call graph context.'],
  ['workbench.review_relationship_network', 'Review relationship network', 'Review relationship graph communities and edges.'],
  ['workbench.review_prompt_chain', 'Review prompt chain', 'Review prompt dependency chain and conflicts.'],
  ['workbench.explain_analyze_diagnostic', 'Explain analyze diagnostic', 'Explain analyze output diagnostic and evidence.'],
  ['workbench.create_project', 'Create new project', 'Guide scaffold workflow for creating new RisuAI charx/module/preset projects.'],
  ['workbench.creative.brainstorm_from_context', 'Brainstorm from context', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.scamper_lorebook_entries', 'SCAMPER lorebook entries', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.scamper_prompt_chain_variants', 'SCAMPER prompt chain variants', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.six_hats_idea_review', 'Six Hats idea review', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.morphological_explore', 'Morphological explore', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.triz_resolve_contradiction', 'TRIZ resolve contradiction', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.reverse_brainstorm_failure_modes', 'Reverse brainstorm failure modes', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.combine_concepts', 'Combine concepts', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.find_distant_analogies', 'Find distant analogies', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.turn_idea_into_patch', 'Turn idea into patch', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.apply_selected_idea', 'Apply selected idea', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.red_team_concept', 'Red-team concept', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
  ['workbench.creative.synthesize_idea_session', 'Synthesize idea session', `Creative workflow prompt; see ${CREATIVE_KB_REFERENCE} §Prompt 목록.`],
].map(([name, title, description]) => ({ description, name, title }));

const RESOURCES: readonly WorkbenchResourceRegistryEntry[] = [
  {
    description: 'Read wiki pages and generated documentation context.',
    name: 'workbench.resource.wiki',
    readOnly: true,
    title: 'Wiki resource',
    uriTemplate: 'risuai-workbench://wiki/{path}',
  },
  {
    description: 'Read canonical artifact and mutation rule catalog data.',
    name: 'workbench.resource.rule_catalog',
    readOnly: true,
    title: 'Rule catalog resource',
    uriTemplate: 'risuai-workbench://rules/catalog',
  },
  {
    description: 'Read schema contracts by stable schema name.',
    name: 'workbench.resource.schema',
    readOnly: true,
    title: 'Schema resource',
    uriTemplate: 'risuai-workbench://schemas/{schemaName}',
  },
  {
    description: 'Read large analyze graph snapshots by snapshot id.',
    name: 'workbench.resource.analyze_graph',
    readOnly: true,
    title: 'Analyze graph resource',
    uriTemplate: 'risuai-workbench://analyze/{snapshotId}',
  },
  {
    description: 'Read diagnostic snapshots by diagnostic id.',
    name: 'workbench.resource.diagnostics',
    readOnly: true,
    title: 'Diagnostics resource',
    uriTemplate: 'risuai-workbench://diagnostics/{diagnosticId}',
  },
  {
    description: 'Read large patch preview resources by patch plan id.',
    name: 'workbench.resource.patch_preview',
    readOnly: true,
    title: 'Patch preview resource',
    uriTemplate: 'risuai-workbench://mutations/patch-plans/{patchPlanId}',
  },
  {
    description: 'Read mutation journal collection and entries.',
    name: 'workbench.resource.mutation_journal',
    readOnly: true,
    title: 'Mutation journal resource',
    uriTemplate: 'risuai-workbench://mutations/journal/{mutationId?}',
  },
  {
    description: 'Read one patch plan by id.',
    name: 'workbench.resource.patch_plan',
    readOnly: true,
    title: 'Patch plan resource',
    uriTemplate: 'risuai-workbench://mutations/patch-plans/{patchPlanId}',
  },
  {
    description: 'Read CBS index, syntax, category, tag detail, pattern, pitfall, and fallback source resources.',
    name: 'workbench.resource.cbs_reference',
    readOnly: true,
    title: 'CBS index and reference resource',
    uriTemplate: 'risuai-workbench://cbs/{cbsPath}',
  },
  {
    description: `Read creative method catalog cards; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.methods',
    readOnly: true,
    title: 'Creative methods resource',
    uriTemplate: 'risuai-workbench://methods',
  },
  {
    description: `Read SCAMPER method card; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.method.scamper',
    readOnly: true,
    title: 'SCAMPER method resource',
    uriTemplate: 'risuai-workbench://methods/scamper',
  },
  {
    description: `Read Six Hats method card; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.method.six_hats',
    readOnly: true,
    title: 'Six Hats method resource',
    uriTemplate: 'risuai-workbench://methods/six-hats',
  },
  {
    description: `Read morphological analysis method card; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.method.morphological_analysis',
    readOnly: true,
    title: 'Morphological analysis method resource',
    uriTemplate: 'risuai-workbench://methods/morphological-analysis',
  },
  {
    description: `Read TRIZ method card; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.method.triz',
    readOnly: true,
    title: 'TRIZ method resource',
    uriTemplate: 'risuai-workbench://methods/triz',
  },
  {
    description: `Read reverse brainstorming method card; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.method.reverse_brainstorming',
    readOnly: true,
    title: 'Reverse brainstorming method resource',
    uriTemplate: 'risuai-workbench://methods/reverse-brainstorming',
  },
  {
    description: `Read idea quality rubric; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.rubric.idea_quality',
    readOnly: true,
    title: 'Idea quality rubric resource',
    uriTemplate: 'risuai-workbench://rubrics/idea-quality',
  },
  {
    description: `Read artifact fit rubric; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.rubric.artifact_fit',
    readOnly: true,
    title: 'Artifact fit rubric resource',
    uriTemplate: 'risuai-workbench://rubrics/artifact-fit',
  },
  {
    description: `Read one creative session artifact; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.idea_session',
    readOnly: true,
    title: 'Idea session resource',
    uriTemplate: 'risuai-workbench://ideas/sessions/{sessionId}',
  },
  {
    description: `Read one creative idea artifact; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.idea',
    readOnly: true,
    title: 'Idea resource',
    uriTemplate: 'risuai-workbench://ideas/{ideaId}',
  },
  {
    description: `Read one creative idea patch plan; see ${CREATIVE_KB_REFERENCE} §Creative method resources.`,
    name: 'workbench.creative.resource.idea_patch_plan',
    readOnly: true,
    title: 'Idea patch plan resource',
    uriTemplate: 'risuai-workbench://ideas/{ideaId}/patch-plan',
  },
];

const IMPLEMENTED_ROADMAP_TOOL_NAMES = new Set([
  'workbench.inspect_path',
  'workbench.inspect_artifact',
  'workbench.validate_path',
  'workbench.validate_artifact',
  'workbench.validate_order',
  'workbench.validate_root_markers',
  'workbench.validate_metadata',
  'workbench.validate_frontmatter',
  'workbench.validate_cbs_syntax',
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
  'workbench.query_cbs_usage',
  'workbench.move_artifact',
  'workbench.delete_artifact',
  'workbench.refresh_wiki',
  'workbench.rollback_mutation',
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
  'workbench.creative.apply_idea_patch',
  'workbench.creative.save_idea_session',
  'workbench.creative.write_idea_memory',
]);

/**
 * createNotImplementedToolEntry 함수.
 * proposal roadmap tool을 stable notImplemented registry entry로 변환함.
 *
 * @param definition - proposal에서 추출한 tool definition
 * @returns notImplemented diagnostic result를 포함한 registry entry
 */
function createNotImplementedToolEntry(definition: RoadmapToolDefinition): WorkbenchToolRegistryEntry {
  const implemented = IMPLEMENTED_ROADMAP_TOOL_NAMES.has(definition.name);
  return {
    description: definition.description,
    implementationStatus: implemented ? 'implemented' : 'notImplemented',
    mutates: definition.mutates,
    name: definition.name,
    notImplementedResult: implemented ? undefined : createNotImplementedDiagnosticEnvelope(definition.name, definition.phaseDescription),
    phase: definition.phase,
    title: definition.title,
  };
}

export const WORKBENCH_REGISTRY: WorkbenchRegistry = {
  prompts: PROMPTS,
  resources: RESOURCES,
  tools: [
    {
      description: 'Return a minimal risuai-workbench-mcp startup smoke response.',
      implementationStatus: 'implemented',
      mutates: false,
      name: 'workbench.smoke',
      phase: 'task-1',
      title: 'RisuAI Workbench MCP smoke check',
    },
    ...ROADMAP_TOOLS.map(createNotImplementedToolEntry),
    ...CREATIVE_ROADMAP_TOOLS.map(createNotImplementedToolEntry),
  ],
};

/**
 * buildRegistrySnapshot 함수.
 * registry 배열을 consumer가 snapshot으로 비교할 수 있는 stable envelope로 감쌈.
 *
 * @param registry - snapshot으로 감쌀 registry bundle
 * @returns schema marker를 포함한 registry snapshot
 */
export function buildRegistrySnapshot(registry: WorkbenchRegistry = WORKBENCH_REGISTRY): WorkbenchRegistrySnapshot {
  return {
    prompts: registry.prompts,
    resources: registry.resources,
    schema: 'risuai-workbench-mcp.registry',
    schemaVersion: '0.2.0',
    tools: registry.tools,
  };
}

/**
 * getWorkbenchTool 함수.
 * registry에서 MCP tool name으로 entry를 찾음.
 *
 * @param name - 조회할 workbench tool name
 * @returns registry entry 또는 null
 */
export function getWorkbenchTool(name: string): WorkbenchToolRegistryEntry | null {
  return WORKBENCH_REGISTRY.tools.find((tool) => tool.name === name) ?? null;
}
