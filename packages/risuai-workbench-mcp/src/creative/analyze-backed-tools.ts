/**
 * Pure helpers for analyze/wiki/graph-backed high-leverage creative tools.
 * @file packages/risuai-workbench-mcp/src/creative/analyze-backed-tools.ts
 */

import {
  createCreativeImpactPreviewEnvelope,
  createIdea,
  type AnalyzeImpactSummary,
  type AffectedGraphPreview,
  type CritiqueRisk,
  type Idea,
  type PatchPreviewRef,
} from '../contracts/creative';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type DiagnosticEnvelopeStatus, type WorkbenchDiagnostic } from '../contracts/diagnostics';

export type AnalyzeBackedToolName =
  | 'workbench.creative.preview_creative_impact'
  | 'workbench.creative.find_graph_bridge_ideas'
  | 'workbench.creative.critique_idea_with_analyze'
  | 'workbench.creative.remix_dead_code_into_ideas'
  | 'workbench.creative.optimize_prompt_chain_insertion';

export interface ReadOnlyCreativeAnalyzeMarkers {
  readOnly: true;
  sourceWrites: readonly [];
  sessionWrites: readonly [];
  mutationCalls: readonly [];
}

export interface AnalyzeBackedCompactPolicy {
  embeddedPayloadPolicy: 'summaries-and-resource-links-only';
  maxItems: number;
  maxEvidencePerItem: number;
  maxResourceLinks: number;
  truncated: boolean;
}

export interface PreviewCreativeImpactData extends ReadOnlyCreativeAnalyzeMarkers {
  impact: ReturnType<typeof createCreativeImpactPreviewEnvelope>;
  evidence: readonly string[];
  assumptions: readonly string[];
  resourceLinks: readonly string[];
  compact: AnalyzeBackedCompactPolicy;
}

export interface GraphBridgeIdea {
  idea: Idea;
  bridge: {
    from: string;
    to: string;
    edgeKind: string;
    sharedSignals: readonly string[];
    resourceUri: string;
  };
}

export interface FindGraphBridgeIdeasData extends ReadOnlyCreativeAnalyzeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.find_graph_bridge_ideas';
  sessionId: string;
  ideas: readonly GraphBridgeIdea[];
  graphResourceUri?: string;
  resourceLinks: readonly string[];
  nextActions: readonly string[];
  compact: AnalyzeBackedCompactPolicy;
}

export interface AnalyzeCritiqueRisk extends CritiqueRisk {
  assumptions: readonly string[];
}

export interface CritiqueIdeaWithAnalyzeData extends ReadOnlyCreativeAnalyzeMarkers {
  schema: 'risuai-workbench-mcp.creative.analyze-critique';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.critique_idea_with_analyze';
  status: DiagnosticEnvelopeStatus;
  ideaId: string;
  idea?: Idea;
  advisoryOnly: true;
  risks: readonly AnalyzeCritiqueRisk[];
  requiredValidation: readonly string[];
  resourceLinks: readonly string[];
  nextActions: readonly string[];
  compact: AnalyzeBackedCompactPolicy;
}

export interface RemixDeadCodeIdea {
  idea: Idea;
  sourceFinding: {
    id: string;
    type: string;
    target: string;
  };
  reuseModes: readonly ['reuse', 'replace', 'archive'];
}

export interface RemixDeadCodeIntoIdeasData extends ReadOnlyCreativeAnalyzeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.remix_dead_code_into_ideas';
  sessionId: string;
  ideas: readonly RemixDeadCodeIdea[];
  resourceLinks: readonly string[];
  nextActions: readonly string[];
  compact: AnalyzeBackedCompactPolicy;
}

export interface PromptInsertionCandidate {
  id: string;
  position: string;
  score: number;
  rationale: readonly string[];
  evidence: readonly string[];
  assumptions: readonly string[];
  resourceLinks: readonly string[];
}

export interface OptimizePromptChainInsertionData extends ReadOnlyCreativeAnalyzeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.optimize_prompt_chain_insertion';
  ideaId: string;
  heuristicOnly: true;
  candidates: readonly PromptInsertionCandidate[];
  tokenBudgetSummary: string;
  promptChainRisk: string;
  resourceLinks: readonly string[];
  nextActions: readonly string[];
  compact: AnalyzeBackedCompactPolicy;
}

export type PreviewCreativeImpactResult = DiagnosticEnvelope<PreviewCreativeImpactData>;
export type FindGraphBridgeIdeasResult = DiagnosticEnvelope<FindGraphBridgeIdeasData>;
export type CritiqueIdeaWithAnalyzeResult = DiagnosticEnvelope<CritiqueIdeaWithAnalyzeData>;
export type RemixDeadCodeIntoIdeasResult = DiagnosticEnvelope<RemixDeadCodeIntoIdeasData>;
export type OptimizePromptChainInsertionResult = DiagnosticEnvelope<OptimizePromptChainInsertionData>;

interface NormalizedContext {
  analyze: Record<string, unknown>;
  artifactKey: string;
  deadCode: Record<string, unknown>;
  diagnostics: WorkbenchDiagnostic[];
  graph: Record<string, unknown>;
  idea?: Idea;
  ideaId: string;
  patchPreview: PatchPreviewRef;
  promptChain: Record<string, unknown>;
  record: Record<string, unknown>;
  resourceLinks: readonly string[];
  sessionId: string;
  targetArtifacts: readonly string[];
  tokenBudget: Record<string, unknown>;
  wikiConstraints: readonly string[];
}

