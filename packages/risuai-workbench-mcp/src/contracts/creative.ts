/**
 * Creative contract types, envelope helpers, ranking dimensions, error codes,
 * and session schema validation for the RisuAI Workbench MCP creative surface.
 * @file packages/risuai-workbench-mcp/src/contracts/creative.ts
 */

import type { AffectedFile, PatchOperation } from './patch-plan';

// ---------------------------------------------------------------------------
// Schema markers & version
// ---------------------------------------------------------------------------

export const CREATIVE_SCHEMA_VERSION = '0.2.0' as const;

export type CreativeSchemaMarker =
  | 'risuai-workbench-mcp.creative.context'
  | 'risuai-workbench-mcp.creative.ideation'
  | 'risuai-workbench-mcp.creative.idea-patch'
  | 'risuai-workbench-mcp.creative.implementation-plan'
  | 'risuai-workbench-mcp.creative.apply-result'
  | 'risuai-workbench-mcp.creative.impact-preview'
  | 'risuai-workbench-mcp.creative.analyze-critique'
  | 'risuai-workbench-mcp.creative.session';

// ---------------------------------------------------------------------------
// Creative error codes
// ---------------------------------------------------------------------------

export type CreativeErrorCode =
  | 'CREATIVE_SESSION_SCHEMA_UNSUPPORTED'
  | 'CREATIVE_SESSION_NOT_FOUND'
  | 'CREATIVE_WORKSPACE_MISMATCH'
  | 'CREATIVE_IDEA_NOT_FOUND'
  | 'CREATIVE_PATCH_PLAN_NOT_FOUND'
  | 'CREATIVE_PATCH_PLAN_INVALID'
  | 'CREATIVE_POLICY_DENIED'
  | 'CREATIVE_IDEA_ALREADY_APPLIED'
  | 'CREATIVE_METHOD_NOT_FOUND';

// ---------------------------------------------------------------------------
// Ideation context — what the creative tool operates on
// ---------------------------------------------------------------------------

export interface IdeationContext {
  /** Workspace-relative root for scope. */
  workspaceRoot: string;
  /** Artifact paths the ideation targets. */
  targetArtifacts: readonly string[];
  /** Optional method hint (e.g. 'scamper', 'six-hats'). */
  method?: string;
}

// ---------------------------------------------------------------------------
// Creative context envelope — gather_context / inspect_context result
// ---------------------------------------------------------------------------

export type CreativeContextEnvelopeStatus = 'ok' | 'domain_warning' | 'domain_error' | 'not_implemented';

export interface ContextCard {
  id: string;
  kind: string;
  title: string;
  whyUseful: string;
  evidence: readonly string[];
}

export interface CreativeContextEnvelope {
  schema: 'risuai-workbench-mcp.creative.context';
  schemaVersion: '0.2.0';
  tool: string;
  status: CreativeContextEnvelopeStatus;
  artifactKey: string;
  theme?: string;
  contextCards: readonly ContextCard[];
  resourceLinks: readonly string[];
}

/**
 * createCreativeContextEnvelope helper.
 */
export function createCreativeContextEnvelope(input: {
  tool: string;
  status: CreativeContextEnvelopeStatus;
  artifactKey: string;
  theme?: string;
  contextCards: readonly ContextCard[];
  resourceLinks: readonly string[];
}): CreativeContextEnvelope {
  return {
    artifactKey: input.artifactKey,
    contextCards: input.contextCards,
    resourceLinks: input.resourceLinks,
    schema: 'risuai-workbench-mcp.creative.context',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    status: input.status,
    theme: input.theme,
    tool: input.tool,
  };
}

// ---------------------------------------------------------------------------
// Idea — a single creative idea with explicit evidence/assumption separation
// ---------------------------------------------------------------------------

export interface Idea {
  id: string;
  title: string;
  summary: string;
  /** Evidence from analyze/wiki/graph — not LLM-generated. */
  evidence: readonly string[];
  /** Creative assumptions made by the LLM. */
  assumptions: readonly string[];
  /** Tool kinds this idea might require if applied. */
  candidateMutations?: readonly string[];
  /** Next-action tool names for further exploration. */
  nextActions?: readonly string[];
  ranking?: IdeaRanking;
}

/**
 * createIdea helper.
 * Ensures evidence and assumptions are always present as arrays.
 */
export function createIdea(input: {
  id: string;
  title: string;
  summary: string;
  evidence: readonly string[];
  assumptions: readonly string[];
  candidateMutations?: readonly string[];
  nextActions?: readonly string[];
  ranking?: IdeaRanking;
}): Idea {
  return {
    assumptions: input.assumptions,
    candidateMutations: input.candidateMutations,
    evidence: input.evidence,
    id: input.id,
    nextActions: input.nextActions,
    ranking: input.ranking,
    summary: input.summary,
    title: input.title,
  };
}

