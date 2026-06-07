/**
 * Pure deterministic helpers for creative ranking, critique, clustering, and supplied idea graph tools.
 * @file packages/risuai-workbench-mcp/src/creative/ranking-critique-tools.ts
 */

import {
  DEFAULT_RANKING_DIMENSIONS,
  createIdea,
  type Idea,
  type IdeaGraph,
  type IdeaRanking,
  type IdeaRelation,
  type IdeaRelationKind,
  type MutationReadinessLevel,
  type RankingDimensions,
} from '../contracts/creative';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';

export type RankingCritiqueToolName =
  | 'workbench.creative.rank_ideas'
  | 'workbench.creative.critique_six_hats'
  | 'workbench.creative.red_team_concept'
  | 'workbench.creative.cluster_ideas'
  | 'workbench.creative.deduplicate_ideas'
  | 'workbench.creative.search_idea_graph'
  | 'workbench.creative.open_idea_neighborhood';

export type RankingDimensionName = keyof RankingDimensions;

export type RankingDimensionScores = Record<RankingDimensionName, number>;

export interface ReadOnlyCreativeMarkers {
  readOnly: true;
  sourceWrites: readonly [];
  sessionWrites: readonly [];
  mutationCalls: readonly [];
}

export interface RankingResultItem {
  ideaId: string;
  rank: number;
  score: number;
  dimensions: RankingDimensionScores;
  ranking: IdeaRanking;
  evidence: readonly string[];
  assumptions: readonly string[];
  advisory: {
    patchReadinessIsGate: false;
    rationale: readonly string[];
  };
  idea: Idea;
}

export interface RankIdeasData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.rank_ideas';
  sessionId: string;
  dimensions: RankingDimensions;
  rankings: readonly RankingResultItem[];
  nextActions: readonly string[];
}

export interface CritiquePerspective {
  id: string;
  label: string;
  focus: string;
  diagnostics: readonly string[];
  recommendations: readonly string[];
  evidence: readonly string[];
  assumptions: readonly string[];
}

export interface AdvisoryRisk {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence: readonly string[];
  assumptions: readonly string[];
}

export interface CritiqueData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.analyze-critique';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.critique_six_hats';
  ideaId: string;
  idea?: Idea;
  hats: readonly CritiquePerspective[];
  advisoryRisks: readonly AdvisoryRisk[];
  recommendations: readonly string[];
  nextActions: readonly string[];
  advisoryOnly: true;
}

export interface RedTeamData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.analyze-critique';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.red_team_concept';
  ideaId: string;
  idea?: Idea;
  attackVectors: readonly CritiquePerspective[];
  advisoryRisks: readonly AdvisoryRisk[];
  recommendations: readonly string[];
  nextActions: readonly string[];
  advisoryOnly: true;
}

export interface IdeaCluster {
  id: string;
  representativeIdeaId: string;
  ideaIds: readonly string[];
  sharedSignals: readonly string[];
  evidence: readonly string[];
  assumptions: readonly string[];
}

export interface ClusterIdeasData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.cluster_ideas';
  sessionId: string;
  clusters: readonly IdeaCluster[];
  nextActions: readonly string[];
}

export interface DuplicateIdeaCandidate {
  id: string;
  primaryIdeaId: string;
  duplicateIdeaIds: readonly string[];
  similarity: number;
  evidence: readonly string[];
  assumptions: readonly string[];
  recommendation: string;
}

export interface DeduplicateIdeasData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.deduplicate_ideas';
  sessionId: string;
  candidates: readonly DuplicateIdeaCandidate[];
  nextActions: readonly string[];
}

export interface IdeaGraphMatch {
  ideaId: string;
  score: number;
  matchedFields: readonly string[];
  evidence: readonly string[];
  assumptions: readonly string[];
  idea: Idea;
}

export interface SearchIdeaGraphData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.search_idea_graph';
  sessionId: string;
  query: string;
  matches: readonly IdeaGraphMatch[];
  relationMatches: readonly IdeaRelation[];
  nextActions: readonly string[];
}

export interface IdeaNeighborhoodData extends ReadOnlyCreativeMarkers {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: 'workbench.creative.open_idea_neighborhood';
  sessionId: string;
  ideaId: string;
  found: boolean;
  center?: Idea;
  neighbors: readonly Idea[];
  relations: readonly IdeaRelation[];
  nextActions: readonly string[];
}

export type RankIdeasResult = DiagnosticEnvelope<RankIdeasData>;
export type CritiqueSixHatsResult = DiagnosticEnvelope<CritiqueData>;
export type RedTeamConceptResult = DiagnosticEnvelope<RedTeamData>;
export type ClusterIdeasResult = DiagnosticEnvelope<ClusterIdeasData>;
export type DeduplicateIdeasResult = DiagnosticEnvelope<DeduplicateIdeasData>;
export type SearchIdeaGraphResult = DiagnosticEnvelope<SearchIdeaGraphData>;
export type OpenIdeaNeighborhoodResult = DiagnosticEnvelope<IdeaNeighborhoodData>;