interface GraphNode {
  id: string;
  label: string;
  kind: string;
}

interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

interface DeadCodeFinding {
  id: string;
  type: string;
  target: string;
  evidence: readonly string[];
  message: string;
}

const READ_ONLY_MARKERS: ReadOnlyCreativeAnalyzeMarkers = {
  mutationCalls: [],
  readOnly: true,
  sessionWrites: [],
  sourceWrites: [],
};

const MAX_ITEMS = 5;
const MAX_EVIDENCE = 4;
const MAX_RESOURCE_LINKS = 12;
const MAX_TEXT = 180;

/**
 * buildPreviewCreativeImpactResult 함수.
 * Caller-supplied analyze/wiki/graph summaries를 compact what-if impact preview로 정규화한다.
 */
export function buildPreviewCreativeImpactResult(input: unknown): PreviewCreativeImpactResult {
  const tool = 'workbench.creative.preview_creative_impact' as const;
  const context = normalizeContext(input, tool);
  const diagnostics = [...context.diagnostics];
  if (!hasAnalyzeSignal(context)) diagnostics.push(missingAnalyzeDiagnostic());
  if (context.wikiConstraints.length === 0) diagnostics.push(missingWikiDiagnostic());
  if (!hasGraphSignal(context)) diagnostics.push(missingGraphDiagnostic(tool));

  const analyzeImpact = buildAnalyzeImpact(context);
  const affectedGraph = buildAffectedGraph(context);
  const status = statusFromDiagnostics(diagnostics);
  const resourceLinks = compactStringList([
    ...context.resourceLinks,
    ...context.wikiConstraints,
    analyzeResource(context.artifactKey, 'variables'),
    analyzeResource(context.artifactKey, 'token-budget'),
    analyzeResource(context.artifactKey, 'prompt-chain'),
    affectedGraph?.resourceUri,
    context.patchPreview.resourceUri,
  ], MAX_RESOURCE_LINKS);
  const impact = createCreativeImpactPreviewEnvelope({
    affectedGraph,
    analyzeImpact,
    ideaId: context.ideaId,
    nextActions: [
      'workbench.creative.critique_idea_with_analyze',
      context.patchPreview.available ? 'workbench.creative.turn_idea_into_patch_plan' : 'workbench.suggest_patch',
      ...refreshNextActions(diagnostics),
    ],
    patchPreview: context.patchPreview,
    status,
    summary: compactText(context.idea?.summary ?? firstString(context.record.summary, context.record.theme, 'Creative impact preview requires caller-supplied idea/analyze context.') ?? 'Creative impact preview requires caller-supplied idea/analyze context.'),
    tool,
    wikiConstraints: context.wikiConstraints,
  });

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      assumptions: assumptionsForMissing(diagnostics),
      compact: compactPolicy(resourceLinks.length < unboundedResourceLinks(context).length),
      evidence: compactStringList(resourceLinks, MAX_EVIDENCE),
      impact,
      resourceLinks,
    },
    diagnostics,
    status,
    tool,
  });
}

/**
 * buildFindGraphBridgeIdeasResult 함수.
 * Supplied relationship network에서 weak-tie/bridge 후보를 advisory idea로 만든다.
 */
export function buildFindGraphBridgeIdeasResult(input: unknown): FindGraphBridgeIdeasResult {
  const tool = 'workbench.creative.find_graph_bridge_ideas' as const;
  const context = normalizeContext(input, tool);
  const diagnostics = [...context.diagnostics];
  if (!hasGraphSignal(context)) diagnostics.push(missingGraphDiagnostic(tool));
  const graph = normalizeGraph(context.graph);
  const graphResourceUri = hasGraphSignal(context) ? graphResource(context.artifactKey, 'relationship-network') : undefined;
  const ideas = hasGraphSignal(context) ? buildBridgeIdeas(context, graph) : [];
  const status = statusFromDiagnostics(diagnostics);
  const resourceLinks = compactStringList([...context.resourceLinks, graphResourceUri], MAX_RESOURCE_LINKS);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      compact: compactPolicy(ideas.length >= MAX_ITEMS || resourceLinks.length < uniqueStrings([...context.resourceLinks, graphResourceUri]).length),
      graphResourceUri,
      ideas,
      nextActions: ideas.length > 0
        ? ['workbench.creative.preview_creative_impact', 'workbench.creative.rank_ideas', ...refreshNextActions(diagnostics)]
        : ['workbench.query_relationship_network', 'workbench.refresh_analyze_snapshot', 'workbench.creative.gather_context'],
      resourceLinks,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId: context.sessionId,
      tool,
    },
    diagnostics,
    status,
    tool,
  });
}

/**
 * buildCritiqueIdeaWithAnalyzeResult 함수.
 * Analyzer evidence와 explicit assumptions를 분리해 idea risk를 advisory-only로 반환한다.
 */