// ---------------------------------------------------------------------------
// Idea graph — relationships between ideas
// ---------------------------------------------------------------------------

export type IdeaRelationKind = 'complements' | 'contradicts' | 'depends-on' | 'refines' | 'alternatives';

export interface IdeaRelation {
  from: string;
  to: string;
  kind: IdeaRelationKind;
}

export interface IdeaGraph {
  ideas: readonly Idea[];
  relations: readonly IdeaRelation[];
}

// ---------------------------------------------------------------------------
// Ranking dimensions
// ---------------------------------------------------------------------------

export interface RankingDimension {
  weight: number;
}

export interface RankingDimensions {
  impact: RankingDimension;
  feasibility: RankingDimension;
  novelty: RankingDimension;
  risk: RankingDimension;
  tokenCost: RankingDimension;
  /** Patch-readiness is its own dimension — does not replace others. */
  patchReadiness: RankingDimension;
}

export const DEFAULT_RANKING_DIMENSIONS: RankingDimensions = {
  feasibility: { weight: 0.25 },
  impact: { weight: 0.30 },
  novelty: { weight: 0.20 },
  patchReadiness: { weight: 0.05 },
  risk: { weight: -0.15 },
  tokenCost: { weight: -0.10 },
};

export type MutationReadinessLevel =
  | 'not-ready'
  | 'needs-validation'
  | 'ready-with-validation'
  | 'ready';

export interface IdeaRanking {
  score: number;
  mutationReadiness: MutationReadinessLevel;
  requiredValidation?: readonly string[];
}

// ---------------------------------------------------------------------------
// Ideation envelope — brainstorm / diverge tool result
// ---------------------------------------------------------------------------

export type IdeationEnvelopeStatus = 'ok' | 'domain_warning' | 'domain_error' | 'not_implemented';

export interface CreativeSessionRef {
  sessionId: string;
  mode: 'mutation-capable' | 'preview-only';
  persistentMemoryWritten: boolean;
  sourceArtifactWritten: boolean;
}

export interface IdeationMethodRef {
  id: string;
  resourceUri: string;
}

export interface IdeationEnvelope {
  schema: 'risuai-workbench-mcp.creative.ideation';
  schemaVersion: '0.2.0';
  tool: string;
  status: IdeationEnvelopeStatus;
  session: CreativeSessionRef;
  method?: IdeationMethodRef;
  ideas: readonly Idea[];
}

/**
 * createIdeationEnvelope helper.
 * Constructs a valid ideation envelope with stable schema markers.
 */
export function createIdeationEnvelope(input: {
  tool: string;
  status: IdeationEnvelopeStatus;
  session: CreativeSessionRef;
  method?: IdeationMethodRef;
  ideas: readonly Idea[];
}): IdeationEnvelope {
  return {
    ideas: input.ideas,
    method: input.method,
    schema: 'risuai-workbench-mcp.creative.ideation',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    session: input.session,
    status: input.status,
    tool: input.tool,
  };
}

// ---------------------------------------------------------------------------
// Idea patch envelope — turn_idea_into_patch_plan result
// ---------------------------------------------------------------------------

export type IdeaPatchEnvelopeStatus = 'preview-created' | 'domain_error' | 'not_implemented';

export interface IdeaMutationTarget {
  touchesSourceArtifacts: boolean;
  touchesGeneratedOnly: boolean;
  affectedFiles: readonly string[];
}

export interface PreApplyValidation {
  required: readonly string[];
}

export interface IdeaPatchEnvelope {
  schema: 'risuai-workbench-mcp.creative.idea-patch';
  schemaVersion: '0.2.0';
  tool: string;
  status: IdeaPatchEnvelopeStatus;
  ideaId: string;
  patchPlanId: string;
  patchPlanResource: string;
  affectedFiles: readonly string[];
  operationKinds: readonly PatchOperation['kind'][];
  mutationTarget: IdeaMutationTarget;
  preApplyValidation: PreApplyValidation;
  resourceLinks: readonly string[];
}

/**
 * createIdeaPatchEnvelope helper.
 */
export function createIdeaPatchEnvelope(input: {
  tool: string;
  status: IdeaPatchEnvelopeStatus;
  ideaId: string;
  patchPlanId: string;
  patchPlanResource?: string;
  affectedFiles?: readonly string[];
  operationKinds?: readonly PatchOperation['kind'][];
  mutationTarget: IdeaMutationTarget;
  preApplyValidation: PreApplyValidation;
  resourceLinks: readonly string[];
}): IdeaPatchEnvelope {
  const patchPlanResource = input.patchPlanResource ?? input.resourceLinks[0] ?? '';
  return {
    affectedFiles: input.affectedFiles ?? input.mutationTarget.affectedFiles,
    ideaId: input.ideaId,
    mutationTarget: input.mutationTarget,
    operationKinds: input.operationKinds ?? [],
    patchPlanId: input.patchPlanId,
    patchPlanResource,
    preApplyValidation: input.preApplyValidation,
    resourceLinks: input.resourceLinks,
    schema: 'risuai-workbench-mcp.creative.idea-patch',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    status: input.status,
    tool: input.tool,
  };
}