interface NormalizedIdeaWithScores extends Idea {
  suppliedScores?: Record<string, unknown>;
  suppliedDimensionScores?: Record<string, unknown>;
  suppliedRankingDimensionScores?: Record<string, unknown>;
}

const DIMENSION_NAMES: readonly RankingDimensionName[] = ['impact', 'feasibility', 'novelty', 'risk', 'tokenCost', 'patchReadiness'];
const RELATION_KINDS = new Set<IdeaRelationKind>(['complements', 'contradicts', 'depends-on', 'refines', 'alternatives']);
const MAX_LIST = 6;
const MAX_TEXT = 180;
const DUPLICATE_THRESHOLD = 0.66;
const CLUSTER_THRESHOLD = 0.24;

const READ_ONLY_MARKERS: ReadOnlyCreativeMarkers = {
  mutationCalls: [],
  readOnly: true,
  sessionWrites: [],
  sourceWrites: [],
};

/**
 * buildRankIdeasResult 함수.
 * Supplied ideas only를 six-dimension rubric으로 deterministic하게 ranking한다.
 */
export function buildRankIdeasResult(input: unknown): RankIdeasResult {
  const tool = 'workbench.creative.rank_ideas' as const;
  const ideas = normalizeIdeas(input);
  const diagnostics = suppliedIdeasDiagnostics(tool, ideas);
  const dimensions = normalizeRankingDimensions(input);
  const sessionId = sessionIdFor(input, ideas, tool);
  const rankings = ideas
    .map((idea) => rankIdea(idea, dimensions))
    .sort((left, right) => right.score - left.score || left.ideaId.localeCompare(right.ideaId))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      dimensions,
      nextActions: rankings.length > 0
        ? ['workbench.creative.critique_six_hats', 'workbench.creative.red_team_concept', 'workbench.creative.cluster_ideas']
        : ['workbench.creative.gather_context', 'workbench.creative.brainstorm_scamper'],
      rankings,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId,
      tool,
    },
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'domain_error' : diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildCritiqueSixHatsResult 함수.
 * One supplied idea를 Six Hats 관점 advisory diagnostics로 분해한다.
 */
export function buildCritiqueSixHatsResult(input: unknown): CritiqueSixHatsResult {
  const tool = 'workbench.creative.critique_six_hats' as const;
  const idea = selectIdea(input);
  const ideaId = selectedIdeaId(input, idea);
  const diagnostics = idea ? sparseIdeaDiagnostics(tool, idea) : missingIdeaDiagnostics(tool, ideaId);
  const advisoryRisks = idea ? advisoryRisksForIdea(idea) : [];
  const hats = idea ? buildSixHats(idea, advisoryRisks) : [];

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      advisoryOnly: true,
      advisoryRisks,
      hats,
      idea,
      ideaId,
      nextActions: ['workbench.creative.red_team_concept', 'workbench.creative.rank_ideas', 'workbench.creative.preview_creative_impact'],
      recommendations: recommendationList(idea, advisoryRisks),
      schema: 'risuai-workbench-mcp.creative.analyze-critique',
      schemaVersion: '0.2.0',
      tool,
    },
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'domain_error' : diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildRedTeamConceptResult 함수.
 * Concept-level red-team 관점별 advisory risks와 next actions를 생성한다.
 */
export function buildRedTeamConceptResult(input: unknown): RedTeamConceptResult {
  const tool = 'workbench.creative.red_team_concept' as const;
  const idea = selectIdea(input);
  const ideaId = selectedIdeaId(input, idea);
  const diagnostics = idea ? sparseIdeaDiagnostics(tool, idea) : missingIdeaDiagnostics(tool, ideaId);
  const advisoryRisks = idea ? advisoryRisksForIdea(idea) : [];
  const attackVectors = idea ? buildRedTeamVectors(idea, advisoryRisks) : [];

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      advisoryOnly: true,
      advisoryRisks,
      attackVectors,
      idea,
      ideaId,
      nextActions: ['workbench.creative.critique_six_hats', 'workbench.creative.rank_ideas', 'workbench.creative.preview_creative_impact'],
      recommendations: recommendationList(idea, advisoryRisks),
      schema: 'risuai-workbench-mcp.creative.analyze-critique',
      schemaVersion: '0.2.0',
      tool,
    },
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'domain_error' : diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildClusterIdeasResult 함수.
 * Supplied ideas를 lexical similarity 기반 deterministic clusters로 묶는다.
 */