export function buildCritiqueIdeaWithAnalyzeResult(input: unknown): CritiqueIdeaWithAnalyzeResult {
  const tool = 'workbench.creative.critique_idea_with_analyze' as const;
  const context = normalizeContext(input, tool);
  const diagnostics = [...context.diagnostics];
  if (!context.idea) diagnostics.push(missingIdeaDiagnostic(tool, context.ideaId));
  if (!hasAnalyzeSignal(context)) diagnostics.push(missingAnalyzeDiagnostic());
  const risks = buildAnalyzeCritiqueRisks(context);
  const status = statusFromDiagnostics(diagnostics);
  const requiredValidation = compactStringList([
    'workbench.validate_frontmatter',
    'workbench.validate_order',
    'workbench.query_token_budget',
    risks.some((risk) => risk.category === 'prompt-chain') ? 'workbench.query_prompt_chain' : undefined,
    risks.some((risk) => risk.category === 'composition') ? 'workbench.query_composition_conflicts' : undefined,
  ], MAX_ITEMS);
  const resourceLinks = compactStringList([
    ...context.resourceLinks,
    analyzeResource(context.artifactKey, 'variables'),
    analyzeResource(context.artifactKey, 'token-budget'),
    analyzeResource(context.artifactKey, 'prompt-chain'),
    hasGraphSignal(context) ? graphResource(context.artifactKey, 'relationship-network') : undefined,
  ], MAX_RESOURCE_LINKS);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      advisoryOnly: true,
      compact: compactPolicy(risks.length > MAX_ITEMS || resourceLinks.length < unboundedResourceLinks(context).length),
      idea: context.idea,
      ideaId: context.ideaId,
      nextActions: ['workbench.creative.preview_creative_impact', 'workbench.creative.rank_ideas', ...refreshNextActions(diagnostics)],
      requiredValidation,
      resourceLinks,
      risks: risks.slice(0, MAX_ITEMS),
      schema: 'risuai-workbench-mcp.creative.analyze-critique',
      schemaVersion: '0.2.0',
      status,
      tool,
    },
    diagnostics,
    status,
    tool,
  });
}

/**
 * buildRemixDeadCodeIntoIdeasResult 함수.
 * Dead-code findings를 destructive cleanup이 아닌 reuse/replace/archive creative 후보로 변환한다.
 */
export function buildRemixDeadCodeIntoIdeasResult(input: unknown): RemixDeadCodeIntoIdeasResult {
  const tool = 'workbench.creative.remix_dead_code_into_ideas' as const;
  const context = normalizeContext(input, tool);
  const diagnostics = [...context.diagnostics];
  const findings = normalizeDeadCodeFindings(context.deadCode);
  if (findings.length === 0) diagnostics.push(missingDeadCodeDiagnostic(tool));
  const ideas = findings.slice(0, MAX_ITEMS).map((finding, index) => remixFindingIntoIdea(context, finding, index));
  const status = statusFromDiagnostics(diagnostics);
  const resourceLinks = compactStringList([
    ...context.resourceLinks,
    analyzeResource(context.artifactKey, 'dead-code-findings'),
    hasGraphSignal(context) ? graphResource(context.artifactKey, 'relationship-network') : undefined,
  ], MAX_RESOURCE_LINKS);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      compact: compactPolicy(findings.length > MAX_ITEMS || resourceLinks.length < unboundedResourceLinks(context).length),
      ideas,
      nextActions: ideas.length > 0
        ? ['workbench.creative.preview_creative_impact', 'workbench.creative.turn_idea_into_plan', 'workbench.creative.critique_idea_with_analyze']
        : ['workbench.query_dead_code_findings', 'workbench.query_relationship_network'],
      resourceLinks,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId: context.sessionId,
      tool,
    },
    diagnostics,
    status,
    tool,
  });
}

/**
 * buildOptimizePromptChainInsertionResult 함수.
 * Prompt chain과 token budget summaries를 compact insertion heuristic으로 바꾼다.
 */
export function buildOptimizePromptChainInsertionResult(input: unknown): OptimizePromptChainInsertionResult {
  const tool = 'workbench.creative.optimize_prompt_chain_insertion' as const;
  const context = normalizeContext(input, tool);
  const diagnostics = [...context.diagnostics];
  if (!hasPromptChainSignal(context)) diagnostics.push(missingPromptChainDiagnostic(tool));
  if (!hasTokenSignal(context)) diagnostics.push(missingTokenBudgetDiagnostic(tool));
  const candidates = buildPromptInsertionCandidates(context);
  const status = statusFromDiagnostics(diagnostics);
  const resourceLinks = compactStringList([
    ...context.resourceLinks,
    analyzeResource(context.artifactKey, 'prompt-chain'),
    analyzeResource(context.artifactKey, 'token-budget'),
    context.patchPreview.resourceUri,
  ], MAX_RESOURCE_LINKS);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      candidates,
      compact: compactPolicy(candidates.length >= MAX_ITEMS || resourceLinks.length < unboundedResourceLinks(context).length),
      heuristicOnly: true,
      ideaId: context.ideaId,
      nextActions: candidates.length > 0
        ? ['workbench.suggest_order_patch', 'workbench.creative.preview_creative_impact', 'workbench.creative.critique_idea_with_analyze']
        : ['workbench.query_prompt_chain', 'workbench.query_token_budget'],
      promptChainRisk: promptChainRisk(context),
      resourceLinks,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      tokenBudgetSummary: tokenDeltaEstimate(context),
      tool,
    },
    diagnostics,
    status,
    tool,
  });
}

