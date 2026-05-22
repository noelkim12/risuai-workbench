/**
 * Workflow-only MCP prompt registration for RisuAI Workbench tasks.
 * @file packages/risuai-workbench-mcp/src/prompts/index.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { WORKBENCH_REGISTRY, type WorkbenchPromptRegistryEntry } from '../registry';

interface PromptSpec {
  name: string;
  focus: string;
  steps: readonly string[];
  source?: string;
}

const CREATIVE_KB_REFERENCE = 'docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md' as const;

const COMMON_SAFETY_LINES = [
  'Use resources and validation tools for context before proposing changes.',
  'Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.',
  'Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.',
  'Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.',
] as const;

const PROMPT_SPECS: readonly PromptSpec[] = [
  {
    focus: 'Review a proposed artifact change against canonical structure rules.',
    name: 'workbench.review_artifact_change',
    steps: ['Inspect the target path or artifact root.', 'Read wiki/rule/schema resources relevant to the change.', 'Run validators and summarize risks before any preview step.'],
  },
  {
    focus: 'Guide an artifact change through inspect, validate, preview, apply, and post-validate phases.',
    name: 'workbench.apply_artifact_change',
    steps: ['Inspect path ownership first.', 'Create or review a patch preview with a stable patch plan id.', 'Only after explicit user approval, call the appropriate gated mutation tool outside the prompt.'],
  },
  {
    focus: 'Plan a canonical structure migration without applying it.',
    name: 'workbench.plan_structure_migration',
    steps: ['Inventory affected artifacts and order files.', 'Read rule catalog and schema resources.', 'Return a migration checklist and required previews; do not mutate.'],
  },
  {
    focus: 'Explain one diagnostic and likely remediation paths.',
    name: 'workbench.explain_diagnostic',
    steps: ['Read the diagnostic resource or diagnostic id context.', 'Map the diagnostic to rule/schema context.', 'Recommend validation and preview steps without applying changes.'],
  },
  {
    focus: 'Audit workspace artifact roots, marker files, metadata, frontmatter, and ordering policy.',
    name: 'workbench.audit_workspace_structure',
    steps: ['Inspect representative artifact roots.', 'Run structure validators in read-only mode.', 'Report grouped findings and next tests.'],
  },
  {
    focus: 'Select focused tests for a planned artifact change.',
    name: 'workbench.prepare_tests_for_change',
    steps: ['Inspect the changed path and artifact kind.', 'Read relevant rule/schema resources.', 'Suggest the smallest reliable test set and build checks.'],
  },
  {
    focus: 'Explore wiki and rule resources for task context.',
    name: 'workbench.explore_wiki',
    steps: ['Read wiki/rule resources by stable URI.', 'Summarize source-of-truth boundaries.', 'Return links and questions; do not mutate.'],
  },
  {
    focus: 'Plan generated wiki refresh from analyze outputs.',
    name: 'workbench.refresh_wiki_from_analyze',
    steps: ['Read analyze graph and current wiki resources.', 'Ask for a generated wiki refresh preview.', 'Require confirmation and generated-only policy before any refresh tool call outside the prompt.'],
  },
  {
    focus: 'Trace variable readers, writers, and diagnostics.',
    name: 'workbench.trace_variable_flow',
    steps: ['Read analyze graph or query variable-flow tools.', 'Summarize readers, writers, and missing-edge diagnostics.', 'Recommend validation or tests; do not edit variables from the prompt.'],
  },
  {
    focus: 'Explain button action declaration and usage.',
    name: 'workbench.explain_button_action',
    steps: ['Read analyze graph context for button action ids.', 'Summarize declaration, usage, and related Lua handlers.', 'Report unknowns honestly.'],
  },
  {
    focus: 'Trace Lua handler and call graph context.',
    name: 'workbench.trace_lua_handler',
    steps: ['Read analyze graph or Lua call graph resources.', 'Summarize handler callers/callees and state access.', 'Recommend tests without applying code edits.'],
  },
  {
    focus: 'Review relationship graph communities and edges.',
    name: 'workbench.review_relationship_network',
    steps: ['Read relationship network analyze resource.', 'Identify surprising edges and affected artifacts.', 'Return review questions and tests.'],
  },
  {
    focus: 'Review prompt dependency chains and conflicts.',
    name: 'workbench.review_prompt_chain',
    steps: ['Read prompt chain analyze resource.', 'Summarize upstream/downstream dependencies.', 'Flag conflicts and focused validation steps.'],
  },
  {
    focus: 'Explain analyze output diagnostic and evidence.',
    name: 'workbench.explain_analyze_diagnostic',
    steps: ['Read diagnostic and analyze graph resources.', 'Tie evidence to source artifacts.', 'Recommend next inspection, validation, or test commands.'],
  },
  {
    focus: 'Generate bounded creative ideas from supplied workspace context while separating evidence from assumptions.',
    name: 'workbench.creative.brainstorm_from_context',
    source: `${CREATIVE_KB_REFERENCE} lines 703-741`,
    steps: ['Gather and cite the current context first.', 'Create concise ideas with evidence, assumptions, candidate mutation types, and next actions.', 'Do not create files; selected ideas must go through ranking, red-team review, and patch preview before any gated mutation tool.'],
  },
  {
    focus: 'Use SCAMPER to propose lorebook entry variants without editing the lorebook.',
    name: 'workbench.creative.scamper_lorebook_entries',
    source: `${CREATIVE_KB_REFERENCE} lines 612-626 and 703-741`,
    steps: ['Inspect the target lorebook context and activation constraints.', 'Produce Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, and Reverse variants.', 'Mark which variants need validation or patch preview; prompt output itself must not mutate.'],
  },
  {
    focus: 'Use SCAMPER to vary prompt chain placement, wording, or dependency ideas safely.',
    name: 'workbench.creative.scamper_prompt_chain_variants',
    source: `${CREATIVE_KB_REFERENCE} lines 703-741`,
    steps: ['Read prompt chain evidence and conflicts.', 'Generate compact SCAMPER variants tied to context positions or dependencies.', 'Recommend validation and preview steps before using existing gated mutation tools.'],
  },
  {
    focus: 'Review one idea through Six Hats perspectives before selection.',
    name: 'workbench.creative.six_hats_idea_review',
    source: `${CREATIVE_KB_REFERENCE} lines 703-741`,
    steps: ['Separate facts, benefits, risks, feelings, alternatives, and process notes.', 'Tie each risk or benefit to evidence when possible.', 'Return a recommendation for ranking, red-team review, or patch preview without applying anything.'],
  },
  {
    focus: 'Explore a morphological matrix of creative dimensions and rank combinations.',
    name: 'workbench.creative.morphological_explore',
    source: `${CREATIVE_KB_REFERENCE} lines 612-626 and 731-741`,
    steps: ['Define dimensions, values, and constraints from context.', 'Generate a small set of combinations with evidence and assumptions.', 'Score combinations for idea quality and artifact fit before any patch plan.'],
  },
  {
    focus: 'Resolve a design contradiction with TRIZ-style separation or substitution ideas.',
    name: 'workbench.creative.triz_resolve_contradiction',
    source: `${CREATIVE_KB_REFERENCE} lines 731-741`,
    steps: ['State the contradiction and affected constraints.', 'Suggest resolution patterns that reduce source, order, token, or validation risk.', 'Convert only a selected resolution into a previewable patch plan through existing gated tools.'],
  },
  {
    focus: 'Find failure modes, then invert them into safer creative options.',
    name: 'workbench.creative.reverse_brainstorm_failure_modes',
    source: `${CREATIVE_KB_REFERENCE} lines 731-741`,
    steps: ['List plausible failure modes and missing evidence.', 'Invert failures into mitigations, validation checks, or smaller ideas.', 'Do not mutate; require explicit selection and preview before any apply step.'],
  },
  {
    focus: 'Combine two or more concepts into coherent candidate ideas.',
    name: 'workbench.creative.combine_concepts',
    source: `${CREATIVE_KB_REFERENCE} lines 703-741`,
    steps: ['Summarize each source concept and its evidence.', 'Create combined ideas with assumptions and artifact-fit notes.', 'Route promising combinations to ranking or patch preview only after selection.'],
  },
  {
    focus: 'Find distant analogies that can inspire RisuAI artifact ideas.',
    name: 'workbench.creative.find_distant_analogies',
    source: `${CREATIVE_KB_REFERENCE} lines 703-741`,
    steps: ['Extract the core problem shape from context.', 'Map distant analogy patterns back to concrete artifact ideas.', 'Keep output as proposals; mutation requires preview, confirmation, and existing gated mutation tools.'],
  },
  {
    focus: 'Turn a selected idea into a patch-plan request without applying it.',
    name: 'workbench.creative.turn_idea_into_patch',
    source: `${CREATIVE_KB_REFERENCE} lines 671-699 and 721-741`,
    steps: ['Verify selected idea evidence, assumptions, and affected files.', 'Draft expected operations, diagnostics, validation, and resource links for a patch preview.', 'Stop at preview; applying requires explicit confirmation and a gated mutation tool.'],
  },
  {
    focus: 'Guide a selected idea from context review to confirmed gated application.',
    name: 'workbench.creative.apply_selected_idea',
    source: `${CREATIVE_KB_REFERENCE} lines 721-741`,
    steps: ['Gather current context, then separate the selected idea evidence from assumptions.', 'Use ranking and red-team review before creating a patch plan preview.', 'Show the preview resource; only after explicit user confirmation should an external gated mutation tool apply it, followed by post-validation.'],
  },
  {
    focus: 'Red-team a creative concept for safety, evidence gaps, and artifact risk.',
    name: 'workbench.creative.red_team_concept',
    source: `${CREATIVE_KB_REFERENCE} lines 731-741`,
    steps: ['Identify source artifact, ordering, frontmatter, token, and validation risks.', 'Classify risks as evidence-backed or assumption-backed.', 'Recommend reject, revise, validate, or preview; never apply changes from the prompt.'],
  },
  {
    focus: 'Summarize an idea session into decisions, candidates, and next safe workflow steps.',
    name: 'workbench.creative.synthesize_idea_session',
    source: `${CREATIVE_KB_REFERENCE} lines 628-668 and 731-741`,
    steps: ['Group ideas by method, evidence, assumptions, and status.', 'Highlight selected ideas, rejected risks, and patch-plan readiness.', 'Mention that session saving or source mutation occurs only through explicit tools and user-requested actions.'],
  },
];

/**
 * registerWorkbenchPrompts 함수.
 * proposal prompt names를 stable order로 official MCP SDK prompt API에 등록함.
 *
 * @param server - MCP server 인스턴스
 */