// ---------------------------------------------------------------------------
// Creative impact preview — preview_creative_impact result
// ---------------------------------------------------------------------------

export type ImpactPreviewStatus = 'ok' | 'domain_warning' | 'domain_error' | 'not_implemented';

export interface AnalyzeImpactSummary {
  variables: readonly string[];
  tokenDeltaEstimate: string;
  compositionRisk: string;
  promptChainRisk: string;
}

export interface AffectedGraphPreview {
  resourceUri: string;
  nodeCount: number;
  edgeCount: number;
}

export interface PatchPreviewRef {
  available: boolean;
  resourceUri?: string;
}

export interface CreativeImpactPreviewEnvelope {
  schema: 'risuai-workbench-mcp.creative.impact-preview';
  schemaVersion: '0.2.0';
  tool: string;
  status: ImpactPreviewStatus;
  ideaId: string;
  summary: string;
  wikiConstraints: readonly string[];
  analyzeImpact: AnalyzeImpactSummary;
  affectedGraph?: AffectedGraphPreview;
  patchPreview: PatchPreviewRef;
  nextActions: readonly string[];
}

/**
 * createCreativeImpactPreviewEnvelope helper.
 */
export function createCreativeImpactPreviewEnvelope(input: {
  tool: string;
  status: ImpactPreviewStatus;
  ideaId: string;
  summary: string;
  wikiConstraints: readonly string[];
  analyzeImpact: AnalyzeImpactSummary;
  affectedGraph?: AffectedGraphPreview;
  patchPreview: PatchPreviewRef;
  nextActions: readonly string[];
}): CreativeImpactPreviewEnvelope {
  return {
    affectedGraph: input.affectedGraph,
    analyzeImpact: input.analyzeImpact,
    ideaId: input.ideaId,
    nextActions: input.nextActions,
    patchPreview: input.patchPreview,
    schema: 'risuai-workbench-mcp.creative.impact-preview',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    status: input.status,
    summary: input.summary,
    tool: input.tool,
    wikiConstraints: input.wikiConstraints,
  };
}

// ---------------------------------------------------------------------------
// Creative analyze-critique — critique_idea_with_analyze result
// ---------------------------------------------------------------------------

export type AnalyzeCritiqueStatus = 'ok' | 'domain_warning' | 'domain_error' | 'not_implemented';

export interface CritiqueRisk {
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  evidence: readonly string[];
}

export interface CreativeAnalyzeCritiqueEnvelope {
  schema: 'risuai-workbench-mcp.creative.analyze-critique';
  schemaVersion: '0.2.0';
  tool: string;
  status: AnalyzeCritiqueStatus;
  ideaId: string;
  risks: readonly CritiqueRisk[];
  safeToPrototype: boolean;
  requiredValidation: readonly string[];
}

/**
 * createCreativeAnalyzeCritiqueEnvelope helper.
 */
export function createCreativeAnalyzeCritiqueEnvelope(input: {
  tool: string;
  status: AnalyzeCritiqueStatus;
  ideaId: string;
  risks: readonly CritiqueRisk[];
  safeToPrototype: boolean;
  requiredValidation: readonly string[];
}): CreativeAnalyzeCritiqueEnvelope {
  return {
    ideaId: input.ideaId,
    requiredValidation: input.requiredValidation,
    risks: input.risks,
    safeToPrototype: input.safeToPrototype,
    schema: 'risuai-workbench-mcp.creative.analyze-critique',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    status: input.status,
    tool: input.tool,
  };
}

// ---------------------------------------------------------------------------
// Creative implementation plan — structured plan from selected ideas
// ---------------------------------------------------------------------------

export interface CreativeImplementationPlan {
  schema: 'risuai-workbench-mcp.creative.implementation-plan';
  schemaVersion: '0.2.0';
  planId: string;
  selectedIdeaIds: readonly string[];
  targetChanges: readonly CreativeTargetChange[];
  validationPlan: readonly string[];
  steps: readonly CreativeImplementationStep[];
}

export interface CreativeTargetChange {
  kind: string;
  path?: string;
  orderPath?: string;
  entry?: string;
  artifact?: string;
  stem?: string;
  reason: string;
}