export function buildClusterIdeasResult(input: unknown): ClusterIdeasResult {
  const tool = 'workbench.creative.cluster_ideas' as const;
  const ideas = normalizeIdeas(input);
  const diagnostics = suppliedIdeasDiagnostics(tool, ideas);
  const sessionId = sessionIdFor(input, ideas, tool);
  const clusters = clusterIdeas(ideas, sessionId);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      clusters,
      nextActions: clusters.length > 0 ? ['workbench.creative.deduplicate_ideas', 'workbench.creative.rank_ideas'] : ['workbench.creative.brainstorm_scamper'],
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId,
      tool,
    },
    diagnostics,
    status: diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildDeduplicateIdeasResult 함수.
 * Supplied ideas에서 duplicate/near-duplicate merge candidates를 제안만 한다.
 */
export function buildDeduplicateIdeasResult(input: unknown): DeduplicateIdeasResult {
  const tool = 'workbench.creative.deduplicate_ideas' as const;
  const ideas = normalizeIdeas(input);
  const diagnostics = suppliedIdeasDiagnostics(tool, ideas);
  const sessionId = sessionIdFor(input, ideas, tool);
  const candidates = duplicateCandidates(ideas);

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      candidates,
      nextActions: candidates.length > 0 ? ['workbench.creative.cluster_ideas', 'workbench.creative.rank_ideas'] : ['workbench.creative.rank_ideas'],
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId,
      tool,
    },
    diagnostics,
    status: diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildSearchIdeaGraphResult 함수.
 * Caller-supplied graph만 deterministic 검색하며 missing data는 empty result로 반환한다.
 */
export function buildSearchIdeaGraphResult(input: unknown): SearchIdeaGraphResult {
  const tool = 'workbench.creative.search_idea_graph' as const;
  const graph = normalizeGraph(input);
  const query = firstString(recordOf(input)?.query) ?? '';
  const diagnostics = graph.ideas.length > 0 ? [] : suppliedGraphDiagnostics(tool);
  const sessionId = sessionIdFor(input, graph.ideas, tool);
  const matches = searchIdeas(graph.ideas, query);
  const matchIds = new Set(matches.map((match) => match.ideaId));
  const relationMatches = graph.relations.filter((relation) => matchIds.has(relation.from) || matchIds.has(relation.to));

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      matches,
      nextActions: matches.length > 0 ? ['workbench.creative.open_idea_neighborhood', 'workbench.creative.rank_ideas'] : ['workbench.creative.gather_context'],
      query,
      relationMatches,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId,
      tool,
    },
    diagnostics,
    status: diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

/**
 * buildOpenIdeaNeighborhoodResult 함수.
 * Caller-supplied graph에서 idea 주변 관계를 안정적으로 연다.
 */
export function buildOpenIdeaNeighborhoodResult(input: unknown): OpenIdeaNeighborhoodResult {
  const tool = 'workbench.creative.open_idea_neighborhood' as const;
  const graph = normalizeGraph(input);
  const requestedIdeaId = selectedIdeaId(input, graph.ideas[0]);
  const center = graph.ideas.find((idea) => idea.id === requestedIdeaId);
  const diagnostics = center ? [] : missingIdeaDiagnostics(tool, requestedIdeaId);
  const relationMatches = center
    ? graph.relations.filter((relation) => relation.from === center.id || relation.to === center.id)
    : [];
  const neighborIds = new Set(relationMatches.flatMap((relation) => [relation.from, relation.to]).filter((id) => id !== center?.id));
  const neighbors = graph.ideas.filter((idea) => neighborIds.has(idea.id));

  return createDiagnosticEnvelope({
    data: {
      ...READ_ONLY_MARKERS,
      center,
      found: Boolean(center),
      ideaId: requestedIdeaId,
      neighbors,
      nextActions: center ? ['workbench.creative.search_idea_graph', 'workbench.creative.cluster_ideas', 'workbench.creative.rank_ideas'] : ['workbench.creative.search_idea_graph'],
      relations: relationMatches,
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      sessionId: sessionIdFor(input, graph.ideas, tool),
      tool,
    },
    diagnostics,
    status: diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool,
  });
}

function rankIdea(idea: Idea, dimensions: RankingDimensions): RankingResultItem {
  const scores = dimensionScoresForIdea(idea);
  const raw = DIMENSION_NAMES.reduce((total, dimension) => total + scores[dimension] * dimensions[dimension].weight, 0);
  const minRaw = -25;
  const maxRaw = 80;
  const score = clamp(Math.round(((raw - minRaw) / (maxRaw - minRaw)) * 100), 0, 100);
  const mutationReadiness = readinessFromPatchScore(scores.patchReadiness);
  const ranking: IdeaRanking = {
    mutationReadiness,
    requiredValidation: requiredValidationForScores(idea, scores),
    score,
  };
  return {
    advisory: {
      patchReadinessIsGate: false,
      rationale: compactStringList([
        `patchReadiness contributed ${dimensions.patchReadiness.weight} weight independently; it did not filter the idea.`,
        scores.novelty >= 80 && scores.patchReadiness < 35
          ? 'High novelty remains visible even though patch readiness needs validation.'
          : 'Ranking is advisory and should be followed by critique/validation before patch planning.',
      ], MAX_LIST),
    },
    assumptions: idea.assumptions,
    dimensions: scores,
    evidence: idea.evidence,
    idea: { ...idea, ranking },
    ideaId: idea.id,
    rank: 0,
    ranking,
    score,
  };
}