function normalizeContext(input: unknown, tool: AnalyzeBackedToolName): NormalizedContext {
  const record = recordOf(input) ?? {};
  const artifactKey = firstString(record.artifactKey, firstArrayString(record.targetArtifacts), firstString(record.artifact, record.path, undefined)) ?? 'workspace';
  const idea = selectIdea(record);
  const ideaId = firstString(record.ideaId, idea?.id, stableId(firstString(record.theme, record.summary, tool) ?? tool)) ?? 'idea:unspecified';
  const analyze = unwrapEnvelope(firstDefined(record.analyze, record.analysis));
  const promptChain = unwrapEnvelope(firstDefined(record.promptChain, analyze.promptChain, analyze.prompt_chain));
  const tokenBudget = unwrapEnvelope(firstDefined(record.tokenBudget, analyze.tokenBudget, analyze.token_budget));
  const graph = unwrapEnvelope(firstDefined(record.relationshipNetwork, record.graph, analyze.relationshipNetwork, analyze.graph));
  const deadCode = unwrapEnvelope(firstDefined(record.deadCodeFindings, record.deadCode, analyze.deadCodeFindings, analyze.deadCode));
  const targetArtifacts = compactStringList(toStringArray(record.targetArtifacts), MAX_ITEMS);
  const resourceLinks = compactStringList(toStringArray(record.resourceLinks), MAX_RESOURCE_LINKS);
  const wikiConstraints = extractWikiConstraints(record, artifactKey);
  const patchPreview = extractPatchPreview(record, ideaId);
  const diagnostics = collectInputDiagnostics(tool, [record, analyze, promptChain, tokenBudget, graph, deadCode]);
  return {
    analyze,
    artifactKey,
    deadCode,
    diagnostics,
    graph,
    idea,
    ideaId,
    patchPreview,
    promptChain,
    record,
    resourceLinks,
    sessionId: firstString(record.sessionId, `creative-session:${stableId(`${tool}:${artifactKey}:${ideaId}`)}`) ?? `creative-session:${stableId(tool)}`,
    targetArtifacts,
    tokenBudget,
    wikiConstraints,
  };
}

function selectIdea(record: Record<string, unknown>): Idea | undefined {
  const candidate = recordOf(record.idea) ?? toArray(record.ideas).map(recordOf).find((entry) => entry && firstString(entry.id, undefined) === firstString(record.ideaId, undefined));
  if (!candidate) return undefined;
  const id = firstString(candidate.id, record.ideaId, undefined);
  if (!id) return undefined;
  return createIdea({
    assumptions: toStringArray(candidate.assumptions),
    candidateMutations: toStringArray(candidate.candidateMutations),
    evidence: toStringArray(candidate.evidence),
    id,
    nextActions: toStringArray(candidate.nextActions),
    summary: compactText(firstString(candidate.summary, candidate.description, 'Caller supplied idea without summary.') ?? 'Caller supplied idea without summary.'),
    title: compactText(firstString(candidate.title, id) ?? id),
  });
}

function buildAnalyzeImpact(context: NormalizedContext): AnalyzeImpactSummary {
  const variables = compactStringList(extractVariables(context), MAX_ITEMS);
  return {
    compositionRisk: compositionRisk(context),
    promptChainRisk: promptChainRisk(context),
    tokenDeltaEstimate: tokenDeltaEstimate(context),
    variables,
  };
}

function buildAffectedGraph(context: NormalizedContext): AffectedGraphPreview | undefined {
  if (!hasGraphSignal(context)) return undefined;
  const graph = normalizeGraph(context.graph);
  return {
    edgeCount: graph.edges.length,
    nodeCount: graph.nodes.length,
    resourceUri: graphResource(context.artifactKey, graph.nodes[0]?.id ?? 'relationship-network'),
  };
}

function buildBridgeIdeas(context: NormalizedContext, graph: { edges: readonly GraphEdge[]; nodes: readonly GraphNode[] }): GraphBridgeIdea[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.length > 0 ? graph.edges : graph.nodes.slice(1).map((node, index) => ({ kind: 'possible-bridge', source: graph.nodes[index]?.id ?? node.id, target: node.id }));
  return edges.slice(0, MAX_ITEMS).map((edge, index) => {
    const from = nodeById.get(edge.source)?.label ?? edge.source;
    const to = nodeById.get(edge.target)?.label ?? edge.target;
    const sharedSignals = compactStringList([...tokens(from), ...tokens(to)].filter((token, _, all) => all.indexOf(token) !== all.lastIndexOf(token)), 3);
    const evidence = compactStringList([graphResource(context.artifactKey, `relationship-network?edge=${encodeURIComponent(`${edge.source}->${edge.target}`)}`), ...context.resourceLinks], MAX_EVIDENCE);
    return {
      bridge: {
        edgeKind: edge.kind,
        from: edge.source,
        resourceUri: evidence[0] ?? graphResource(context.artifactKey, 'relationship-network'),
        sharedSignals,
        to: edge.target,
      },
      idea: createIdea({
        assumptions: ['Bridge idea is heuristic: inspect relationship network before patch planning.'],
        candidateMutations: ['validation_only', 'create_artifact', 'edit_frontmatter'],
        evidence,
        id: `bridge:${stableId(`${edge.source}:${edge.target}:${index}`)}`,
        nextActions: ['workbench.creative.preview_creative_impact', 'workbench.creative.critique_idea_with_analyze'],
        summary: compactText(`Explore a weak-tie concept between ${from} and ${to} without applying source changes.`),
        title: compactText(`Bridge ${from} ↔ ${to}`),
      }),
    };
  });
}

