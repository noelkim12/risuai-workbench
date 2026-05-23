/**
 * Deterministic intent route classifier and handler.
 * No LLM calls, no file writes, no mutation helpers.
 * @file packages/risuai-workbench-mcp/src/tools/intent-route.ts
 */

import { createHash } from 'node:crypto';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../contracts/diagnostics';
import {
  createIntentRouteResult,
  type IntentRouteEnvelopeData,
  type IntentRouteInput,
  type IntentRouteResult,
  type RouteNextStep,
  type RouteRisk,
  type RouteStopCondition,
  type TargetKind,
  type WorkbenchIntent,
} from '../contracts/intent-route';
import { WORKBENCH_REGISTRY } from '../registry';

// ---------------------------------------------------------------------------
// Keyword sets for deterministic classification
// ---------------------------------------------------------------------------

const NO_WRITE_KEYWORDS = [
  'do not modify',
  "don't modify",
  'read only',
  'no changes',
  '수정하지',
  '변경하지',
];

const MUTATION_KEYWORDS = [
  'fix',
  'apply',
  'edit',
  'delete',
  'move',
  'commit',
  '고쳐',
  '적용',
  '삭제',
  '이동',
];

const PREVIEW_EVIDENCE_KEYWORDS = [
  'suggest',
  'preview',
  'plan',
  'diff',
  'patch plan',
  'patch preview',
];

const APPLY_COMMIT_KEYWORDS = ['apply', 'commit', 'confirm', '적용'];
const PATCH_PREVIEW_KEYWORDS = ['patch', 'preview', 'diff', 'plan'];
const VARIABLE_FLOW_KEYWORDS = ['variable', 'flow', 'read', 'write'];
const LUA_KEYWORDS = ['lua', 'handler', 'call graph', 'state access', 'risulua'];
const ORDER_KEYWORDS = ['_order.json', 'order', 'reorder', '순서'];
const FRONTMATTER_KEYWORDS = ['frontmatter', 'yaml', 'metadata header', 'meta field', '프론트매터'];
const WIKI_KEYWORDS = ['wiki', 'refresh wiki', 'update wiki'];
const DOCS_KEYWORDS = ['docs', 'documentation', '문서', '가이드'];
const VALIDATE_KEYWORDS = ['validate', 'validation', 'verify', 'check'];
const INSPECT_KEYWORDS = ['inspect', 'review', 'look at', 'check', 'examine'];

// ---------------------------------------------------------------------------
// Registry-derived tool categorization
// ---------------------------------------------------------------------------

const ALL_IMPLEMENTED_TOOLS: readonly string[] = WORKBENCH_REGISTRY.tools
  .filter((t) => t.implementationStatus === 'implemented')
  .map((t) => t.name);

const READ_ONLY_TOOLS: readonly string[] = ALL_IMPLEMENTED_TOOLS.filter((name) => {
  const tool = WORKBENCH_REGISTRY.tools.find((t) => t.name === name);
  return tool && !tool.mutates;
});

const MUTATION_TOOLS: readonly string[] = ALL_IMPLEMENTED_TOOLS.filter((name) => {
  const tool = WORKBENCH_REGISTRY.tools.find((t) => t.name === name);
  return tool && tool.mutates;
});

const PREVIEW_TOOLS: readonly string[] = [
  'workbench.suggest_patch',
  'workbench.suggest_order_patch',
  'workbench.suggest_frontmatter_patch',
  'workbench.suggest_root_marker_patch',
  'workbench.plan_wiki_update',
  'workbench.diff_wiki',
];

const ANALYZE_TOOLS: readonly string[] = [
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
];

const INSPECT_TOOLS: readonly string[] = [
  'workbench.inspect_path',
  'workbench.inspect_artifact',
];

const VALIDATE_TOOLS: readonly string[] = [
  'workbench.validate_artifact',
  'workbench.validate_path',
  'workbench.validate_order',
  'workbench.validate_root_markers',
  'workbench.validate_metadata',
  'workbench.validate_frontmatter',
];