function dimensionScoresForIdea(idea: Idea): RankingDimensionScores {
  const source = recordOf(idea);
  const supplied = recordOf(source?.suppliedScores) ?? recordOf(source?.suppliedDimensionScores) ?? recordOf(source?.suppliedRankingDimensionScores);
  const text = `${idea.title} ${idea.summary}`.toLowerCase();
  const evidenceBoost = Math.min(20, idea.evidence.length * 7);
  const assumptionPenalty = Math.min(15, idea.assumptions.length * 3);
  const mutationCount = toStringArray(idea.candidateMutations).length;
  const nextActionCount = toStringArray(idea.nextActions).length;
  const risky = containsAny(text, ['risk', 'unsafe', 'delete', 'overwrite', 'global', 'breaking']);
  const novel = containsAny(text, ['novel', 'new', 'experimental', 'unusual', 'surprise', 'contradiction', 'remix']);
  const tokenHeavy = containsAny(text, ['token', 'long', 'verbose', 'large', 'budget']);
  const patchReady = explicitPatchReadinessScore(idea);

  return {
    feasibility: numberField(supplied, 'feasibility') ?? clamp(45 + evidenceBoost + nextActionCount * 3 - assumptionPenalty, 0, 100),
    impact: numberField(supplied, 'impact') ?? clamp(50 + evidenceBoost + mutationCount * 4 + (containsAny(text, ['impact', 'core', 'flow']) ? 10 : 0), 0, 100),
    novelty: numberField(supplied, 'novelty') ?? clamp(45 + (novel ? 35 : 0) + (containsAny(text, ['baseline']) ? -10 : 0), 0, 100),
    patchReadiness: numberField(supplied, 'patchReadiness') ?? patchReady,
    risk: numberField(supplied, 'risk') ?? clamp(25 + assumptionPenalty + mutationCount * 4 + (risky ? 25 : 0), 0, 100),
    tokenCost: numberField(supplied, 'tokenCost') ?? clamp(20 + Math.round((idea.title.length + idea.summary.length) / 24) + (tokenHeavy ? 25 : 0), 0, 100),
  };
}

function explicitPatchReadinessScore(idea: Idea): number {
  const ranking = idea.ranking;
  if (ranking?.mutationReadiness === 'ready') return 90;
  if (ranking?.mutationReadiness === 'ready-with-validation') return 70;
  if (ranking?.mutationReadiness === 'needs-validation') return 40;
  if (ranking?.mutationReadiness === 'not-ready') return 15;
  const candidateMutations = toStringArray(idea.candidateMutations);
  if (candidateMutations.length === 0) return 25;
  if (candidateMutations.every((mutation) => mutation === 'validation_only')) return 45;
  return idea.evidence.length > 0 ? 65 : 35;
}

function readinessFromPatchScore(score: number): MutationReadinessLevel {
  if (score >= 82) return 'ready';
  if (score >= 58) return 'ready-with-validation';
  if (score >= 30) return 'needs-validation';
  return 'not-ready';
}

function requiredValidationForScores(idea: Idea, scores: RankingDimensionScores): string[] {
  return compactStringList([
    'workbench.query_variable',
    scores.tokenCost >= 45 ? 'workbench.query_token_budget' : '',
    scores.risk >= 45 ? 'workbench.query_composition_conflicts' : '',
    scores.patchReadiness < 60 ? 'workbench.validate_frontmatter' : '',
    toStringArray(idea.candidateMutations).includes('edit_order') ? 'workbench.validate_order' : '',
  ], MAX_LIST);
}