function buildAnalyzeCritiqueRisks(context: NormalizedContext): AnalyzeCritiqueRisk[] {
  const risks: AnalyzeCritiqueRisk[] = [];
  if (!context.idea || context.idea.evidence.length === 0) {
    risks.push({
      assumptions: ['Risk is inferred from sparse idea evidence rather than analyzer proof.'],
      category: 'evidence-gap',
      evidence: [],
      message: 'Idea needs explicit analyze/wiki evidence before any patch planning.',
      severity: 'warning',
    });
  }
  if (tokenDeltaEstimate(context).includes('over') || tokenDeltaEstimate(context).includes('exceed') || tokenDeltaEstimate(context).includes('warning')) {
    risks.push({
      assumptions: [],
      category: 'token-budget',
      evidence: [analyzeResource(context.artifactKey, 'token-budget')],
      message: `Token budget requires review: ${tokenDeltaEstimate(context)}.`,
      severity: 'warning',
    });
  }
  if (promptChainRisk(context) !== 'unknown' && promptChainRisk(context) !== 'low') {
    risks.push({
      assumptions: [],
      category: 'prompt-chain',
      evidence: [analyzeResource(context.artifactKey, 'prompt-chain')],
      message: `Prompt chain dependency risk: ${promptChainRisk(context)}.`,
      severity: 'warning',
    });
  }
  if (compositionRisk(context) !== 'unknown' && compositionRisk(context) !== 'none') {
    risks.push({
      assumptions: [],
      category: 'composition',
      evidence: [analyzeResource(context.artifactKey, 'composition-conflicts')],
      message: `Composition compatibility needs review: ${compositionRisk(context)}.`,
      severity: 'warning',
    });
  }
  if (hasGraphSignal(context) && normalizeGraph(context.graph).edges.length > 8) {
    risks.push({
      assumptions: ['Large relationship neighborhood may amplify side effects; edge count is a compact proxy only.'],
      category: 'relationship-hotspot',
      evidence: [graphResource(context.artifactKey, 'relationship-network')],
      message: 'Idea touches a dense relationship network; inspect affected graph before planning changes.',
      severity: 'info',
    });
  }
  return risks.length > 0 ? risks : [{
    assumptions: ['No high-risk analyzer signal was supplied; absence of evidence is not approval.'],
    category: 'no-critical-signal',
    evidence: compactStringList([analyzeResource(context.artifactKey, 'variables'), analyzeResource(context.artifactKey, 'token-budget')], MAX_EVIDENCE),
    message: 'No critical analyzer risk is visible in the supplied compact summaries; continue with validation before patch preview.',
    severity: 'info',
  }];
}

function remixFindingIntoIdea(context: NormalizedContext, finding: DeadCodeFinding, index: number): RemixDeadCodeIdea {
  const evidence = compactStringList([...finding.evidence, analyzeResource(context.artifactKey, `dead-code-findings/${finding.id}`)], MAX_EVIDENCE);
  return {
    idea: createIdea({
      assumptions: ['Dead-code remix is advisory only; destructive cleanup must use a separate confirmation flow.'],
      candidateMutations: ['validation_only', 'edit_frontmatter', 'create_artifact'],
      evidence,
      id: `dead-code-remix:${stableId(`${finding.id}:${index}`)}`,
      nextActions: ['workbench.creative.preview_creative_impact', 'workbench.creative.critique_idea_with_analyze'],
      summary: compactText(`Reuse, replace, or archive ${finding.target} (${finding.type}) as creative material before considering deletion.`),
      title: compactText(`Remix dormant ${finding.target}`),
    }),
    reuseModes: ['reuse', 'replace', 'archive'],
    sourceFinding: {
      id: finding.id,
      target: finding.target,
      type: finding.type,
    },
  };
}

