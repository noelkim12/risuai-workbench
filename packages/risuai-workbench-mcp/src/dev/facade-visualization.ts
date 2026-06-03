/**
 * Facade visualization report generator.
 * @file packages/risuai-workbench-mcp/src/dev/facade-visualization.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorkbenchActionRegistry } from '../actions/create-registry';
import type { ActionExecutionContext } from '../actions/types';

export type FacadeNodeKind = 'mcp_tool' | 'action_group' | 'safety_gate';

export interface FacadeGraphNode {
  id: string;
  label: string;
  kind: FacadeNodeKind;
  group: string;
  details?: Record<string, string>;
}

export interface FacadeGraphEdge {
  source: string;
  target: string;
  kind: string;
  label?: string;
}

export interface PublicFacadeTool {
  id: string;
  label: string;
  kind: 'mcp_tool';
  role: string;
}

export interface ActionGroupSummary {
  capability: string;
  label: string;
  count: number;
  risks: string[];
  actionIds: string[];
  entrypoint: string;
}

export interface FacadeVisualizationModel {
  schema: 'risuai-workbench-mcp.facade-visualization';
  generatedAt: string;
  publicTools: PublicFacadeTool[];
  actionGroups: ActionGroupSummary[];
  nodes: FacadeGraphNode[];
  edges: FacadeGraphEdge[];
}

const PUBLIC_FACADE_TOOLS = [
  ['workbench.smoke', 'Server/workspace status check'],
  ['workbench.route_intent', 'Classify intent and recommend facade next step'],
  ['workbench.catalog', 'Search internal actions by intent/capability/risk'],
  ['workbench.prepare_action', 'Explain selected action input requirements'],
  ['workbench.run_action', 'Execute read-only or preview-safe internal actions'],
  ['workbench.context', 'Manage handle-based large context records'],
  ['workbench.patch_preview', 'Preview patch actions or store patch plans'],
  ['workbench.patch_apply', 'Apply stored patch plans'],
] as const;

const ACTION_GROUP_ORDER = [
  'inspect',
  'validate',
  'analyze',
  'wiki',
  'skills',
  'creative.context',
  'creative.ideation',
  'creative.review',
  'creative.patch',
  'patch.preview',
  'patch.apply',
] as const;

const ACTION_GROUP_LABELS: Record<string, string> = {
  inspect: 'Inspect',
  validate: 'Validate',
  analyze: 'Analyze',
  wiki: 'Wiki',
  skills: 'Skills',
  'creative.context': 'Creative Context',
  'creative.ideation': 'Creative Ideation',
  'creative.review': 'Creative Review',
  'creative.patch': 'Creative Patch',
  'patch.preview': 'Patch Preview',
  'patch.apply': 'Patch Apply',
};

const DETERMINISTIC_REPORT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

const dummyContext: ActionExecutionContext = {
  workspace: { ok: true, path: '/tmp/workspace', reason: null },
  mutationMode: 'preview-only',
  patchStore: {
    getPatchPlan: () => null,
    savePatchPlan: () => {},
    findByIdeaId: () => null,
  },
};

function graphId(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

function mermaidId(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '') || 'node';
}

function mermaidLabel(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function entrypointForGroup(capability: string, risks: readonly string[]): string {
  if (capability === 'patch.apply' || risks.includes('commit_mutation')) {
    return 'workbench.patch_preview → workbench.patch_apply';
  }
  if (risks.includes('preview_mutation')) {
    return 'workbench.patch_preview';
  }
  return 'workbench.catalog → workbench.prepare_action → workbench.run_action';
}

export function buildFacadeVisualizationModel(options: { generatedAt?: string } = {}): FacadeVisualizationModel {
  const registry = createWorkbenchActionRegistry(dummyContext);
  const actions = registry.list();
  const publicTools: PublicFacadeTool[] = PUBLIC_FACADE_TOOLS.map(([id, role]) => ({
    id,
    kind: 'mcp_tool',
    label: id.replace('workbench.', ''),
    role,
  }));

  const actionGroups = ACTION_GROUP_ORDER.map((capability) => {
    const grouped = actions.filter((action) => action.capability === capability);
    const risks = uniqueSorted(grouped.map((action) => action.risk));
    return {
      actionIds: grouped.map((action) => action.id).sort((left, right) => left.localeCompare(right)),
      capability,
      count: grouped.length,
      entrypoint: entrypointForGroup(capability, risks),
      label: ACTION_GROUP_LABELS[capability] ?? capability,
      risks,
    } satisfies ActionGroupSummary;
  }).filter((group) => group.count > 0);

  const nodes: FacadeGraphNode[] = [
    ...publicTools.map((tool) => ({
      details: { role: tool.role },
      group: 'Public facade',
      id: graphId('tool', tool.id),
      kind: 'mcp_tool' as const,
      label: tool.id,
    })),
    ...actionGroups.map((group) => ({
      details: {
        actions: String(group.count),
        capability: group.capability,
        risks: group.risks.join(', '),
      },
      group: 'Internal Action Registry',
      id: graphId('capability', group.capability),
      kind: 'action_group' as const,
      label: group.label,
    })),
    { group: 'Mutation safety', id: 'safety:patch-store', kind: 'safety_gate', label: 'PatchPlan store' },
    { group: 'Mutation safety', id: 'safety:mutation-mode', kind: 'safety_gate', label: 'mutation mode' },
    { group: 'Mutation safety', id: 'safety:patch-engine', kind: 'safety_gate', label: 'canonical patch apply engine' },
  ];

  const edges: FacadeGraphEdge[] = [
    { source: graphId('tool', 'workbench.route_intent'), target: graphId('tool', 'workbench.catalog'), kind: 'next_tool', label: 'routes to' },
    { source: graphId('tool', 'workbench.catalog'), target: graphId('tool', 'workbench.prepare_action'), kind: 'next_tool', label: 'selects action' },
    { source: graphId('tool', 'workbench.prepare_action'), target: graphId('tool', 'workbench.run_action'), kind: 'next_tool', label: 'runs safe action' },
    { source: graphId('tool', 'workbench.prepare_action'), target: graphId('tool', 'workbench.patch_preview'), kind: 'next_tool', label: 'previews mutation' },
    { source: graphId('tool', 'workbench.patch_preview'), target: graphId('tool', 'workbench.patch_apply'), kind: 'next_tool', label: 'apply stored plan' },
    { source: graphId('tool', 'workbench.context'), target: graphId('tool', 'workbench.run_action'), kind: 'hydrates', label: 'contextId' },
    { source: graphId('tool', 'workbench.context'), target: graphId('tool', 'workbench.patch_preview'), kind: 'hydrates', label: 'contextId' },
    ...actionGroups.map((group) => ({
      source: graphId('tool', 'workbench.catalog'),
      target: graphId('capability', group.capability),
      kind: 'routes_to',
      label: group.capability,
    })),
    { source: graphId('tool', 'workbench.patch_preview'), target: 'safety:patch-store', kind: 'stores', label: 'PatchPlan' },
    { source: graphId('tool', 'workbench.patch_apply'), target: 'safety:patch-store', kind: 'loads', label: 'PatchPlan' },
    { source: graphId('tool', 'workbench.patch_apply'), target: 'safety:mutation-mode', kind: 'checks', label: 'preview-only/generated-only/enabled' },
    { source: graphId('tool', 'workbench.patch_apply'), target: 'safety:patch-engine', kind: 'applies', label: 'approved operations' },
  ];

  return {
    actionGroups,
    edges,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    nodes,
    publicTools,
    schema: 'risuai-workbench-mcp.facade-visualization',
  };
}

export function renderArchitectureMermaid(model: FacadeVisualizationModel): string {
  const toolLines = model.publicTools.map((tool) => {
    const id = mermaidId(tool.id);
    return `      ${id}["${mermaidLabel(tool.id)}"]`;
  });
  const groupLines = model.actionGroups.map((group) => {
    const id = mermaidId(`capability_${group.capability}`);
    return `      ${id}["${mermaidLabel(group.label)}<br/>${group.count} actions"]`;
  });

  return [
    'flowchart TB',
    '    Client["MCP client / LLM"]',
    '',
    '    subgraph Public["Default public MCP surface"]',
    ...toolLines,
    '    end',
    '',
    '    subgraph Registry["Internal Action Registry"]',
    ...groupLines,
    '    end',
    '',
    '    subgraph Safety["Mutation safety boundary"]',
    '      PatchStore["PatchPlan store"]',
    '      MutationMode["mutation mode"]',
    '      ApplyEngine["canonical patch apply engine"]',
    '    end',
    '',
    '    Client --> workbench_smoke',
    '    Client --> workbench_route_intent',
    '    workbench_route_intent --> workbench_catalog',
    '    workbench_catalog --> workbench_prepare_action',
    '    workbench_prepare_action --> workbench_run_action',
    '    workbench_prepare_action --> workbench_patch_preview',
    '    workbench_context -. "hydrates args via contextId" .-> workbench_run_action',
    '    workbench_context -. "hydrates args via contextId" .-> workbench_patch_preview',
    '    workbench_run_action -. "can execute internal actions" .-> workbench_patch_apply',
    '    workbench_patch_preview --> PatchStore',
    '    workbench_patch_apply --> PatchStore',
    '    workbench_patch_apply --> MutationMode',
    '    workbench_patch_apply --> ApplyEngine',
    ...model.actionGroups.map((group) => `    workbench_catalog --> ${mermaidId(`capability_${group.capability}`)}`),
    '',
  ].join('\n');
}

export function renderNormalFlowMermaid(): string {
  return [
    'sequenceDiagram',
    '    participant Client as MCP client',
    '    participant Route as route_intent',
    '    participant Catalog as catalog',
    '    participant Prepare as prepare_action',
    '    participant Run as run_action',
    '    participant Registry as ActionRegistry',
    '    participant Action as Internal action',
    '',
    '    Client->>Route: classify user request',
    '    Route-->>Client: capabilities + recommendedActions + nextTool',
    '    Client->>Catalog: query by capability / intent',
    '    Catalog->>Registry: search actions',
    '    Registry-->>Catalog: matching action summaries',
    '    Catalog-->>Client: action candidates',
    '    Client->>Prepare: prepare selected actionId',
    '    Prepare->>Registry: read input schema + examples',
    '    Registry-->>Prepare: action metadata',
    '    Prepare-->>Client: required fields + examples + next',
    '    Client->>Run: run actionId with args/contextId',
    '    Run->>Registry: resolve action',
    '    Registry-->>Run: action + risk + schema',
    '    Run->>Action: validate args and execute',
    '    Action-->>Run: result',
    '    Run-->>Client: structured tool result',
    '',
  ].join('\n');
}

export function renderPatchFlowMermaid(): string {
  return [
    'sequenceDiagram',
    '    participant Client as MCP client',
    '    participant Preview as patch_preview',
    '    participant Store as PatchPlan store',
    '    participant Apply as patch_apply',
    '    participant Gate as Mutation safety gate',
    '    participant Engine as Patch apply engine',
    '',
    '    Client->>Preview: actionId + args or patchPlan',
    '    Preview->>Store: validate and store PatchPlan',
    '    Store-->>Preview: patchPlanId',
    '    Preview-->>Client: diff / diagnostics / preview result',
    '    Client->>Apply: patchPlanId',
    '    Apply->>Store: load PatchPlan',
    '    Apply->>Gate: resolve workspace targets',
    '    Gate-->>Apply: allowed or rejected',
    '    Apply->>Engine: apply approved operations',
    '    Engine-->>Apply: mutation result',
    '    Apply-->>Client: structured mutation result',
    '',
  ].join('\n');
}

function renderActionGroupRows(model: FacadeVisualizationModel): string[] {
  return model.actionGroups.map((group) => [
    group.label,
    `\`${group.capability}\``,
    String(group.count),
    group.risks.map((risk) => `\`${risk}\``).join(', '),
    group.entrypoint,
  ].join(' | ')).map((row) => `| ${row} |`);
}

export function renderReadmeSection(model: FacadeVisualizationModel): string {
  return [
    '## Facade architecture map',
    '',
    'The MCP server uses a small public facade and keeps domain-specific behavior behind an internal Action Registry.',
    '',
    '```mermaid',
    renderArchitectureMermaid(model).trimEnd(),
    '```',
    '',
    '### Normal read-only / preview flow',
    '',
    '```mermaid',
    renderNormalFlowMermaid().trimEnd(),
    '```',
    '',
    '### Mutation-safe patch flow',
    '',
    'Commit mutations can execute through Workbench mutation tools without a separate approval ceremony. The facade still offers preview and canonical patch apply flows for structured file changes.',
    '',
    '```mermaid',
    renderPatchFlowMermaid().trimEnd(),
    '```',
    '',
    '### Internal action groups',
    '',
    '| Group | Capability | Actions | Risks | Public entrypoint |',
    '| --- | --- | ---: | --- | --- |',
    ...renderActionGroupRows(model),
    '',
    '### Why this facade exists',
    '',
    'The facade reduces the external MCP `tools/list` surface while preserving the full domain capability internally. `route_intent` decides the likely capability, `catalog` exposes relevant actions, `prepare_action` explains one action schema, `run_action` executes internal actions, `context` carries large payloads by handle, and `patch_preview` / `patch_apply` provide a structured path for file writes.',
    '',
  ].join('\n');
}

export function serializeFacadeGraph(model: FacadeVisualizationModel): string {
  return JSON.stringify({
    schema: model.schema,
    generatedAt: model.generatedAt,
    nodes: model.nodes,
    edges: model.edges,
    actionGroups: model.actionGroups,
  }, null, 2) + '\n';
}

export async function writeFacadeVisualizationReports(
  model: FacadeVisualizationModel,
  outDir: string,
): Promise<{
  architecturePath: string;
  normalFlowPath: string;
  patchFlowPath: string;
  graphPath: string;
  readmeSectionPath: string;
}> {
  await mkdir(outDir, { recursive: true });
  const architecturePath = path.join(outDir, 'facade-architecture.mmd');
  const normalFlowPath = path.join(outDir, 'facade-normal-flow.mmd');
  const patchFlowPath = path.join(outDir, 'facade-patch-flow.mmd');
  const graphPath = path.join(outDir, 'facade-graph.json');
  const readmeSectionPath = path.join(outDir, 'facade-readme-section.md');

  await writeFile(architecturePath, renderArchitectureMermaid(model), 'utf8');
  await writeFile(normalFlowPath, renderNormalFlowMermaid(), 'utf8');
  await writeFile(patchFlowPath, renderPatchFlowMermaid(), 'utf8');
  await writeFile(graphPath, serializeFacadeGraph(model), 'utf8');
  await writeFile(readmeSectionPath, renderReadmeSection(model), 'utf8');

  return { architecturePath, graphPath, normalFlowPath, patchFlowPath, readmeSectionPath };
}

async function main(): Promise<void> {
  const outDir = path.resolve(process.cwd(), 'reports/mcp-facade-visualization');
  const model = buildFacadeVisualizationModel({ generatedAt: DETERMINISTIC_REPORT_GENERATED_AT });
  const result = await writeFacadeVisualizationReports(model, outDir);

  // eslint-disable-next-line no-console
  console.log(`Facade visualization reports written to ${outDir}`);
  // eslint-disable-next-line no-console
  console.log(`Architecture: ${result.architecturePath}`);
  // eslint-disable-next-line no-console
  console.log(`Graph: ${result.graphPath}`);
  // eslint-disable-next-line no-console
  console.log(`README section: ${result.readmeSectionPath}`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
