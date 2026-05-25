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
  type RouteMutationMode,
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

const SCAFFOLD_KEYWORDS = [
  'create',
  'initialize',
  'init',
  'scaffold',
  '새로',
  '생성',
  '스캐폴드',
];

const PROJECT_TYPE_KEYWORDS = [
  'charx',
  'character',
  'module',
  'preset',
  '캐릭터',
  '모듈',
  '프리셋',
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
const LUA_KEYWORDS = [
  'lua',
  'handler',
  'call graph',
  'state access',
  'risulua',
  'host function',
  'host api',
  'runtime api',
  'getstate',
  'setstate',
  'getchatvar',
  'setchatvar',
  'id/async',
  'access rules',
];
const ORDER_KEYWORDS = ['_order.json', 'order', 'reorder', '순서'];
const FRONTMATTER_KEYWORDS = ['frontmatter', 'yaml', 'metadata header', 'meta field', '프론트매터'];
const WIKI_KEYWORDS = ['wiki', 'refresh wiki', 'update wiki'];
const DOCS_KEYWORDS = ['docs', 'documentation', '문서', '가이드'];
const VALIDATE_KEYWORDS = ['validate', 'validation', 'verify', 'check'];
const INSPECT_KEYWORDS = ['inspect', 'review', 'look at', 'check', 'examine'];

const LOREBOOK_DOMAIN_KEYWORDS = ['lorebook', 'risulorebook', '로어북', 'entry', 'entries'];
const CHARACTER_DOMAIN_KEYWORDS = ['risuchar', 'charx', 'character card', '캐릭터', '카드'];
const MODULE_DOMAIN_KEYWORDS = ['risumodule', 'module', '모듈'];
const RISULUA_DOMAIN_KEYWORDS = [
  'risulua',
  '.risulua',
  'lua/main.risulua',
  'host function',
  'host api',
  'runtime api',
  'getstate',
  'setstate',
  'getchatvar',
  'setchatvar',
  'id/async',
];
const CBS_DOMAIN_KEYWORDS = [
  'cbs', 'when', 'condition', '조건',
  'getvar', 'setvar', 'addvar', 'tempvar',
  'pick', 'roll', 'random',
  'makearray', 'makedict',
  'slot', 'pure_display',
  '#each', '#func',
];

const CBS_FILE_SUFFIXES = [
  '.risulorebook',
  '.risuchar',
  '.risumodule',
  '.risuprompt',
  '.risuregex',
];
const PROMPT_CHAIN_DOMAIN_KEYWORDS = ['risuprompt', 'prompt chain', '프롬프트', 'prompt template'];
const ORDER_DOMAIN_KEYWORDS = ['_order.json', 'order', 'reorder', '순서'];

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

const FRONTMATTER_SET_PATTERNS = [
  /\bset\s+(?:frontmatter\s+)?(?:key|field)\s+[a-zA-Z0-9_.-]+\s+to\s+[^\s].+/i,
  /\bchange\s+(?:frontmatter\s+)?(?:key|field)\s+[a-zA-Z0-9_.-]+\s+to\s+[^\s].+/i,
  /(프론트매터|frontmatter).*(필드|키).*(로|으로|=)/i,
];

const ORDER_MOVE_PATTERNS = [
  /\bmove\s+entry\s+[^\s]+\s+(?:before|after)\s+entry\s+[^\s]+/i,
  /\bmove\s+[^\s]+\s+(?:before|after)\s+[^\s]+.*_order\.json/i,
  /\breorder\s+entry\s+[^\s]+\s+(?:before|after)\s+entry\s+[^\s]+/i,
  /(_order\.json).*(before|after|앞|뒤|이전|다음)/i,
];

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasExplicitFrontmatterEdit(text: string): boolean {
  return matchesAnyPattern(text, FRONTMATTER_SET_PATTERNS);
}

function hasExplicitOrderEdit(text: string): boolean {
  return matchesAnyPattern(text, ORDER_MOVE_PATTERNS);
}

function hasCbsFileSuffix(text: string): boolean {
  return CBS_FILE_SUFFIXES.some((suffix) => text.includes(suffix));
}

function hasCbsCurlyBraceSyntax(text: string): boolean {
  return /\{\{[^{}]+\}\}/.test(text);
}

function detectDomainTags(text: string): readonly string[] {
  const tags: string[] = [];
  const addIf = (tag: string, keywords: readonly string[]) => {
    if (hasKeyword(text, keywords)) {
      tags.push(tag);
    }
  };

  addIf('lorebook', LOREBOOK_DOMAIN_KEYWORDS);
  addIf('character', CHARACTER_DOMAIN_KEYWORDS);
  addIf('module', MODULE_DOMAIN_KEYWORDS);
  addIf('risulua', RISULUA_DOMAIN_KEYWORDS);
  addIf('cbs', CBS_DOMAIN_KEYWORDS);
  addIf('prompt-chain', PROMPT_CHAIN_DOMAIN_KEYWORDS);
  addIf('order', ORDER_DOMAIN_KEYWORDS);
  addIf('frontmatter', FRONTMATTER_KEYWORDS);

  // Path-based and content-based CBS detection
  if (!tags.includes('cbs')) {
    if (hasCbsFileSuffix(text) || hasCbsCurlyBraceSyntax(text)) {
      tags.push('cbs');
    }
  }

  return uniqueStable(tags);
}

function inferMutationMode(params: {
  readonly commitAllowed: boolean;
  readonly mutationRequested: boolean;
  readonly risk: RouteRisk;
  readonly stopConditions: readonly RouteStopCondition[];
}): RouteMutationMode {
  if (!params.mutationRequested) return 'none';
  if (params.stopConditions.includes('mutation_tool_blocked')) return 'blocked';
  if (params.stopConditions.includes('preview_required')) return 'preview_required';
  if (params.stopConditions.includes('confirmation_required')) return 'confirmation_required';
  if (params.commitAllowed && params.risk === 'write_modify') return 'guarded_direct';
  return 'preview_required';
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
    recommendedTools?: readonly string[];
    discouragedTools?: readonly string[];
    blockedTools?: readonly string[];
    domainTags?: readonly string[];
    routingSignals?: readonly string[];
    mutationMode?: RouteMutationMode;
  },
): IntentRouteResult {
  const domainTags = overrides.domainTags ?? [];
  const routingSignals = overrides.routingSignals ?? [];
  const finalRoutingSignals = domainTags.includes('cbs') && !routingSignals.includes('cbs_authoring')
    ? [...routingSignals, 'cbs_authoring']
    : routingSignals;

  return createIntentRouteResult({
    allowedTools: overrides.allowedTools ?? [],
    blockedTools: overrides.blockedTools ?? [],
    commitAllowed: overrides.commitAllowed,
    confidence: overrides.confidence,
    discouragedTools: filterImplemented(overrides.discouragedTools ?? []),
    domainTags,
    explanation: overrides.explanation,
    intent: overrides.intent,
    missingInputs: overrides.missingInputs ?? [],
    mutationMode:
      overrides.mutationMode ??
      inferMutationMode({
        commitAllowed: overrides.commitAllowed,
        mutationRequested: overrides.mutationRequested,
        risk: overrides.risk,
        stopConditions: overrides.stopConditions,
      }),
    mutationRequested: overrides.mutationRequested,
    nextStep: overrides.nextStep,
    recommendedTools: limitRecommended(overrides.recommendedTools ?? overrides.allowedTools ?? []),
    requiredEvidence: overrides.requiredEvidence ?? [],
    risk: overrides.risk,
    routeId: generateRouteId(input),
    routingSignals: finalRoutingSignals,
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

function uniqueStable(names: readonly string[]): readonly string[] {
  return Array.from(new Set(names)).filter((name) => name.length > 0);
}

function withoutTools(
  names: readonly string[],
  excluded: readonly string[],
): readonly string[] {
  const excludedSet = new Set(excluded);
  return names.filter((name) => !excludedSet.has(name));
}

function limitRecommended(names: readonly string[]): readonly string[] {
  return filterImplemented(uniqueStable(names)).slice(0, 7);
}

function domainRecommendedTools(domainTags: readonly string[]): readonly string[] {
  const tools: string[] = [];
  if (domainTags.includes('lorebook')) {
    tools.push('workbench.explain_lorebook_prompt_injection');
  }
  if (domainTags.includes('risulua')) {
    tools.push(
      'workbench.query_risulua_api',
      'workbench.query_lua_analysis',
      'workbench.query_lua_call_graph',
      'workbench.query_lua_state_access',
      'workbench.explain_risulua_runtime_api',
      'workbench.explain_risulua_workspace',
    );
  }
  if (domainTags.includes('order')) {
    tools.push('workbench.validate_order', 'workbench.suggest_order_patch');
  }
  if (domainTags.includes('frontmatter')) {
    tools.push('workbench.validate_frontmatter', 'workbench.suggest_frontmatter_patch');
  }
  if (domainTags.includes('prompt-chain')) {
    tools.push('workbench.query_prompt_chain');
  }
  if (domainTags.includes('cbs')) {
    tools.push(
      'workbench.query_variable_flow',
      'workbench.query_relationship_network',
      'workbench.validate_cbs_syntax',
      'workbench.query_cbs_usage',
    );
  }
  return limitRecommended(tools);
}

// ---------------------------------------------------------------------------
// Constraint application
// ---------------------------------------------------------------------------

interface RouteConstraints {
  readonly forceReadOnly: boolean;
  readonly hasMutationLanguage: boolean;
  readonly hasPreviewEvidence: boolean;
  readonly hasReadSignals: boolean;
  readonly domainTags: readonly string[];
}

function applyConstraints(
  route: IntentRouteResult,
  constraints: RouteConstraints,
): IntentRouteResult {
  let {
    allowedTools,
    blockedTools,
    commitAllowed,
    discouragedTools,
    mutationMode,
    recommendedTools,
    risk,
    routingSignals,
    stopConditions,
  } = route;

  if (constraints.forceReadOnly) {
    risk = 'read_only';
    commitAllowed = false;
    mutationMode = 'blocked';
    blockedTools = unionSets([blockedTools, MUTATION_TOOLS]);
    allowedTools = differenceSets(allowedTools, MUTATION_TOOLS);
    recommendedTools = differenceSets(recommendedTools, MUTATION_TOOLS);
    discouragedTools = differenceSets(discouragedTools, MUTATION_TOOLS);
    if (!routingSignals.includes('constraint:no_write')) {
      routingSignals = [...routingSignals, 'constraint:no_write'];
    }
    if (!stopConditions.includes('mutation_tool_blocked')) {
      stopConditions = [...stopConditions, 'mutation_tool_blocked'];
    }
  }

  // Mixed read/write: mutation language present without no-write override.
  // Do not override specific apply routes (artifact.patch.apply / creative.apply_patch)
  // because the classifier already handles their commit logic.
  if (!constraints.forceReadOnly && constraints.hasMutationLanguage) {
    const isApplyRoute = route.intent === 'artifact.patch.apply' || route.intent === 'creative.apply_patch';
    if (!isApplyRoute && mutationMode !== 'guarded_direct') {
      commitAllowed = false;
      blockedTools = unionSets([blockedTools, MUTATION_TOOLS]);
      allowedTools = differenceSets(allowedTools, MUTATION_TOOLS);
      recommendedTools = differenceSets(recommendedTools, MUTATION_TOOLS);
      discouragedTools = unionSets([discouragedTools, MUTATION_TOOLS]);
      mutationMode = 'preview_required';
      if (!routingSignals.includes('mutation_without_confirmation')) {
        routingSignals = [...routingSignals, 'mutation_without_confirmation'];
      }

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
    discouragedTools: filterImplemented(
      withoutTools(discouragedTools, unionSets([blockedTools, recommendedTools])),
    ),
    domainTags: route.domainTags,
    explanation: route.explanation,
    intent: route.intent,
    missingInputs: route.missingInputs,
    mutationMode,
    mutationRequested: route.mutationRequested,
    nextStep: route.nextStep,
    recommendedTools: filterImplemented(recommendedTools),
    requiredEvidence: route.requiredEvidence,
    risk,
    routeId: route.routeId,
    routingSignals,
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
      domainTags: constraints.domainTags,
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
      domainTags: constraints.domainTags,
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
      domainTags: constraints.domainTags,
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
      domainTags: constraints.domainTags,
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
      domainTags: constraints.domainTags,
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
      domainTags: constraints.domainTags,
      routingSignals: ['analyze', 'lua', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
      recommendedTools: limitRecommended(unionSets([
        [
          'workbench.query_risulua_api',
          'workbench.explain_risulua_runtime_api',
          'workbench.query_lua_analysis',
          'workbench.query_lua_call_graph',
          'workbench.query_lua_state_access',
        ],
        domainRecommendedTools(constraints.domainTags),
      ])),
    });
  }

  // Rule 7.5: scaffold/create project language
  if (hasKeyword(text, SCAFFOLD_KEYWORDS) && hasKeyword(text, PROJECT_TYPE_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'core.scaffold.preview',
      nextStep: 'preview',
      confidence: 0.9,
      risk: 'preview_only',
      targetKind: 'workspace',
      mutationRequested: true,
      commitAllowed: false,
      stopConditions: ['preview_required', 'confirmation_required'],
      explanation: 'New project scaffold request detected. Preview risu-core scaffold output first.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ['workbench.run_scaffold']])),
      recommendedTools: limitRecommended(['workbench.run_scaffold']),
      blockedTools: filterImplemented(differenceSets(MUTATION_TOOLS, ['workbench.run_scaffold'])),
      domainTags: constraints.domainTags,
      routingSignals: ['scaffold', 'preview_required', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
    });
  }

  // When mutation language is present without preview evidence,
  // specific preview routes (rules 8-10) still run, but docs/validate/inspect
  // read-only routes (rules 11-13) are skipped to fall to rule 14.
  const mutationNeedsPreview = constraints.hasMutationLanguage && !constraints.hasPreviewEvidence;

  // Rule 8a: explicit structured order edit → guarded direct
  if (hasKeyword(text, ORDER_KEYWORDS) && hasExplicitOrderEdit(text)) {
    return buildRouteResult(input, {
      intent: 'artifact.order.preview',
      nextStep: 'apply',
      confidence: 0.86,
      risk: 'write_modify',
      targetKind: input.target ? 'path' : 'artifact_root',
      mutationMode: 'guarded_direct',
      mutationRequested: true,
      commitAllowed: false,
      stopConditions: input.target ? [] : ['missing_target'],
      missingInputs: input.target ? [] : ['target'],
      explanation: 'Explicit structured order edit detected. A guarded direct order mutation tool is appropriate, subject to validation and safety gate.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ['workbench.edit_order']])),
      recommendedTools: limitRecommended([
        'workbench.inspect_path',
        'workbench.validate_order',
        'workbench.edit_order',
      ]),
      discouragedTools: filterImplemented([
        'workbench.suggest_patch',
        'workbench.apply_patch_plan',
      ]),
      blockedTools: filterImplemented(differenceSets(MUTATION_TOOLS, ['workbench.edit_order'])),
      requiredEvidence: [
        'resolved _order.json path or canonical directory',
        'explicit source entry',
        'explicit relative destination entry',
        'order validation result',
      ],
      routingSignals: [
        'mutation',
        'direct_structured_edit',
        'order',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
      domainTags: constraints.domainTags,
    });
  }

  // Rule 8: _order.json, order, reorder, 순서
  if (hasKeyword(text, ORDER_KEYWORDS)) {
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
      domainTags: constraints.domainTags,
      recommendedTools: limitRecommended([
        'workbench.inspect_path',
        'workbench.validate_order',
        'workbench.suggest_order_patch',
      ]),
      discouragedTools: filterImplemented([
        'workbench.edit_order',
        'workbench.apply_patch_plan',
      ]),
      requiredEvidence: [
        'resolved _order.json path or canonical directory',
        'current order entries',
        'order validation result before preview',
      ],
      routingSignals: ['preview', 'order', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
    });
  }

  // Rule 9a: explicit frontmatter field/value edit → guarded direct
  if (hasKeyword(text, FRONTMATTER_KEYWORDS) && hasExplicitFrontmatterEdit(text)) {
    return buildRouteResult(input, {
      intent: 'artifact.frontmatter.preview',
      nextStep: 'apply',
      confidence: 0.88,
      risk: 'write_modify',
      targetKind: input.target ? 'path' : 'artifact_root',
      mutationMode: 'guarded_direct',
      mutationRequested: true,
      commitAllowed: false,
      stopConditions: input.target ? [] : ['missing_target'],
      missingInputs: input.target ? [] : ['target'],
      explanation: 'Explicit frontmatter field/value edit detected. A guarded direct mutation tool is appropriate, subject to its own validation and safety gate.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ['workbench.edit_frontmatter']])),
      recommendedTools: limitRecommended([
        'workbench.inspect_path',
        'workbench.validate_frontmatter',
        'workbench.edit_frontmatter',
      ]),
      discouragedTools: filterImplemented([
        'workbench.suggest_patch',
        'workbench.apply_patch_plan',
      ]),
      blockedTools: filterImplemented(differenceSets(MUTATION_TOOLS, ['workbench.edit_frontmatter'])),
      requiredEvidence: [
        'resolved workspace-relative path',
        'explicit frontmatter field name',
        'explicit new value',
        'direct mutation tool validation result',
      ],
      routingSignals: [
        'mutation',
        'direct_structured_edit',
        'frontmatter',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
      domainTags: constraints.domainTags,
    });
  }

  // Rule 9: frontmatter, yaml, metadata header, meta field, 프론트매터
  // When a target is provided alongside inspect language, prefer artifact.inspect (Rule 13).
  if (hasKeyword(text, FRONTMATTER_KEYWORDS) && !(input.target && hasKeyword(text, INSPECT_KEYWORDS))) {
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
      domainTags: constraints.domainTags,
      recommendedTools: limitRecommended([
        'workbench.inspect_path',
        'workbench.validate_frontmatter',
        'workbench.suggest_frontmatter_patch',
      ]),
      discouragedTools: filterImplemented([
        'workbench.edit_frontmatter',
        'workbench.apply_patch_plan',
      ]),
      requiredEvidence: [
        'resolved workspace-relative path',
        'current frontmatter fields',
        'frontmatter validation result before preview',
      ],
      routingSignals: ['preview', 'frontmatter', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
    });
  }

  // Rule 10: wiki, refresh wiki, update wiki
  if (hasKeyword(text, WIKI_KEYWORDS)) {
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
      domainTags: constraints.domainTags,
    });
  }

  // Rule 11: docs-only language without mutation language
  if (!mutationNeedsPreview && hasKeyword(text, DOCS_KEYWORDS) && !constraints.hasMutationLanguage) {
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
      domainTags: constraints.domainTags,
    });
  }

  // Rule 12: path/target + validate language
  if (!mutationNeedsPreview && input.target && hasKeyword(text, VALIDATE_KEYWORDS)) {
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
      domainTags: constraints.domainTags,
      routingSignals: ['validate', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
      recommendedTools: limitRecommended(unionSets([
        VALIDATE_TOOLS,
        domainRecommendedTools(constraints.domainTags),
      ])),
    });
  }

  // Rule 13: path/target + inspect/review language
  if (!mutationNeedsPreview && input.target && hasKeyword(text, INSPECT_KEYWORDS)) {
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
      domainTags: constraints.domainTags,
      routingSignals: ['inspect', ...constraints.domainTags.map((tag) => `domain:${tag}`)],
      recommendedTools: limitRecommended([
        ...INSPECT_TOOLS,
        ...(constraints.domainTags.includes('frontmatter') ? ['workbench.validate_frontmatter'] : []),
        ...domainRecommendedTools(constraints.domainTags),
      ]),
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
      domainTags: constraints.domainTags,
      recommendedTools: limitRecommended(unionSets([
        constraints.domainTags.includes('risulua') ? [
          'workbench.query_lua_analysis',
          'workbench.query_lua_state_access',
        ] : [],
        constraints.hasReadSignals ? ['workbench.inspect_path', 'workbench.validate_path'] : [],
        ['workbench.suggest_patch'],
        domainRecommendedTools(constraints.domainTags),
      ])),
      discouragedTools: filterImplemented([
        'workbench.apply_patch_plan',
        'workbench.edit_order',
        'workbench.edit_frontmatter',
        'workbench.edit_metadata',
      ]),
      requiredEvidence: [
        'resolved workspace-relative target when available',
        'validation or analysis evidence before patch preview',
        'stable patch plan preview before any commit-mode mutation',
      ],
      routingSignals: [
        ...(constraints.hasReadSignals ? ['inspect'] : []),
        ...(constraints.domainTags.includes('risulua') ? ['analyze'] : []),
        'mutation',
        'preview_required',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
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
    domainTags: constraints.domainTags,
    recommendedTools: limitRecommended([
      ...domainRecommendedTools(constraints.domainTags),
      ...READ_ONLY_TOOLS,
    ]),
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
      domainTags: [],
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
  const domainTags = detectDomainTags(combinedText);

  const constraints: RouteConstraints = {
    forceReadOnly: hasKeyword(combinedText, NO_WRITE_KEYWORDS),
    hasMutationLanguage: hasKeyword(combinedText, MUTATION_KEYWORDS),
    hasPreviewEvidence: hasKeyword(sanitizeToolNames(combinedText), PREVIEW_EVIDENCE_KEYWORDS),
    hasReadSignals:
      hasKeyword(combinedText, INSPECT_KEYWORDS) ||
      hasKeyword(combinedText, VALIDATE_KEYWORDS) ||
      hasKeyword(combinedText, ['inspect', 'validate', 'analyze', 'query', 'read']),
    domainTags,
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