function buildPromptInsertionCandidates(context: NormalizedContext): PromptInsertionCandidate[] {
  const chain = toArray(firstDefined(context.promptChain.chain, context.promptChain.links, context.promptChain.templates)).map(recordOf).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (chain.length === 0) {
    return hasPromptChainSignal(context) ? [{
      assumptions: ['Prompt chain summary did not include ordered links; candidate uses a conservative end-of-chain placement.'],
      evidence: [analyzeResource(context.artifactKey, 'prompt-chain')],
      id: 'prompt-insertion:end',
      position: 'after-current-chain',
      rationale: ['Avoids interrupting existing read/write dependencies until query_prompt_chain is refreshed with ordered links.'],
      resourceLinks: [analyzeResource(context.artifactKey, 'prompt-chain')],
      score: 50,
    }] : [];
  }
  return chain.slice(0, MAX_ITEMS).map((link, index) => {
    const name = firstString(link.name, link.templateName, link.to, link.from, `link-${index + 1}`) ?? `link-${index + 1}`;
    const reads = toStringArray(firstDefined(link.cbsReads, link.reads));
    const writes = toStringArray(firstDefined(link.cbsWrites, link.writes));
    const score = Math.max(1, 90 - writes.length * 15 - index * 5 + reads.length * 3);
    return {
      assumptions: ['“Optimize” means deterministic heuristic ranking, not proof of global optimality.'],
      evidence: [analyzeResource(context.artifactKey, `prompt-chain/${encodeURIComponent(name)}`)],
      id: `prompt-insertion:${stableId(`${name}:${index}`)}`,
      position: `after:${name}`,
      rationale: compactStringList([
        writes.length > 0 ? `Avoids placing before ${writes.length} known writes unless dependency order is reviewed.` : 'Low write-conflict signal in supplied chain link.',
        reads.length > 0 ? `Can reuse ${reads.length} supplied read dependencies after this point.` : 'No explicit read dependencies supplied for this link.',
        `Token budget signal: ${tokenDeltaEstimate(context)}.`,
      ], 3),
      resourceLinks: [analyzeResource(context.artifactKey, 'prompt-chain'), analyzeResource(context.artifactKey, 'token-budget')],
      score,
    };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function extractVariables(context: NormalizedContext): readonly string[] {
  const variables = toArray(firstDefined(context.analyze.variables, context.analyze.variableFlow, context.record.variables));
  const fromRecords = variables.flatMap((entry) => {
    const record = recordOf(entry);
    if (!record) return typeof entry === 'string' ? [entry] : [];
    return toStringArray(firstDefined(record.varName, record.name, record.id));
  });
  const fromIdea = context.idea ? [...tokens(context.idea.title), ...tokens(context.idea.summary)].filter((token) => token.length > 2) : [];
  return uniqueStrings([...fromRecords, ...fromIdea]).slice(0, MAX_ITEMS);
}

function tokenDeltaEstimate(context: NormalizedContext): string {
  const summary = firstString(context.tokenBudget.summary, context.tokenBudget.status, context.tokenBudget.risk, undefined);
  if (summary) return compactText(summary);
  const total = firstNumber(context.tokenBudget.totalEstimatedTokens, context.tokenBudget.totalTokens, context.tokenBudget.estimatedTokens);
  const limit = firstNumber(context.tokenBudget.limit, context.tokenBudget.maxTokens, context.tokenBudget.threshold);
  if (typeof total === 'number' && typeof limit === 'number') return total > limit ? `over-budget (${total}/${limit} tokens)` : `within supplied budget (${total}/${limit} tokens)`;
  if (typeof total === 'number') return `~${total} supplied tokens`;
  return 'unknown';
}

function promptChainRisk(context: NormalizedContext): string {
  const issues = toArray(context.promptChain.issues);
  if (issues.length > 0) return `needs-order-review (${issues.length} issues)`;
  const risk = firstString(context.promptChain.risk, context.promptChain.status, context.promptChain.summary, undefined);
  if (risk) return compactText(risk);
  return hasPromptChainSignal(context) ? 'low' : 'unknown';
}

function compositionRisk(context: NormalizedContext): string {
  const composition = unwrapEnvelope(firstDefined(context.record.composition, context.record.compositionConflicts, context.analyze.composition, context.analyze.compositionConflicts));
  const conflicts = toArray(composition.conflicts);
  if (conflicts.length > 0) return `${conflicts.length} supplied conflicts`;
  return firstString(composition.risk, recordOf(composition.summary)?.risk, composition.status, 'none') ?? 'none';
}

function normalizeGraph(graph: Record<string, unknown>): { edges: readonly GraphEdge[]; nodes: readonly GraphNode[] } {
  const nodes = toArray(graph.nodes).map((entry) => {
    const record = recordOf(entry);
    if (!record) return typeof entry === 'string' ? { id: entry, kind: 'node', label: entry } : null;
    const id = firstString(record.id, record.name, record.label, undefined);
    if (!id) return null;
    return {
      id,
      kind: firstString(record.kind, record.type, 'node') ?? 'node',
      label: firstString(record.label, record.name, id) ?? id,
    };
  }).filter((entry): entry is GraphNode => entry !== null);
  const edges = toArray(graph.edges).map((entry) => {
    const record = recordOf(entry);
    if (!record) return null;
    const source = firstString(record.source, record.from, undefined);
    const target = firstString(record.target, record.to, undefined);
    if (!source || !target) return null;
    return {
      kind: firstString(record.kind, record.type, 'relates') ?? 'relates',
      source,
      target,
    };
  }).filter((entry): entry is GraphEdge => entry !== null);
  return { edges, nodes };
}

function normalizeDeadCodeFindings(deadCode: Record<string, unknown>): readonly DeadCodeFinding[] {
  const findings = toArray(firstDefined(deadCode.findings, deadCode.items, deadCode.candidates)).map<DeadCodeFinding | null>((entry, index) => {
    const record = recordOf(entry);
    if (!record) return null;
    const target = firstString(record.target, record.variableName, record.name, record.path, `finding-${index + 1}`) ?? `finding-${index + 1}`;
    const type = firstString(record.type, record.kind, 'dead-code-candidate') ?? 'dead-code-candidate';
    return {
      evidence: toStringArray(record.evidence),
      id: firstString(record.id, `${type}:${target}`) ?? `${type}:${target}`,
      message: compactText(firstString(record.message, record.summary, `${target} is available as a reuse candidate.`) ?? `${target} is available as a reuse candidate.`),
      target,
      type,
    };
  });
  return findings.filter((entry): entry is DeadCodeFinding => entry !== null);
}

function extractWikiConstraints(record: Record<string, unknown>, artifactKey: string): readonly string[] {
  const entries = toArray(firstDefined(record.wiki, record.wikiEntries, record.wikiConstraints));
  const constraints = entries.flatMap((entry) => {
    if (typeof entry === 'string') return entry.startsWith('risuai-workbench://') ? [entry] : [wikiResource(entry)];
    const wiki = recordOf(entry);
    if (!wiki) return [];
    const link = firstString(wiki.resourceUri, wiki.uri, wiki.path, undefined);
    return link ? [link.startsWith('risuai-workbench://') ? link : wikiResource(link)] : [];
  });
  return compactStringList([
    ...constraints,
    constraints.length === 0 && hasAny(record.wiki, record.wikiEntries) ? wikiResource(artifactKey) : undefined,
  ], MAX_RESOURCE_LINKS);
}

function extractPatchPreview(record: Record<string, unknown>, ideaId: string): PatchPreviewRef {
  const patch = recordOf(firstDefined(record.patchPreview, record.patchPlan, record.patchPreviewRef));
  const resourceUri = patch ? firstString(patch.resourceUri, patch.uri, undefined) : firstString(record.patchPreviewUri, undefined);
  const available = Boolean(resourceUri) || Boolean(patch && firstDefined(patch.available, patch.patchPlanId));
  return {
    available,
    resourceUri: resourceUri ?? (available ? `risuai-workbench://mutations/patch-plans/${encodeURIComponent(`patch:${ideaId}`)}` : undefined),
  };
}

function collectInputDiagnostics(tool: AnalyzeBackedToolName, records: readonly Record<string, unknown>[]): WorkbenchDiagnostic[] {
  const diagnostics: WorkbenchDiagnostic[] = [];
  for (const record of records) {
    if (isUnavailableRecord(record)) diagnostics.push(unavailableDiagnostic(tool));
    const snapshot = recordOf(record.snapshot);
    if (snapshot && (snapshot.stale === true || toArray(snapshot.staleReasons).length > 0)) diagnostics.push(staleDiagnostic(tool));
    const envelopeDiagnostics = toArray(record.diagnostics).map(recordOf).filter((entry): entry is Record<string, unknown> => Boolean(entry));
    if (envelopeDiagnostics.some((entry) => firstString(entry.id, undefined) === 'ANALYZE_SNAPSHOT_STALE')) diagnostics.push(staleDiagnostic(tool));
  }
  return dedupeDiagnostics(diagnostics);
}

function hasAnalyzeSignal(context: NormalizedContext): boolean {
  return hasAny(context.analyze.variables, context.analyze.variableFlow, context.promptChain.chain, context.tokenBudget.summary, context.tokenBudget.totalEstimatedTokens, context.graph.nodes, context.deadCode.findings);
}

function hasGraphSignal(context: NormalizedContext): boolean {
  return toArray(context.graph.nodes).length > 0 || toArray(context.graph.edges).length > 0;
}

function hasPromptChainSignal(context: NormalizedContext): boolean {
  return hasAny(context.promptChain.chain, context.promptChain.links, context.promptChain.templates, context.promptChain.totalEstimatedTokens, context.promptChain.issues);
}

function hasTokenSignal(context: NormalizedContext): boolean {
  return hasAny(context.tokenBudget.summary, context.tokenBudget.status, context.tokenBudget.totalEstimatedTokens, context.tokenBudget.totalTokens, context.tokenBudget.components);
}

function statusFromDiagnostics(diagnostics: readonly WorkbenchDiagnostic[]): DiagnosticEnvelopeStatus {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'domain_error' : diagnostics.length > 0 ? 'domain_warning' : 'ok';
}

function compactPolicy(truncated: boolean): AnalyzeBackedCompactPolicy {
  return {
    embeddedPayloadPolicy: 'summaries-and-resource-links-only',
    maxEvidencePerItem: MAX_EVIDENCE,
    maxItems: MAX_ITEMS,
    maxResourceLinks: MAX_RESOURCE_LINKS,
    truncated,
  };
}

function refreshNextActions(diagnostics: readonly WorkbenchDiagnostic[]): readonly string[] {
  const actions: string[] = [];
  if (diagnostics.some((diagnostic) => diagnostic.id.includes('STALE'))) actions.push('workbench.refresh_analyze_snapshot');
  if (diagnostics.some((diagnostic) => diagnostic.id.includes('GRAPH_MISSING'))) actions.push('workbench.query_relationship_network');
  if (diagnostics.some((diagnostic) => diagnostic.id.includes('ANALYZE_MISSING'))) actions.push('workbench.query_variable_flow');
  if (diagnostics.some((diagnostic) => diagnostic.id.includes('WIKI_MISSING'))) actions.push('workbench.search_wiki');
  return uniqueStrings(actions);
}

function assumptionsForMissing(diagnostics: readonly WorkbenchDiagnostic[]): readonly string[] {
  return diagnostics.length > 0
    ? diagnostics.map((diagnostic) => `Assumption required: ${diagnostic.message}`).slice(0, MAX_EVIDENCE)
    : ['Impact preview is based only on caller-supplied compact analyze/wiki/graph summaries.'];
}

function unboundedResourceLinks(context: NormalizedContext): readonly string[] {
  return uniqueStrings([
    ...context.resourceLinks,
    ...context.wikiConstraints,
    analyzeResource(context.artifactKey, 'variables'),
    analyzeResource(context.artifactKey, 'token-budget'),
    analyzeResource(context.artifactKey, 'prompt-chain'),
    graphResource(context.artifactKey, 'relationship-network'),
    context.patchPreview.resourceUri,
  ]);
}

function missingAnalyzeDiagnostic(): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_ANALYZE_CONTEXT_MISSING',
    message: 'No supplied analyze summary was found; pass query_variable_flow/query_token_budget/query_prompt_chain outputs or refresh analyze context.',
    path: null,
    ruleId: 'creative.analyze.missing',
    severity: 'warning',
  };
}

function missingWikiDiagnostic(): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_WIKI_CONTEXT_MISSING',
    message: 'No supplied wiki constraint/resource link was found; use workbench.search_wiki for relevant artifact rules.',
    path: null,
    ruleId: 'creative.wiki.missing',
    severity: 'warning',
  };
}

function missingGraphDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_ANALYZE_GRAPH_MISSING',
    message: `${tool} needs a supplied relationship network snapshot; call workbench.query_relationship_network and retry with the compact graph summary.`,
    path: null,
    ruleId: 'creative.graph.missing',
    severity: 'warning',
  };
}

function missingIdeaDiagnostic(tool: string, ideaId: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_ANALYZE_IDEA_MISSING',
    message: `${tool} could not find supplied idea ${ideaId}; pass idea or ideas plus ideaId.`,
    path: null,
    ruleId: 'creative.idea.missing',
    severity: 'warning',
  };
}

function missingDeadCodeDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_DEAD_CODE_FINDINGS_MISSING',
    message: `${tool} needs supplied query_dead_code_findings output; no cleanup candidates were embedded.`,
    path: null,
    ruleId: 'creative.dead-code.missing',
    severity: 'warning',
  };
}

function missingPromptChainDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_PROMPT_CHAIN_MISSING',
    message: `${tool} needs supplied query_prompt_chain output before ranking insertion positions.`,
    path: null,
    ruleId: 'creative.prompt-chain.missing',
    severity: 'warning',
  };
}

function missingTokenBudgetDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_TOKEN_BUDGET_MISSING',
    message: `${tool} needs supplied query_token_budget output before estimating insertion cost.`,
    path: null,
    ruleId: 'creative.token-budget.missing',
    severity: 'warning',
  };
}

function staleDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_ANALYZE_SOURCE_STALE',
    message: `${tool} received stale analyze snapshot metadata; refresh before patch planning.`,
    path: null,
    ruleId: 'creative.analyze.stale',
    severity: 'warning',
  };
}

function unavailableDiagnostic(tool: string): WorkbenchDiagnostic {
  return {
    category: 'creative-analyze',
    id: 'CREATIVE_ANALYZE_SOURCE_UNAVAILABLE',
    message: `${tool} received an unavailable/not_found supporting context record.`,
    path: null,
    ruleId: 'creative.context.unavailable',
    severity: 'warning',
  };
}

function dedupeDiagnostics(diagnostics: readonly WorkbenchDiagnostic[]): WorkbenchDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.id}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analyzeResource(artifactKey: string, path: string): string {
  return `risuai-workbench://analyze/${encodeURIComponent(artifactKey)}/${path}`;
}

function graphResource(artifactKey: string, path: string): string {
  return `risuai-workbench://analyze/${encodeURIComponent(artifactKey)}/${path}`;
}

function wikiResource(path: string): string {
  return `risuai-workbench://wiki/${path.replace(/^\/+/, '')}`;
}

function unwrapEnvelope(value: unknown): Record<string, unknown> {
  const record = recordOf(value);
  if (!record) return {};
  return recordOf(record.data) ?? record;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  return typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [];
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function firstArrayString(value: unknown): string | undefined {
  return toStringArray(value)[0];
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function hasAny(...values: unknown[]): boolean {
  return values.some((value) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
}

function isUnavailableRecord(record: Record<string, unknown>): boolean {
  const status = firstString(record.status, record.reason, undefined)?.toLowerCase();
  return status === 'unavailable' || status === 'not_found' || status === 'missing';
}

function compactStringList(values: readonly (string | undefined)[], max: number): string[] {
  return uniqueStrings(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => compactText(value.trim()))).slice(0, max);
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= MAX_TEXT ? normalized : `${normalized.slice(0, MAX_TEXT - 1)}…`;
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9:_-]+/).filter((token) => token.length > 2);
}

function stableId(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