const DOCS_TOOLS: readonly string[] = [
  'workbench.search_wiki',
];

const WIKI_PREVIEW_TOOLS: readonly string[] = [
  'workbench.plan_wiki_update',
  'workbench.diff_wiki',
];

const CREATIVE_PREVIEW_TOOLS: readonly string[] = [
  'workbench.creative.turn_idea_into_plan',
  'workbench.creative.turn_idea_into_patch_plan',
  'workbench.creative.preview_idea_patch',
  'workbench.creative.red_team_concept',
];

const CREATIVE_APPLY_TOOLS: readonly string[] = [
  'workbench.creative.apply_idea_patch',
];

const PATCH_APPLY_TOOLS: readonly string[] = [
  'workbench.apply_patch_plan',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/**
 * Strip literal `workbench.` tool names from text so that substrings
 * inside tool names (e.g. "plan" in `workbench.apply_patch_plan`) do
 * not falsely trigger preview-evidence keyword matches.
 */
function sanitizeToolNames(text: string): string {
  return text.replace(/workbench\.[a-z_]+/g, '');
}

function generateRouteId(input: IntentRouteInput): string {
  const normalized = JSON.stringify({
    context: (input.context ?? '').toLowerCase().trim(),
    ideaId: input.ideaId ?? '',
    patchPlanId: input.patchPlanId ?? '',
    request: (input.request ?? '').toLowerCase().trim(),
    target: (input.target ?? '').toLowerCase().trim(),
    userConfirmed: input.userConfirmed ?? false,
  });
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  return `route_${hash}`;
}

function buildRouteResult(
  input: IntentRouteInput,
  overrides: {
    intent: WorkbenchIntent;
    nextStep: RouteNextStep;
    confidence: number;
    risk: RouteRisk;
    targetKind: TargetKind;
    mutationRequested: boolean;
    commitAllowed: boolean;
    stopConditions: readonly RouteStopCondition[];
    explanation: string;
    missingInputs?: readonly string[];
    requiredEvidence?: readonly string[];
    allowedTools?: readonly string[];
    blockedTools?: readonly string[];
  },
): IntentRouteResult {
  return createIntentRouteResult({
    allowedTools: overrides.allowedTools ?? [],
    blockedTools: overrides.blockedTools ?? [],
    commitAllowed: overrides.commitAllowed,
    confidence: overrides.confidence,
    explanation: overrides.explanation,
    intent: overrides.intent,
    missingInputs: overrides.missingInputs ?? [],
    mutationRequested: overrides.mutationRequested,
    nextStep: overrides.nextStep,
    requiredEvidence: overrides.requiredEvidence ?? [],
    risk: overrides.risk,
    routeId: generateRouteId(input),
    stopConditions: overrides.stopConditions,
    targetKind: overrides.targetKind,
  });
}

function filterImplemented(names: readonly string[]): readonly string[] {
  return names.filter((n) => ALL_IMPLEMENTED_TOOLS.includes(n));
}

function unionSets(sets: readonly (readonly string[])[]): readonly string[] {
  const merged = new Set<string>();
  for (const set of sets) {
    for (const name of set) {
      merged.add(name);
    }
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

function differenceSets(all: readonly string[], remove: readonly string[]): readonly string[] {
  const removeSet = new Set(remove);
  return all.filter((n) => !removeSet.has(n)).sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Constraint application
// ---------------------------------------------------------------------------

interface RouteConstraints {
  readonly forceReadOnly: boolean;
  readonly hasMutationLanguage: boolean;
  readonly hasPreviewEvidence: boolean;
  readonly hasReadSignals: boolean;
}

function applyConstraints(
  route: IntentRouteResult,
  constraints: RouteConstraints,
): IntentRouteResult {
  let { allowedTools, blockedTools, commitAllowed, risk, stopConditions } = route;

  if (constraints.forceReadOnly) {
    risk = 'read_only';
    commitAllowed = false;
    blockedTools = unionSets([blockedTools, MUTATION_TOOLS]);
    allowedTools = differenceSets(allowedTools, MUTATION_TOOLS);
    if (!stopConditions.includes('mutation_tool_blocked')) {
      stopConditions = [...stopConditions, 'mutation_tool_blocked'];
    }
  }

  // Mixed read/write: mutation language present without no-write override.
  // Do not override specific apply routes (artifact.patch.apply / creative.apply_patch)
  // because the classifier already handles their commit logic.
  if (!constraints.forceReadOnly && constraints.hasMutationLanguage) {
    const isApplyRoute = route.intent === 'artifact.patch.apply' || route.intent === 'creative.apply_patch';
    if (!isApplyRoute) {
      commitAllowed = false;
      blockedTools = unionSets([blockedTools, MUTATION_TOOLS]);
      allowedTools = differenceSets(allowedTools, MUTATION_TOOLS);

      const needsPreview = !constraints.hasPreviewEvidence;
      const needsConfirm = true;

      if (needsPreview && !stopConditions.includes('preview_required')) {
        stopConditions = [...stopConditions, 'preview_required'];
      }
      if (needsConfirm && !stopConditions.includes('confirmation_required')) {
        stopConditions = [...stopConditions, 'confirmation_required'];
      }
    }
  }

  return createIntentRouteResult({
    allowedTools: filterImplemented(allowedTools),
    blockedTools: filterImplemented(blockedTools),
    commitAllowed,
    confidence: route.confidence,
    explanation: route.explanation,
    intent: route.intent,
    missingInputs: route.missingInputs,
    mutationRequested: route.mutationRequested,
    nextStep: route.nextStep,
    requiredEvidence: route.requiredEvidence,
    risk,
    routeId: route.routeId,
    stopConditions,
    targetKind: route.targetKind,
  });
}

// ---------------------------------------------------------------------------
// Priority rule classifier
// ---------------------------------------------------------------------------

function classifyIntent(
  input: IntentRouteInput,
  text: string,
  constraints: RouteConstraints,
): IntentRouteResult {
  // Rule 1: empty request — handled before this function is called

  // Rule 3: patchPlanId + apply/commit/confirm language
  if (input.patchPlanId && hasKeyword(text, APPLY_COMMIT_KEYWORDS)) {
    const userConfirmed = input.userConfirmed ?? false;
    const allowed = userConfirmed
      ? unionSets([READ_ONLY_TOOLS, PATCH_APPLY_TOOLS])
      : unionSets([READ_ONLY_TOOLS, PREVIEW_TOOLS]);
    const blocked = userConfirmed
      ? differenceSets(MUTATION_TOOLS, PATCH_APPLY_TOOLS)
      : MUTATION_TOOLS;

    return buildRouteResult(input, {
      intent: 'artifact.patch.apply',
      nextStep: userConfirmed ? 'apply' : 'confirm',
      confidence: 0.95,
      risk: userConfirmed ? 'write_modify' : 'preview_only',
      targetKind: 'patch_plan',
      mutationRequested: true,
      commitAllowed: userConfirmed,
      stopConditions: userConfirmed ? [] : ['confirmation_required'],
      explanation: userConfirmed
        ? `Patch plan ${input.patchPlanId} ready for apply. The mutation safety gate remains authoritative.`
        : `Patch plan ${input.patchPlanId} ready for confirmation.`,
      allowedTools: filterImplemented(allowed),
      blockedTools: filterImplemented(blocked),
    });
  }

  // Rule 4: ideaId + apply/commit language
  if (input.ideaId && hasKeyword(text, APPLY_COMMIT_KEYWORDS)) {
    const userConfirmed = input.userConfirmed ?? false;
    const allowed = userConfirmed
      ? unionSets([READ_ONLY_TOOLS, CREATIVE_APPLY_TOOLS])
      : unionSets([READ_ONLY_TOOLS, CREATIVE_PREVIEW_TOOLS]);
    const blocked = userConfirmed
      ? differenceSets(MUTATION_TOOLS, CREATIVE_APPLY_TOOLS)
      : MUTATION_TOOLS;

    return buildRouteResult(input, {
      intent: 'creative.apply_patch',
      nextStep: userConfirmed ? 'apply' : 'confirm',
      confidence: 0.92,
      risk: userConfirmed ? 'write_modify' : 'preview_only',
      targetKind: 'idea',
      mutationRequested: true,
      commitAllowed: userConfirmed,
      stopConditions: userConfirmed ? [] : ['confirmation_required'],
      explanation: `Idea ${input.ideaId} ready for ${userConfirmed ? 'apply' : 'confirmation'}.`,
      allowedTools: filterImplemented(allowed),
      blockedTools: filterImplemented(blocked),
    });
  }

  // Rule 5: ideaId + patch/preview language
  if (input.ideaId && hasKeyword(text, PATCH_PREVIEW_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'creative.idea_to_patch',
      nextStep: 'preview',
      confidence: 0.88,
      risk: 'preview_only',
      targetKind: 'idea',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: ['preview_required'],
      explanation: `Idea ${input.ideaId} can be turned into a patch plan preview.`,
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, CREATIVE_PREVIEW_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 6: variableName or variable-flow language
  if (input.target && hasKeyword(input.target, VARIABLE_FLOW_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'analyze.variable_flow',
      nextStep: 'analyze',
      confidence: 0.85,
      risk: 'read_only',
      targetKind: 'variable',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Variable flow analysis request detected.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ANALYZE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }
  if (hasKeyword(text, VARIABLE_FLOW_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'analyze.variable_flow',
      nextStep: 'analyze',
      confidence: 0.82,
      risk: 'read_only',
      targetKind: 'variable',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Variable flow language detected in request.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ANALYZE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 7: Lua/handler/call-graph/state-access language
  if (hasKeyword(text, LUA_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'analyze.lua_handler',
      nextStep: 'analyze',
      confidence: 0.84,
      risk: 'read_only',
      targetKind: 'lua_handler',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Lua handler or call graph analysis language detected.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ANALYZE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // When mutation language is present without preview evidence,
  // skip keyword-based read-only routes (rules 8-13) and fall to rule 14.
  const skipReadOnlyRoutes = constraints.hasMutationLanguage && !constraints.hasPreviewEvidence;

  // Rule 8: _order.json, order, reorder, 순서
  if (!skipReadOnlyRoutes && hasKeyword(text, ORDER_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'artifact.order.preview',
      nextStep: 'preview',
      confidence: 0.86,
      risk: 'preview_only',
      targetKind: 'artifact_root',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: ['preview_required'],
      explanation: 'Order or _order.json change preview requested.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, PREVIEW_TOOLS, VALIDATE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 9: frontmatter, yaml, metadata header, meta field, 프론트매터
  if (!skipReadOnlyRoutes && hasKeyword(text, FRONTMATTER_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'artifact.frontmatter.preview',
      nextStep: 'preview',
      confidence: 0.86,
      risk: 'preview_only',
      targetKind: 'artifact_root',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: ['preview_required'],
      explanation: 'Frontmatter or metadata header change preview requested.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, PREVIEW_TOOLS, VALIDATE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 10: wiki, refresh wiki, update wiki
  if (!skipReadOnlyRoutes && hasKeyword(text, WIKI_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'wiki.refresh.preview',
      nextStep: 'preview',
      confidence: 0.85,
      risk: 'preview_only',
      targetKind: 'workspace',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: ['preview_required'],
      explanation: 'Wiki refresh or update preview requested.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, WIKI_PREVIEW_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 11: docs-only language without mutation language
  if (!skipReadOnlyRoutes && hasKeyword(text, DOCS_KEYWORDS) && !constraints.hasMutationLanguage) {
    return buildRouteResult(input, {
      intent: 'docs.update',
      nextStep: 'answer',
      confidence: 0.78,
      risk: 'read_only',
      targetKind: 'documentation',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Documentation or guide update request detected.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, DOCS_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 12: path/target + validate language
  if (!skipReadOnlyRoutes && input.target && hasKeyword(text, VALIDATE_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'artifact.validate',
      nextStep: 'validate',
      confidence: 0.84,
      risk: 'read_only',
      targetKind: 'path',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Validation request for target path detected.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, VALIDATE_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 13: path/target + inspect/review language
  if (!skipReadOnlyRoutes && input.target && hasKeyword(text, INSPECT_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'artifact.inspect',
      nextStep: 'inspect',
      confidence: 0.83,
      risk: 'read_only',
      targetKind: 'path',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: 'Inspection or review request for target path detected.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, INSPECT_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 14: mutation language without preview evidence
  if (constraints.hasMutationLanguage && !constraints.hasPreviewEvidence) {
    return buildRouteResult(input, {
      intent: 'artifact.patch.preview',
      nextStep: 'preview',
      confidence: 0.72,
      risk: 'preview_only',
      targetKind: 'unknown',
      mutationRequested: true,
      commitAllowed: false,
      stopConditions: ['preview_required', 'confirmation_required'],
      explanation: 'Mutation language detected without preview evidence; preview required before commit.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, PREVIEW_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });
  }

  // Rule 15: otherwise → unknown, clarify, low confidence
  return buildRouteResult(input, {
    intent: 'unknown',
    nextStep: 'clarify',
    confidence: 0.3,
    risk: 'read_only',
    targetKind: 'unknown',
    mutationRequested: false,
    commitAllowed: false,
    stopConditions: ['route_low_confidence'],
    explanation: 'Unable to determine intent from request; clarification needed.',
    allowedTools: filterImplemented(READ_ONLY_TOOLS),
    blockedTools: filterImplemented(MUTATION_TOOLS),
  });
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

/**
 * handleRouteIntent 함수.
 * Deterministic, read-only, registry-consistent intent classifier.
 * No LLM calls. No file writes. No mutation helper invocations.
 *
 * @param input - intent route input
 * @returns diagnostic envelope with route data
 */
export async function handleRouteIntent(
  input: IntentRouteInput,
): Promise<DiagnosticEnvelope<IntentRouteEnvelopeData>> {
  // Rule 1: empty request
  if (!input.request || input.request.trim().length === 0) {
    const route = buildRouteResult(input, {
      intent: 'unknown',
      nextStep: 'clarify',
      confidence: 0.0,
      risk: 'read_only',
      targetKind: 'unknown',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: ['missing_request'],
      missingInputs: ['request'],
      explanation: 'Request is empty; cannot determine intent.',
      allowedTools: filterImplemented(READ_ONLY_TOOLS),
      blockedTools: filterImplemented(MUTATION_TOOLS),
    });

    return createDiagnosticEnvelope({
      data: { route },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.route_intent',
    });
  }

  const requestLower = input.request.toLowerCase();
  const contextLower = (input.context ?? '').toLowerCase();
  const targetLower = (input.target ?? '').toLowerCase();
  const combinedText = `${requestLower} ${contextLower} ${targetLower}`;

  const constraints: RouteConstraints = {
    forceReadOnly: hasKeyword(combinedText, NO_WRITE_KEYWORDS),
    hasMutationLanguage: hasKeyword(combinedText, MUTATION_KEYWORDS),
    hasPreviewEvidence: hasKeyword(sanitizeToolNames(combinedText), PREVIEW_EVIDENCE_KEYWORDS),
    hasReadSignals:
      hasKeyword(combinedText, INSPECT_KEYWORDS) ||
      hasKeyword(combinedText, VALIDATE_KEYWORDS) ||
      hasKeyword(combinedText, ['inspect', 'validate', 'analyze', 'query', 'read']),
  };

  const route = classifyIntent(input, combinedText, constraints);
  const constrainedRoute = applyConstraints(route, constraints);

  return createDiagnosticEnvelope({
    data: { route: constrainedRoute },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.route_intent',
  });
}