export interface CreativeImplementationStep {
  ideaId: string;
  description: string;
  /** References existing PatchPlan types — does not duplicate the operation schema. */
  operations: readonly Pick<PatchOperation, 'kind'>[];
  affectedFiles: readonly AffectedFile[];
}

/**
 * createCreativeImplementationPlan helper.
 */
export function createCreativeImplementationPlan(input: {
  planId: string;
  selectedIdeaIds: readonly string[];
  targetChanges?: readonly CreativeTargetChange[];
  validationPlan?: readonly string[];
  steps: readonly CreativeImplementationStep[];
}): CreativeImplementationPlan {
  return {
    planId: input.planId,
    schema: 'risuai-workbench-mcp.creative.implementation-plan',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    selectedIdeaIds: input.selectedIdeaIds,
    steps: input.steps,
    targetChanges: input.targetChanges ?? [],
    validationPlan: input.validationPlan ?? [],
  };
}

// ---------------------------------------------------------------------------
// Idea apply result — apply_idea_patch result
// ---------------------------------------------------------------------------

export type IdeaApplyResultStatus = 'applied' | 'rejected' | 'failed' | 'not_implemented';

export interface IdeaApplyResult {
  schema: 'risuai-workbench-mcp.creative.apply-result';
  schemaVersion: '0.2.0';
  tool: string;
  status: IdeaApplyResultStatus;
  ideaId: string;
  patchPlanId: string;
  changedFiles: readonly string[];
  resourceLinks: readonly string[];
}

/**
 * createIdeaApplyResult helper.
 */
export function createIdeaApplyResult(input: {
  tool: string;
  status: IdeaApplyResultStatus;
  ideaId: string;
  patchPlanId: string;
  changedFiles: readonly string[];
  resourceLinks: readonly string[];
}): IdeaApplyResult {
  return {
    changedFiles: input.changedFiles,
    ideaId: input.ideaId,
    patchPlanId: input.patchPlanId,
    resourceLinks: input.resourceLinks,
    schema: 'risuai-workbench-mcp.creative.apply-result',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    status: input.status,
    tool: input.tool,
  };
}

// ---------------------------------------------------------------------------
// Creative session schema
// ---------------------------------------------------------------------------

export const SUPPORTED_CREATIVE_SESSION_SCHEMA_VERSIONS = [CREATIVE_SCHEMA_VERSION] as const;

export type CreativeSessionStatus = 'active' | 'completed' | 'abandoned';

export interface SourceInputRef {
  artifactKey: string;
  theme?: string;
  resourceLinks: readonly string[];
}

export interface PatchPlanRef {
  ideaId: string;
  patchPlanId: string;
  resourceUri: string;
}

export interface CreativeSessionSchema {
  schema: 'risuai-workbench-mcp.creative.session';
  schemaVersion: '0.2.0';
  sessionId: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  sourceInputs: readonly SourceInputRef[];
  ideas: readonly Idea[];
  rankings: Readonly<Record<string, IdeaRanking>>;
  patchPlanRefs: readonly PatchPlanRef[];
  status: CreativeSessionStatus;
}

/**
 * validateCreativeSessionSchema helper.
 * Accepts exactly the supported schema version; rejects all others with
 * a deterministic error code.
 */
export function validateCreativeSessionSchema(
  session: { schemaVersion: string },
): { valid: true } | { valid: false; errorCode: CreativeErrorCode; message: string } {
  if (session.schemaVersion === CREATIVE_SCHEMA_VERSION) {
    return { valid: true };
  }

  return {
    errorCode: 'CREATIVE_SESSION_SCHEMA_UNSUPPORTED',
    message: `Creative session schema version ${session.schemaVersion} is not supported. Supported: ${SUPPORTED_CREATIVE_SESSION_SCHEMA_VERSIONS.join(', ')}.`,
    valid: false,
  };
}

/**
 * createCreativeSession helper.
 */
export function createCreativeSession(input: {
  sessionId: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  sourceInputs: readonly SourceInputRef[];
  ideas: readonly Idea[];
  rankings: Readonly<Record<string, IdeaRanking>>;
  patchPlanRefs: readonly PatchPlanRef[];
  status: CreativeSessionStatus;
}): CreativeSessionSchema {
  return {
    createdAt: input.createdAt,
    ideas: input.ideas,
    patchPlanRefs: input.patchPlanRefs,
    rankings: input.rankings,
    schema: 'risuai-workbench-mcp.creative.session',
    schemaVersion: CREATIVE_SCHEMA_VERSION,
    sessionId: input.sessionId,
    sourceInputs: input.sourceInputs,
    status: input.status,
    title: input.title,
    updatedAt: input.updatedAt,
    workspaceRoot: input.workspaceRoot,
  };
}