function normalizeRankingDimensions(input: unknown): RankingDimensions {
  const dimensionsRecord = recordOf(recordOf(input)?.dimensions) ?? recordOf(recordOf(input)?.rubric);
  return {
    feasibility: { weight: numberField(recordOf(dimensionsRecord?.feasibility), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.feasibility.weight },
    impact: { weight: numberField(recordOf(dimensionsRecord?.impact), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.impact.weight },
    novelty: { weight: numberField(recordOf(dimensionsRecord?.novelty), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.novelty.weight },
    patchReadiness: { weight: numberField(recordOf(dimensionsRecord?.patchReadiness), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.patchReadiness.weight },
    risk: { weight: numberField(recordOf(dimensionsRecord?.risk), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.risk.weight },
    tokenCost: { weight: numberField(recordOf(dimensionsRecord?.tokenCost), 'weight') ?? DEFAULT_RANKING_DIMENSIONS.tokenCost.weight },
  };
}

function buildSixHats(idea: Idea, risks: readonly AdvisoryRisk[]): CritiquePerspective[] {
  return [
    perspective('white', 'White hat', 'available facts and missing evidence', [`Evidence count: ${idea.evidence.length}.`, `Assumption count: ${idea.assumptions.length}.`], ['Verify supplied evidence links before patch planning.'], idea.evidence, idea.assumptions),
    perspective('red', 'Red hat', 'reader/player emotional reaction', [`Concept tone: ${compactText(idea.title)}.`], ['Capture intended emotional beat before implementation.'], [], ['Emotional impact is inferred from idea text, not measured.']),
    perspective('black', 'Black hat', 'risk and failure modes', risks.map((risk) => risk.message), ['Mitigate warning/error risks with analyze queries before preview tools.'], risks.flatMap((risk) => risk.evidence), risks.flatMap((risk) => risk.assumptions)),
    perspective('yellow', 'Yellow hat', 'benefits and upside', [`Potential upside: ${compactText(idea.summary)}.`], ['Preserve the strongest user-facing benefit when reducing scope.'], idea.evidence, ['Benefit is advisory until tested in workspace context.']),
    perspective('green', 'Green hat', 'alternatives and variants', variantDiagnostics(idea), ['Create a lower-risk variant if patch readiness is low.'], [], ['Variants are brainstorming suggestions only.']),
    perspective('blue', 'Blue hat', 'process and next action', ['Do not approve or reject automatically.', 'Keep ranking/critique separate from patch planning.'], ['Run rank_ideas, red_team_concept, then preview impact if still promising.'], [], ['Process recommendation is advisory, not a decision gate.']),
  ];
}

function buildRedTeamVectors(idea: Idea, risks: readonly AdvisoryRisk[]): CritiquePerspective[] {
  return [
    perspective('evidence-gap', 'Evidence gap', 'unsupported claims or missing analyze/wiki/graph signals', evidenceGapDiagnostics(idea), ['Add or verify evidence before turning this into a patch plan.'], idea.evidence, idea.assumptions),
    perspective('source-safety', 'Source safety', 'ways the concept could accidentally mutate or destabilize source artifacts', risks.map((risk) => risk.message), ['Keep all writes in later Workbench apply tools; this tool stays read-only.'], risks.flatMap((risk) => risk.evidence), risks.flatMap((risk) => risk.assumptions)),
    perspective('token-budget', 'Token budget', 'ways the concept could inflate prompt or lorebook token cost', [`Estimated token-cost dimension: ${dimensionScoresForIdea(idea).tokenCost}.`], ['Query token budget before expanding prose or prompt chains.'], idea.evidence.filter((entry) => entry.includes('token')), ['Token cost is estimated from supplied idea text only.']),
    perspective('integration', 'Integration conflict', 'composition/order/variable-flow conflict potential', integrationDiagnostics(idea), ['Validate order/frontmatter/composition before any patch preview.'], idea.evidence, ['Integration risk is advisory until analyze tools verify it.']),
  ];
}

function perspective(
  id: string,
  label: string,
  focus: string,
  diagnostics: readonly string[],
  recommendations: readonly string[],
  evidence: readonly string[],
  assumptions: readonly string[],
): CritiquePerspective {
  return {
    assumptions: compactStringList(assumptions, MAX_LIST),
    diagnostics: compactStringList(diagnostics.length > 0 ? diagnostics : ['No specific issue found in supplied data.'], MAX_LIST),
    evidence: compactStringList(evidence, MAX_LIST),
    focus,
    id,
    label,
    recommendations: compactStringList(recommendations, MAX_LIST),
  };
}

function advisoryRisksForIdea(idea: Idea): AdvisoryRisk[] {
  const scores = dimensionScoresForIdea(idea);
  const risks: AdvisoryRisk[] = [];
  if (idea.evidence.length === 0) {
    risks.push(risk('evidence', 'warning', 'No analyzer/wiki/graph evidence was supplied for this idea.', [], ['Caller may have supplied a creative hypothesis without source context.']));
  }
  if (scores.risk >= 50) {
    risks.push(risk('implementation-risk', 'warning', 'Risk dimension is elevated; validate source safety before patch planning.', idea.evidence, idea.assumptions));
  }
  if (scores.tokenCost >= 50) {
    risks.push(risk('token-cost', 'warning', 'Token-cost dimension is elevated; query token budget before expanding this idea.', idea.evidence.filter((entry) => entry.includes('token')), ['Token cost is estimated from supplied text length/keywords.']));
  }
  if (scores.patchReadiness < 35) {
    risks.push(risk('patch-readiness', 'info', 'Patch readiness is low, but this is advisory and does not reject the idea.', [], ['Task 8 keeps patchReadiness independent from novelty and impact.']));
  }
  return risks;
}

function risk(category: string, severity: AdvisoryRisk['severity'], message: string, evidence: readonly string[], assumptions: readonly string[]): AdvisoryRisk {
  return {
    assumptions: compactStringList(assumptions, MAX_LIST),
    category,
    evidence: compactStringList(evidence, MAX_LIST),
    id: `risk:${stableSlug(category)}:${shortHash(message)}`,
    message,
    severity,
  };
}

function recommendationList(idea: Idea | undefined, risks: readonly AdvisoryRisk[]): string[] {
  if (!idea) return ['Supply an idea or ideaId with a matching supplied idea graph/session payload.'];
  return compactStringList([
    risks.length > 0 ? 'Treat risks as advisory diagnostics; do not approve or reject automatically.' : 'Proceed to ranking/impact preview only if the caller chooses to continue.',
    idea.evidence.length === 0 ? 'Gather analyze/wiki/graph evidence before any patch plan.' : 'Keep evidence links attached to later previews.',
    'Use gated Task 11+ patch planning tools for any source artifact write.',
  ], MAX_LIST);
}

function clusterIdeas(ideas: readonly Idea[], sessionId: string): IdeaCluster[] {
  const sortedIdeas = [...ideas].sort((left, right) => left.id.localeCompare(right.id));
  const assigned = new Set<string>();
  const clusters: IdeaCluster[] = [];
  for (const idea of sortedIdeas) {
    if (assigned.has(idea.id)) continue;
    const related = sortedIdeas.filter((candidate) => !assigned.has(candidate.id) && (candidate.id === idea.id || similarity(idea, candidate) >= CLUSTER_THRESHOLD));
    for (const candidate of related) assigned.add(candidate.id);
    const representative = [...related].sort((left, right) => right.evidence.length - left.evidence.length || left.id.localeCompare(right.id))[0] ?? idea;
    const sharedSignals = sharedTokens(related);
    clusters.push({
      assumptions: ['Clusters are lexical advisory groups from supplied ideas only; no persisted session graph was loaded.'],
      evidence: compactStringList(related.flatMap((candidate) => candidate.evidence), MAX_LIST),
      id: `cluster:${shortHash(`${sessionId}:${related.map((candidate) => candidate.id).join('|')}`)}`,
      ideaIds: related.map((candidate) => candidate.id),
      representativeIdeaId: representative.id,
      sharedSignals,
    });
  }
  return clusters;
}

function duplicateCandidates(ideas: readonly Idea[]): DuplicateIdeaCandidate[] {
  const sortedIdeas = [...ideas].sort((left, right) => left.id.localeCompare(right.id));
  const candidates: DuplicateIdeaCandidate[] = [];
  const used = new Set<string>();
  for (const idea of sortedIdeas) {
    if (used.has(idea.id)) continue;
    const duplicates = sortedIdeas
      .filter((candidate) => candidate.id !== idea.id && !used.has(candidate.id))
      .map((candidate) => ({ idea: candidate, similarity: similarity(idea, candidate) }))
      .filter((candidate) => candidate.similarity >= DUPLICATE_THRESHOLD)
      .sort((left, right) => right.similarity - left.similarity || left.idea.id.localeCompare(right.idea.id));
    if (duplicates.length === 0) continue;
    for (const duplicate of duplicates) used.add(duplicate.idea.id);
    const primary = [idea, ...duplicates.map((duplicate) => duplicate.idea)]
      .sort((left, right) => right.evidence.length - left.evidence.length || left.id.localeCompare(right.id))[0] ?? idea;
    candidates.push({
      assumptions: ['Deduplication is advisory; caller must review before removing or merging any idea.'],
      duplicateIdeaIds: duplicates.map((duplicate) => duplicate.idea.id).filter((id) => id !== primary.id),
      evidence: compactStringList([idea, ...duplicates.map((duplicate) => duplicate.idea)].flatMap((candidate) => candidate.evidence), MAX_LIST),
      id: `dedupe:${shortHash(`${idea.id}:${duplicates.map((duplicate) => duplicate.idea.id).join('|')}`)}`,
      primaryIdeaId: primary.id,
      recommendation: 'Review these ideas as possible near-duplicates; do not delete or merge automatically.',
      similarity: round2(Math.max(...duplicates.map((duplicate) => duplicate.similarity))),
    });
  }
  return candidates;
}

function searchIdeas(ideas: readonly Idea[], query: string): IdeaGraphMatch[] {
  const queryTokens = tokenSet(query);
  return ideas
    .map((idea) => {
      const fields: string[] = [];
      const haystacks: Array<[string, string]> = [
        ['title', idea.title],
        ['summary', idea.summary],
        ['evidence', idea.evidence.join(' ')],
        ['assumptions', idea.assumptions.join(' ')],
      ];
      const ideaTokens = tokenSet(`${idea.title} ${idea.summary} ${idea.evidence.join(' ')} ${idea.assumptions.join(' ')}`);
      for (const [field, value] of haystacks) {
        if (query.trim().length === 0 || value.toLowerCase().includes(query.toLowerCase()) || intersects(tokenSet(value), queryTokens)) fields.push(field);
      }
      const score = query.trim().length === 0 ? 1 : round2(jaccard(queryTokens, ideaTokens) + fields.length * 0.2);
      return { fields, idea, score };
    })
    .filter((entry) => entry.fields.length > 0)
    .sort((left, right) => right.score - left.score || left.idea.id.localeCompare(right.idea.id))
    .slice(0, 10)
    .map((entry) => ({
      assumptions: entry.idea.assumptions,
      evidence: entry.idea.evidence,
      idea: entry.idea,
      ideaId: entry.idea.id,
      matchedFields: entry.fields,
      score: entry.score,
    }));
}

function normalizeGraph(input: unknown): IdeaGraph {
  const record = recordOf(input) ?? {};
  const graphRecord = recordOf(record.graph) ?? recordOf(record.ideaGraph) ?? recordOf(record.session);
  return {
    ideas: normalizeIdeas(input),
    relations: normalizeRelations(firstDefined(record.relations, graphRecord?.relations, graphRecord?.edges)),
  };
}

function normalizeRelations(value: unknown): IdeaRelation[] {
  return toArray(value).map((entry) => {
    const relation = recordOf(entry);
    const from = firstString(relation?.from, relation?.source, relation?.sourceId);
    const to = firstString(relation?.to, relation?.target, relation?.targetId);
    const kind = firstString(relation?.kind, relation?.type) as IdeaRelationKind | undefined;
    if (!from || !to || !kind || !RELATION_KINDS.has(kind)) return undefined;
    return { from, kind, to };
  }).filter((entry): entry is IdeaRelation => Boolean(entry));
}

function normalizeIdeas(input: unknown): Idea[] {
  const record = recordOf(input) ?? {};
  const session = recordOf(record.session);
  const graph = recordOf(record.graph) ?? recordOf(record.ideaGraph);
  const candidates = [
    ...toArray(record.ideas),
    ...toArray(graph?.ideas),
    ...toArray(session?.ideas),
    ...toArray(record.items),
    ...(recordOf(record.idea) ? [record.idea] : []),
  ];
  const seen = new Set<string>();
  const ideas: Idea[] = [];
  for (const candidate of candidates) {
    const idea = normalizeIdea(candidate, ideas.length);
    if (!idea || seen.has(idea.id)) continue;
    seen.add(idea.id);
    ideas.push(idea);
  }
  const requestedIds = new Set(toStringArray(record.ideaIds));
  return requestedIds.size > 0 ? ideas.filter((idea) => requestedIds.has(idea.id)) : ideas;
}

function normalizeIdea(value: unknown, index: number): Idea | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const title = firstString(record.title, record.name, record.id, `Idea ${index + 1}`);
  if (!title) return undefined;
  const summary = firstString(record.summary, record.description, record.whyUseful, title) ?? title;
  const id = stableSlug(firstString(record.id, `idea:${shortHash(`${title}:${summary}:${index}`)}`) ?? `idea:${index + 1}`);
  const idea: NormalizedIdeaWithScores = createIdea({
    assumptions: compactStringList(toStringArray(record.assumptions), MAX_LIST),
    candidateMutations: compactStringList(toStringArray(record.candidateMutations), MAX_LIST),
    evidence: compactStringList(toStringArray(record.evidence), MAX_LIST),
    id,
    nextActions: compactStringList(toStringArray(record.nextActions), MAX_LIST),
    ranking: normalizeIdeaRanking(record.ranking),
    summary: compactText(summary),
    title: compactText(title),
  });
  const scores = recordOf(record.scores);
  const dimensionScores = recordOf(record.dimensionScores);
  const rankingDimensionScores = recordOf(recordOf(record.ranking)?.dimensionScores);
  if (scores) idea.suppliedScores = scores;
  if (dimensionScores) idea.suppliedDimensionScores = dimensionScores;
  if (rankingDimensionScores) idea.suppliedRankingDimensionScores = rankingDimensionScores;
  return idea;
}

function normalizeIdeaRanking(value: unknown): IdeaRanking | undefined {
  const record = recordOf(value);
  const score = numberField(record, 'score');
  const mutationReadiness = firstString(record?.mutationReadiness) as MutationReadinessLevel | undefined;
  if (score === undefined && mutationReadiness === undefined) return undefined;
  return {
    mutationReadiness: mutationReadiness ?? 'needs-validation',
    requiredValidation: compactStringList(toStringArray(record?.requiredValidation), MAX_LIST),
    score: score ?? 0,
  };
}

function selectIdea(input: unknown): Idea | undefined {
  const ideas = normalizeIdeas(input);
  const requested = firstString(recordOf(input)?.ideaId, recordOf(recordOf(input)?.idea)?.id);
  return requested ? ideas.find((idea) => idea.id === requested) ?? normalizeIdea(recordOf(input)?.idea, 0) : ideas[0];
}

function selectedIdeaId(input: unknown, fallback: Idea | undefined): string {
  return stableSlug(firstString(recordOf(input)?.ideaId, fallback?.id, 'idea:missing') ?? 'idea:missing');
}

function suppliedIdeasDiagnostics(tool: RankingCritiqueToolName, ideas: readonly Idea[]): WorkbenchDiagnostic[] {
  if (ideas.length > 0) return [];
  return [{
    category: 'creative-ranking',
    id: 'CREATIVE_IDEAS_NOT_SUPPLIED',
    message: `${tool} requires caller-supplied ideas/session graph data; returning an empty read-only result without loading persisted sessions.`,
    path: null,
    ruleId: 'creative.ideas.supplied-data-only',
    severity: 'warning',
  }];
}

function suppliedGraphDiagnostics(tool: RankingCritiqueToolName): WorkbenchDiagnostic[] {
  return [{
    category: 'creative-graph',
    id: 'CREATIVE_IDEA_GRAPH_NOT_SUPPLIED',
    message: `${tool} received no supplied idea graph data; returning stable empty results without loading persisted sessions.`,
    path: null,
    ruleId: 'creative.graph.supplied-data-only',
    severity: 'warning',
  }];
}

function sparseIdeaDiagnostics(tool: RankingCritiqueToolName, idea: Idea): WorkbenchDiagnostic[] {
  if (idea.evidence.length > 0) return [];
  return [{
    category: 'creative-critique',
    id: 'CREATIVE_CRITIQUE_EVIDENCE_SPARSE',
    message: `${tool} received an idea with no evidence links; critique remains advisory and assumption-labeled.`,
    path: null,
    ruleId: 'creative.critique.evidence-sparse',
    severity: 'warning',
  }];
}

function missingIdeaDiagnostics(tool: RankingCritiqueToolName, ideaId: string): WorkbenchDiagnostic[] {
  return [{
    category: 'creative-critique',
    id: 'CREATIVE_IDEA_NOT_SUPPLIED',
    message: `${tool} could not find idea ${ideaId} in supplied data; returning stable advisory empty result without throwing.`,
    path: null,
    ruleId: 'creative.idea.supplied-data-only',
    severity: 'warning',
  }];
}

function variantDiagnostics(idea: Idea): string[] {
  return compactStringList([
    `Lower-risk variant of ${idea.title}`,
    toStringArray(idea.candidateMutations).length > 0 ? 'Try validation-only prototype before source mutation.' : 'Add concrete validation steps before implementation.',
  ], MAX_LIST);
}

function evidenceGapDiagnostics(idea: Idea): string[] {
  if (idea.evidence.length > 0) return [`Supplied evidence: ${idea.evidence.slice(0, 3).join(', ')}`];
  return ['No supplied evidence links; analyzer/wiki/graph grounding is missing.'];
}

function integrationDiagnostics(idea: Idea): string[] {
  const mutations = toStringArray(idea.candidateMutations);
  return compactStringList([
    mutations.includes('edit_order') ? 'Order changes can affect prompt/lorebook activation order.' : '',
    mutations.includes('edit_frontmatter') ? 'Frontmatter changes require schema and round-trip validation.' : '',
    mutations.includes('create_artifact') ? 'New artifacts require canonical path and metadata validation.' : '',
    mutations.length === 0 ? 'No candidate mutation labels supplied; integration path is unclear.' : '',
  ], MAX_LIST);
}

function sessionIdFor(input: unknown, ideas: readonly Idea[], toolName: RankingCritiqueToolName): string {
  const record = recordOf(input);
  const supplied = firstString(record?.sessionId, recordOf(record?.session)?.sessionId);
  if (supplied) return stableSlug(supplied);
  return `creative-session:${shortHash(`${toolName}:${ideas.map((idea) => idea.id).join('|')}`)}`;
}

function similarity(left: Idea, right: Idea): number {
  if (left.id === right.id) return 1;
  const titleExact = normalizeComparable(left.title) === normalizeComparable(right.title);
  const textSimilarity = jaccard(tokenSet(`${left.title} ${left.summary}`), tokenSet(`${right.title} ${right.summary}`));
  return round2(Math.max(titleExact ? 0.9 : 0, textSimilarity));
}

function sharedTokens(ideas: readonly Idea[]): string[] {
  if (ideas.length === 0) return [];
  const [first, ...rest] = ideas.map((idea) => tokenSet(`${idea.title} ${idea.summary}`));
  const shared = [...first].filter((token) => rest.every((tokens) => tokens.has(token)));
  return compactStringList(shared.length > 0 ? shared : [...first].slice(0, 3), 5);
}

function tokenSet(value: string): Set<string> {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'into', 'from', 'this', 'that', 'idea', 'candidate', 'concept']);
  return new Set(value.toLowerCase().split(/[^a-z0-9:_-]+/).filter((token) => token.length > 2 && !stopWords.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((token) => right.has(token));
}

function containsAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalizeComparable(value: string): string {
  return [...tokenSet(value)].sort().join(' ');
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

function stableSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 1)}…` : normalized;
}

function compactStringList(values: readonly string[], max: number): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0).map(compactText))].slice(0, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : undefined;
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
