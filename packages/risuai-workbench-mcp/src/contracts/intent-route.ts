/**
 * Closed MVP intent route contract for the RisuAI Workbench MCP package.
 * @file packages/risuai-workbench-mcp/src/contracts/intent-route.ts
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Closed MVP unions
// ---------------------------------------------------------------------------

export type WorkbenchIntent =
  | 'workspace.inspect'
  | 'artifact.inspect'
  | 'artifact.validate'
  | 'artifact.patch.preview'
  | 'artifact.patch.apply'
  | 'artifact.frontmatter.preview'
  | 'artifact.order.preview'
  | 'wiki.refresh.preview'
  | 'core.scaffold.preview'
  | 'core.extract.preview'
  | 'analyze.variable_flow'
  | 'analyze.lua_handler'
  | 'risulua_runtime_debug'
  | 'risulua_runtime_smoke'
  | 'creative.idea_to_patch'
  | 'creative.apply_patch'
  | 'docs.update'
  | 'unknown';

export type RouteRisk =
  | 'read_only'
  | 'preview_only'
  | 'write_additive'
  | 'write_modify'
  | 'destructive'
  | 'external_process';

export type TargetKind =
  | 'unknown'
  | 'workspace'
  | 'path'
  | 'artifact_root'
  | 'diagnostic'
  | 'variable'
  | 'lua_handler'
  | 'lua_runtime'
  | 'idea'
  | 'patch_plan'
  | 'documentation';

export type RouteNextStep =
  | 'clarify'
  | 'inspect'
  | 'read_resource'
  | 'validate'
  | 'analyze'
  | 'execute'
  | 'creative_review'
  | 'preview'
  | 'apply'
  | 'post_validate'
  | 'answer';

export type RouteMutationMode =
  | 'none'
  | 'guarded_direct'
  | 'preview_required'
  | 'blocked';

export type RouteStopCondition =
  | 'missing_request'
  | 'missing_target'
  | 'ambiguous_target'
  | 'outside_workspace'
  | 'preview_required'
  | 'patch_plan_required'
  | 'hash_precondition_required'
  | 'blocking_diagnostics'
  | 'mutation_tool_blocked'
  | 'route_low_confidence';

// ---------------------------------------------------------------------------
// Zod schemas for the closed MVP unions
// ---------------------------------------------------------------------------

export const workbenchIntentSchema = z.enum([
  'workspace.inspect',
  'artifact.inspect',
  'artifact.validate',
  'artifact.patch.preview',
  'artifact.patch.apply',
  'artifact.frontmatter.preview',
  'artifact.order.preview',
  'wiki.refresh.preview',
  'core.scaffold.preview',
  'core.extract.preview',
  'analyze.variable_flow',
  'analyze.lua_handler',
  'risulua_runtime_debug',
  'risulua_runtime_smoke',
  'creative.idea_to_patch',
  'creative.apply_patch',
  'docs.update',
  'unknown',
]);

export const routeRiskSchema = z.enum([
  'read_only',
  'preview_only',
  'write_additive',
  'write_modify',
  'destructive',
  'external_process',
]);

export const targetKindSchema = z.enum([
  'unknown',
  'workspace',
  'path',
  'artifact_root',
  'diagnostic',
  'variable',
  'lua_handler',
  'lua_runtime',
  'idea',
  'patch_plan',
  'documentation',
]);

export const routeNextStepSchema = z.enum([
  'clarify',
  'inspect',
  'read_resource',
  'validate',
  'analyze',
  'execute',
  'creative_review',
  'preview',
  'apply',
  'post_validate',
  'answer',
]);

export const routeMutationModeSchema = z.enum([
  'none',
  'guarded_direct',
  'preview_required',
  'blocked',
]);

export const routeStopConditionSchema = z.enum([
  'missing_request',
  'missing_target',
  'ambiguous_target',
  'outside_workspace',
  'preview_required',
  'patch_plan_required',
  'hash_precondition_required',
  'blocking_diagnostics',
  'mutation_tool_blocked',
  'route_low_confidence',
]);

// ---------------------------------------------------------------------------
// Compact canonical intent
// ---------------------------------------------------------------------------

export const canonicalTaskTypeSchema = z.enum([
  'inspect',
  'analyze',
  'create',
  'modify',
  'move',
  'delete',
  'sort',
  'package',
  'validate',
  'design',
  'refactor',
  'unknown',
]);

export const canonicalCandidateSchema = z.object({
  id: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(3).default([]),
}).catchall(z.unknown());

export const canonicalUpstreamFieldSchema = z.object({
  id: z.string(),
  extension: z.string(),
}).catchall(z.unknown());

export const canonicalPathCandidateSchema = z.object({
  path: z.string(),
  reason: z.string(),
}).catchall(z.unknown());

export const compactCanonicalIntentSchema = z.object({
  taskType: canonicalTaskTypeSchema,
  targets: z.array(canonicalCandidateSchema).max(3).default([]),
  extensions: z.array(canonicalCandidateSchema).max(3).default([]),
  upstreamFields: z.array(canonicalUpstreamFieldSchema).max(3).default([]),
  pathCandidates: z.array(canonicalPathCandidateSchema).max(3).default([]),
  contextKinds: z.array(z.string()).max(5).default([]),
  actionIds: z.array(z.string()).max(5).default([]),
  resourceLinks: z.array(z.string()).max(5).default([]),
  truncated: z.boolean().default(false),
}).catchall(z.unknown());

export type CanonicalTaskType = z.infer<typeof canonicalTaskTypeSchema>;
export type CompactCanonicalIntent = z.infer<typeof compactCanonicalIntentSchema>;

// ---------------------------------------------------------------------------
// Intent route input
// ---------------------------------------------------------------------------

export interface IntentRouteInput {
  request: string;
  target?: string;
  context?: string;
  patchPlanId?: string;
  ideaId?: string;
}

export const intentRouteInputSchema = z.object({
  request: z.string(),
  target: z.string().optional(),
  context: z.string().optional(),
  patchPlanId: z.string().optional(),
  ideaId: z.string().optional(),
}).catchall(z.unknown());

// ---------------------------------------------------------------------------
// Intent route result
// ---------------------------------------------------------------------------

export interface IntentRouteResult {
  schema: 'risuai-workbench-mcp.intent-route';
  schemaVersion: '0.1.0';
  routeId: string;
  intent: WorkbenchIntent;
  confidence: number;
  risk: RouteRisk;
  targetKind: TargetKind;
  mutationRequested: boolean;
  commitAllowed: boolean;
  mutationMode: RouteMutationMode;
  nextStep: RouteNextStep;
  allowedTools: readonly string[];
  recommendedTools: readonly string[];
  discouragedTools: readonly string[];
  blockedTools: readonly string[];
  requiredEvidence: readonly string[];
  missingInputs: readonly string[];
  domainTags: readonly string[];
  routingSignals: readonly string[];
  stopConditions: readonly RouteStopCondition[];
  explanation: string;
  capabilities: readonly string[];
  recommendedActions: readonly string[];
  nextTool: string;
  nextInput: Record<string, unknown>;
  canonical?: CompactCanonicalIntent;
}

export const intentRouteResultSchema = z.object({
  schema: z.literal('risuai-workbench-mcp.intent-route'),
  schemaVersion: z.literal('0.1.0'),
  routeId: z.string(),
  intent: workbenchIntentSchema,
  confidence: z.number(),
  risk: routeRiskSchema,
  targetKind: targetKindSchema,
  mutationRequested: z.boolean(),
  commitAllowed: z.boolean(),
  mutationMode: routeMutationModeSchema.default('none'),
  nextStep: routeNextStepSchema,
  allowedTools: z.array(z.string()),
  recommendedTools: z.array(z.string()).default([]),
  discouragedTools: z.array(z.string()).default([]),
  blockedTools: z.array(z.string()),
  requiredEvidence: z.array(z.string()),
  missingInputs: z.array(z.string()),
  domainTags: z.array(z.string()).default([]),
  routingSignals: z.array(z.string()).default([]),
  stopConditions: z.array(routeStopConditionSchema),
  explanation: z.string(),
  capabilities: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  nextTool: z.string().default('workbench.catalog'),
  nextInput: z.record(z.string(), z.unknown()).default({}),
  canonical: compactCanonicalIntentSchema.optional(),
}).catchall(z.unknown());

// ---------------------------------------------------------------------------
// Envelope data — lives inside DiagnosticEnvelope<IntentRouteEnvelopeData>
// ---------------------------------------------------------------------------

export interface IntentRouteEnvelopeData {
  route: IntentRouteResult;
}

export const intentRouteEnvelopeDataSchema = z.object({
  route: intentRouteResultSchema,
}).catchall(z.unknown());

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * createIntentRouteResult 함수.
 * Deterministic route result를 proposal field name 그대로 보존한 값으로 고정함.
 *
 * @param input - route result 생성 입력
 * @returns 변경 없이 정규화된 intent route result
 */
export function createIntentRouteResult(
  input: Omit<IntentRouteResult, 'schema' | 'schemaVersion'>,
): IntentRouteResult {
  return {
    allowedTools: input.allowedTools,
    blockedTools: input.blockedTools,
    capabilities: input.capabilities,
    canonical: input.canonical,
    commitAllowed: input.commitAllowed,
    confidence: input.confidence,
    discouragedTools: input.discouragedTools,
    domainTags: input.domainTags,
    explanation: input.explanation,
    intent: input.intent,
    missingInputs: input.missingInputs,
    mutationMode: input.mutationMode,
    mutationRequested: input.mutationRequested,
    nextInput: input.nextInput,
    nextStep: input.nextStep,
    nextTool: input.nextTool,
    recommendedActions: input.recommendedActions,
    recommendedTools: input.recommendedTools,
    requiredEvidence: input.requiredEvidence,
    risk: input.risk,
    routeId: input.routeId,
    routingSignals: input.routingSignals,
    schema: 'risuai-workbench-mcp.intent-route',
    schemaVersion: '0.1.0',
    stopConditions: input.stopConditions,
    targetKind: input.targetKind,
  };
}