export function registerWorkbenchPrompts(server: McpServer): void {
  for (const entry of WORKBENCH_REGISTRY.prompts) {
    const spec = findPromptSpec(entry.name);
    server.registerPrompt(
      entry.name,
      {
        argsSchema: { context: z.string().optional(), target: z.string().optional() },
        description: entry.description,
        title: entry.title,
      },
      async (args: { context?: string; target?: string }) => buildPromptResult(entry, spec, args),
    );
  }
}

/**
 * buildPromptResult 함수.
 * prompt/get 요청을 workflow-only instruction message로 변환함.
 *
 * @param entry - registry prompt entry
 * @param spec - prompt instruction spec
 * @param args - optional caller context
 * @returns MCP prompt result
 */
export function buildPromptResult(
  entry: WorkbenchPromptRegistryEntry,
  spec: PromptSpec = findPromptSpec(entry.name),
  args: { context?: string; target?: string } = {},
): GetPromptResult {
  const lines = [
    `# ${entry.title}`,
    '',
    `Focus: ${spec.focus}`,
    spec.source ? `Source: ${spec.source}` : undefined,
    args.target ? `Target: ${args.target}` : 'Target: not provided',
    args.context ? `Context: ${args.context}` : 'Context: not provided',
    '',
    'Workflow:',
    ...spec.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Safety contract:',
    ...COMMON_SAFETY_LINES.map((line) => `- ${line}`),
  ].filter((line): line is string => typeof line === 'string');

  return {
    description: entry.description,
    messages: [
      {
        content: {
          text: `${lines.join('\n')}\n`,
          type: 'text',
        },
        role: 'user',
      },
    ],
  };
}

/**
 * findPromptSpec 함수.
 * prompt 이름에 맞는 instruction spec을 찾음.
 * Creative prompt specs are not implemented yet; a minimal placeholder is returned.
 *
 * @param name - workbench prompt name
 * @returns prompt instruction spec
 */
function findPromptSpec(name: string): PromptSpec {
  const spec = PROMPT_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    // Creative prompts and other not-yet-implemented prompts get a minimal placeholder.
    // Task 5 owns full creative prompt content.
    return {
      focus: `Placeholder prompt spec for ${name}. Not implemented yet.`,
      name,
      steps: ['This prompt is registered but not implemented yet.'],
    };
  }
  return spec;
}
