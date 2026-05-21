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
}

const COMMON_SAFETY_LINES = [
  'Use resources and validation tools for context before proposing changes.',
  'Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.',
  'Mutation tools may be mentioned only as gated workflow steps and must still require preview, confirmation, safety policy, and post-validation.',
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
    args.target ? `Target: ${args.target}` : 'Target: not provided',
    args.context ? `Context: ${args.context}` : 'Context: not provided',
    '',
    'Workflow:',
    ...spec.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Safety contract:',
    ...COMMON_SAFETY_LINES.map((line) => `- ${line}`),
  ];

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
 *
 * @param name - workbench prompt name
 * @returns prompt instruction spec
 */
function findPromptSpec(name: string): PromptSpec {
  const spec = PROMPT_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    throw new Error(`Missing prompt spec: ${name}`);
  }
  return spec;
}
