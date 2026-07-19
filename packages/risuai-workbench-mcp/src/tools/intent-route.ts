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
import { resolveCompactCanonicalIntent } from '../domain/canonical-intent';
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
  '수정',
  '바꿔',
];

const SCAFFOLD_KEYWORDS = [
  'create',
  'initialize',
  'init',
  'scaffold',
  '새',
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

const EXTRACT_KEYWORDS = [
  'extract',
  'unpack',
  'import',
  'open',
  '추출',
  '풀어',
  '가져오기',
  '내보내기',
];

const EXTRACT_SOURCE_KEYWORDS = ['.risum', '.risup', '.charx', 'risum', 'risup', 'charx'];

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
const RISULUA_RUNTIME_SUBJECT_KEYWORDS = [
  'risulua',
  'lua function',
  'lua runtime',
  'fengari',
  'button action',
  '버튼 액션',
];
const RISULUA_RUNTIME_DEBUG_KEYWORDS = [
  '실행',
  '호출',
  '디버그',
  '재현',
];
const RISULUA_RUNTIME_SMOKE_KEYWORDS = [
  'runtime smoke',
  'smoke test',
  'regression',
  'parity',
  'canonical dist',
  'split runtime',
  'split 후 실행 오류',
  '런타임 회귀',
  '런타임 스모크',
];
const RISULUA_SPLIT_RUNTIME_KEYWORDS = [
  'split runtime',
  'split 후 실행 오류',
];
const LARGE_RUNTIME_INPUT_KEYWORDS = [
  'very large',
  'large file',
  'big file',
  '128 kib',
  '큰 파일',
  '대용량',
  '파일이 커',
];
const ORDER_KEYWORDS = ['_order.json', 'order', 'reorder', '순서'];
const FRONTMATTER_KEYWORDS = ['frontmatter', 'yaml', 'metadata header', 'meta field', '프론트매터'];
const WIKI_KEYWORDS = ['wiki', 'refresh wiki', 'update wiki'];
const DOCS_KEYWORDS = ['docs', 'documentation', '문서', '가이드'];
const AUTHORING_SKILL_KEYWORDS = [
  'authoring skill',
  'skill',
  'design a new',
  'build a new',
  'create a system',
  'feature boundary',
  'artifact role',
  'artifact roles',
  'state flow',
  'structured output',
  'button loop',
  'choice protocol',
  '새 시스템',
  '새 모듈',
  '제작',
  '설계',
];
const VALIDATE_KEYWORDS = ['validate', 'validation', 'verify', 'check', '검증', '확인'];
const INSPECT_KEYWORDS = ['inspect', 'review', 'look at', 'check', 'examine', '봐줘', '확인'];

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
  'cbs',
  'when',
  'condition',
  '조건',
  'getvar',
  'setvar',
  'addvar',
  'tempvar',
  'pick',
  'roll',
  'random',
  'makearray',
  'makedict',
  'slot',
  'pure_display',
  '#each',
  '#func',
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
const PRESET_DOMAIN_KEYWORDS = ['preset', '프리셋'];
const REGEX_DOMAIN_KEYWORDS = ['regex', 'regexp', '정규식', 'presetregex', 'customscripts', '충돌'];
const TEXT_DOMAIN_KEYWORDS = [
  'risutext',
  '.risutext',
  'first_mes',
  '첫 메시지',
  '첫메시지',
  '본문',
];

interface FileAffordancePolicy {
  readonly id: string;
  readonly patterns: readonly string[];
  readonly domainTags: readonly string[];
  readonly recommendedActions: readonly string[];
  readonly routingSignals: readonly string[];
}

const FILE_AFFORDANCE_POLICIES: readonly FileAffordancePolicy[] = [
  {
    id: 'root-marker',
    patterns: ['.risuchar', '.risumodule'],
    domainTags: ['root-marker'],
    recommendedActions: ['inspect.path', 'validate.root_markers'],
    routingSignals: ['file_affordance:root-marker'],
  },
  {
    id: 'risulua',
    patterns: ['.risulua'],
    domainTags: ['risulua'],
    recommendedActions: [
      'analyze.query_lua_analysis',
      'analyze.query_lua_call_graph',
      'analyze.query_lua_state_access',
      'analyze.query_risulua_api',
    ],
    routingSignals: ['file_affordance:risulua'],
  },
  {
    id: 'cbs',
    patterns: ['.risulorebook', '.risuregex'],
    domainTags: ['cbs'],
    recommendedActions: [
      'validate.cbs_syntax',
      'analyze.query_cbs_usage',
      'analyze.query_variable_flow',
    ],
    routingSignals: ['file_affordance:cbs'],
  },
  {
    id: 'prompt-chain',
    patterns: ['.risuprompt'],
    domainTags: ['prompt-chain', 'cbs'],
    recommendedActions: [
      'analyze.query_prompt_chain',
      'validate.cbs_syntax',
      'analyze.query_cbs_usage',
    ],
    routingSignals: ['file_affordance:prompt-chain'],
  },
  {
    id: 'html-artifact',
    patterns: ['.risuhtml'],
    domainTags: ['text'],
    recommendedActions: ['inspect.path', 'validate.path'],
    routingSignals: ['file_affordance:html'],
  },
  {
    id: 'order',
    patterns: ['_order.json'],
    domainTags: ['order'],
    recommendedActions: ['validate.order', 'patch.suggest_order'],
    routingSignals: ['file_affordance:order'],
  },
  {
    id: 'variable-artifact',
    patterns: ['.risuvar'],
    domainTags: ['text'],
    recommendedActions: ['inspect.path', 'validate.path', 'analyze.query_variable_flow'],
    routingSignals: ['file_affordance:variable'],
  },
  {
    id: 'canonical-artifact',
    patterns: ['.risutoggle', '.risutext'],
    domainTags: ['text'],
    recommendedActions: ['inspect.path', 'validate.path'],
    routingSignals: ['file_affordance:canonical-artifact'],
  },
];

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

const INSPECT_TOOLS: readonly string[] = ['workbench.inspect_path', 'workbench.inspect_artifact'];

const VALIDATE_TOOLS: readonly string[] = [
  'workbench.validate_artifact',
  'workbench.validate_path',
  'workbench.validate_order',
  'workbench.validate_root_markers',
  'workbench.validate_metadata',
  'workbench.validate_frontmatter',
];

const DOCS_TOOLS: readonly string[] = ['workbench.search_wiki'];

const WIKI_PREVIEW_TOOLS: readonly string[] = ['workbench.plan_wiki_update', 'workbench.diff_wiki'];

const CREATIVE_PREVIEW_TOOLS: readonly string[] = [
  'workbench.creative.turn_idea_into_plan',
  'workbench.creative.turn_idea_into_patch_plan',
  'workbench.creative.preview_idea_patch',
  'workbench.creative.red_team_concept',
];

const CREATIVE_APPLY_TOOLS: readonly string[] = ['workbench.creative.apply_idea_patch'];

const PATCH_APPLY_TOOLS: readonly string[] = ['workbench.apply_patch_plan'];

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

function detectFileAffordancePolicies(text: string): readonly FileAffordancePolicy[] {
  return FILE_AFFORDANCE_POLICIES.filter((policy) =>
    policy.patterns.some((pattern) => text.includes(pattern)),
  );
}

function fileAffordanceDomainTags(text: string): readonly string[] {
  return uniqueStable(detectFileAffordancePolicies(text).flatMap((policy) => policy.domainTags));
}

function fileAffordanceRecommendedActions(text: string): readonly string[] {
  return uniqueStable(
    detectFileAffordancePolicies(text).flatMap((policy) => policy.recommendedActions),
  );
}

function fileAffordanceRoutingSignals(text: string): readonly string[] {
  return uniqueStable(
    detectFileAffordancePolicies(text).flatMap((policy) => policy.routingSignals),
  );
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
  addIf('preset', PRESET_DOMAIN_KEYWORDS);
  addIf('regex', REGEX_DOMAIN_KEYWORDS);
  addIf('text', TEXT_DOMAIN_KEYWORDS);

  // Path-based and content-based CBS detection
  if (!tags.includes('cbs')) {
    if (hasCbsFileSuffix(text) || hasCbsCurlyBraceSyntax(text)) {
      tags.push('cbs');
    }
  }

  tags.push(...fileAffordanceDomainTags(text));

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
    recommendedActions?: readonly string[];
    discouragedTools?: readonly string[];
    blockedTools?: readonly string[];
    domainTags?: readonly string[];
    routingSignals?: readonly string[];
    mutationMode?: RouteMutationMode;
  },
): IntentRouteResult {
  const domainTags = overrides.domainTags ?? [];
  const routeText = `${input.request} ${input.target ?? ''} ${input.context ?? ''}`.toLowerCase();
  const routingSignals = uniqueStable([
    ...(overrides.routingSignals ?? []),
    ...fileAffordanceRoutingSignals(routeText),
  ]);
  const finalRoutingSignals =
    domainTags.includes('cbs') && !routingSignals.includes('cbs_authoring')
      ? [...routingSignals, 'cbs_authoring']
      : routingSignals;

  const intent = overrides.intent;
  const capabilities = intentToCapabilities(intent);
  const baseRecommendedActions = intentToRecommendedActions(intent);
  const recommendedActions = uniqueStable([
    ...baseRecommendedActions,
    ...fileAffordanceRecommendedActions(routeText),
    ...(overrides.recommendedActions ?? []),
  ]).slice(0, 8);
  const nextTool = intentToNextTool(intent);
  const nextInput = intentToNextInput(intent, input);
  const facadeRecommendedTools = intentToFacadeRecommendedTools(intent);

  const canonical = resolveCompactCanonicalIntent({
    context: input.context,
    recommendedActions,
    request: input.request,
    target: input.target,
  });

  return createIntentRouteResult({
    allowedTools: overrides.allowedTools ?? [],
    blockedTools: overrides.blockedTools ?? [],
    capabilities,
    canonical,
    commitAllowed: overrides.commitAllowed,
    confidence: overrides.confidence,
    discouragedTools: filterImplemented(overrides.discouragedTools ?? []),
    domainTags,
    explanation: overrides.explanation,
    intent,
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
    nextInput,
    nextStep: overrides.nextStep,
    nextTool,
    recommendedActions,
    recommendedTools: uniqueStable(facadeRecommendedTools),
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

function withoutTools(names: readonly string[], excluded: readonly string[]): readonly string[] {
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
// Facade-oriented field mappings (Phase 8)
// ---------------------------------------------------------------------------

const FACADE_TOOLS = {
  catalog: 'workbench.catalog',
  prepareAction: 'workbench.prepare_action',
  runAction: 'workbench.run_action',
  context: 'workbench.context',
  patchPreview: 'workbench.patch_preview',
  patchApply: 'workbench.patch_apply',
} as const;

function intentToCapabilities(intent: WorkbenchIntent): readonly string[] {
  switch (intent) {
    case 'workspace.inspect':
    case 'artifact.inspect':
      return ['inspect'];
    case 'artifact.validate':
      return ['validate'];
    case 'artifact.patch.preview':
      return ['patch.preview'];
    case 'artifact.patch.apply':
      return ['patch.apply'];
    case 'artifact.frontmatter.preview':
      return ['patch.preview'];
    case 'artifact.order.preview':
      return ['patch.preview'];
    case 'wiki.refresh.preview':
      return ['wiki'];
    case 'core.scaffold.preview':
      return [];
    case 'core.extract.preview':
      return ['mutation.direct'];
    case 'analyze.variable_flow':
    case 'analyze.lua_handler':
      return ['analyze'];
    case 'risulua_runtime_debug':
    case 'risulua_runtime_smoke':
      return ['risulua.runtime'];
    case 'creative.idea_to_patch':
      return ['creative.ideation', 'creative.context'];
    case 'creative.apply_patch':
      return ['creative.apply'];
    case 'docs.update':
      return ['skills'];
    case 'unknown':
    default:
      return [];
  }
}

function intentToRecommendedActions(intent: WorkbenchIntent): readonly string[] {
  switch (intent) {
    case 'workspace.inspect':
    case 'artifact.inspect':
      return ['inspect.path', 'inspect.artifact'];
    case 'artifact.validate':
      return ['validate.artifact', 'validate.path'];
    case 'artifact.patch.preview':
      return [
        'patch.suggest',
        'patch.suggest_order',
        'patch.suggest_frontmatter',
        'patch.suggest_root_marker',
      ];
    case 'artifact.patch.apply':
      return ['patch.apply'];
    case 'artifact.frontmatter.preview':
      return ['patch.suggest_frontmatter'];
    case 'artifact.order.preview':
      return ['patch.suggest_order'];
    case 'wiki.refresh.preview':
      return ['wiki.search', 'wiki.refresh'];
    case 'core.scaffold.preview':
      return [];
    case 'core.extract.preview':
      return ['core.run_extract'];
    case 'analyze.variable_flow':
      return ['analyze.query_variable_flow', 'analyze.query_variable'];
    case 'analyze.lua_handler':
      return [
        'analyze.query_lua_analysis',
        'analyze.query_lua_call_graph',
        'analyze.query_lua_state_access',
        'analyze.query_risulua_api',
      ];
    case 'risulua_runtime_debug':
      return ['analyze.query_lua_analysis', 'risulua.debug_call'];
    case 'risulua_runtime_smoke':
      return [
        'analyze.query_lua_analysis',
        'risulua.debug_call',
        'risulua.runtime_smoke',
      ];
    case 'creative.idea_to_patch':
      return [
        'creative.gather_context',
        'creative.brainstorm_scamper',
        'creative.critique_six_hats',
      ];
    case 'creative.apply_patch':
      return ['creative.apply_idea_patch'];
    case 'docs.update':
      return ['skills.list', 'skills.recommend', 'skills.apply'];
    case 'unknown':
    default:
      return [];
  }
}

function intentToNextTool(intent: WorkbenchIntent): string {
  switch (intent) {
    case 'artifact.patch.apply':
    case 'creative.apply_patch':
      return FACADE_TOOLS.patchApply;
    default:
      return FACADE_TOOLS.catalog;
  }
}

function intentToNextInput(
  intent: WorkbenchIntent,
  input: IntentRouteInput,
): Record<string, unknown> {
  switch (intent) {
    case 'artifact.patch.apply':
      return { patchPlanId: input.patchPlanId ?? '' };
    case 'creative.apply_patch':
      return { patchPlanId: input.ideaId ?? '' };
    case 'workspace.inspect':
    case 'artifact.inspect':
      return { capability: 'inspect', limit: 5 };
    case 'artifact.validate':
      return { capability: 'validate', limit: 5 };
    case 'artifact.patch.preview':
    case 'artifact.frontmatter.preview':
    case 'artifact.order.preview':
      return { capability: 'patch.preview', limit: 5 };
    case 'wiki.refresh.preview':
      return { capability: 'wiki', limit: 5 };
    case 'core.scaffold.preview':
      return { query: 'scaffold', limit: 5 };
    case 'core.extract.preview':
      return { capability: 'mutation.direct', query: 'extract', limit: 5 };
    case 'analyze.variable_flow':
    case 'analyze.lua_handler':
      return { capability: 'analyze', limit: 5 };
    case 'risulua_runtime_debug':
    case 'risulua_runtime_smoke':
      return { capability: 'risulua.runtime', limit: 5 };
    case 'creative.idea_to_patch':
      return { capability: 'creative.ideation', limit: 5 };
    case 'docs.update':
      return { capability: 'skills', limit: 5 };
    case 'unknown':
    default:
      return { limit: 5 };
  }
}

function intentToFacadeRecommendedTools(intent: WorkbenchIntent): readonly string[] {
  switch (intent) {
    case 'artifact.patch.apply':
    case 'creative.apply_patch':
      return [FACADE_TOOLS.patchApply, FACADE_TOOLS.catalog];
    case 'artifact.patch.preview':
    case 'artifact.frontmatter.preview':
    case 'artifact.order.preview':
      return [
        FACADE_TOOLS.patchPreview,
        FACADE_TOOLS.catalog,
        FACADE_TOOLS.prepareAction,
        FACADE_TOOLS.runAction,
      ];
    case 'creative.idea_to_patch':
      return [
        FACADE_TOOLS.catalog,
        FACADE_TOOLS.context,
        FACADE_TOOLS.prepareAction,
        FACADE_TOOLS.runAction,
      ];
    case 'unknown':
      return [FACADE_TOOLS.catalog];
    case 'core.extract.preview':
      return [FACADE_TOOLS.catalog, FACADE_TOOLS.prepareAction, FACADE_TOOLS.runAction];
    case 'risulua_runtime_debug':
    case 'risulua_runtime_smoke':
      return [
        FACADE_TOOLS.catalog,
        FACADE_TOOLS.context,
        FACADE_TOOLS.prepareAction,
        FACADE_TOOLS.runAction,
      ];
    default:
      return [FACADE_TOOLS.catalog, FACADE_TOOLS.prepareAction, FACADE_TOOLS.runAction];
  }
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
    const isApplyRoute =
      route.intent === 'artifact.patch.apply' || route.intent === 'creative.apply_patch';
    if (!isApplyRoute && mutationMode !== 'guarded_direct') {
      commitAllowed = false;
      blockedTools = unionSets([blockedTools, MUTATION_TOOLS]);
      allowedTools = differenceSets(allowedTools, MUTATION_TOOLS);
      recommendedTools = differenceSets(recommendedTools, MUTATION_TOOLS);
      discouragedTools = unionSets([discouragedTools, MUTATION_TOOLS]);
      mutationMode = 'preview_required';
      if (!routingSignals.includes('mutation_requested')) {
        routingSignals = [...routingSignals, 'mutation_requested'];
      }

      const needsPreview = !constraints.hasPreviewEvidence;
      if (needsPreview && !stopConditions.includes('preview_required')) {
        stopConditions = [...stopConditions, 'preview_required'];
      }
    }
  }

  // Sanitize facade recommendedTools: remove patch preview/apply when read-only
  const facadeMutationTools = new Set<string>([FACADE_TOOLS.patchPreview, FACADE_TOOLS.patchApply]);
  const sanitizedRecommendedTools = constraints.forceReadOnly
    ? recommendedTools.filter((t) => !facadeMutationTools.has(t))
    : recommendedTools;

  return createIntentRouteResult({
    allowedTools: filterImplemented(allowedTools),
    blockedTools: filterImplemented(blockedTools),
    capabilities: route.capabilities,
    canonical: route.canonical,
    commitAllowed,
    confidence: route.confidence,
    discouragedTools: filterImplemented(
      withoutTools(discouragedTools, unionSets([blockedTools, sanitizedRecommendedTools])),
    ),
    domainTags: route.domainTags,
    explanation: route.explanation,
    intent: route.intent,
    missingInputs: route.missingInputs,
    mutationMode,
    mutationRequested: route.mutationRequested,
    nextInput: route.nextInput,
    nextStep: route.nextStep,
    nextTool: route.nextTool,
    recommendedActions: route.recommendedActions,
    recommendedTools: uniqueStable(sanitizedRecommendedTools),
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
    const allowed = unionSets([READ_ONLY_TOOLS, PATCH_APPLY_TOOLS]);
    const blocked = differenceSets(MUTATION_TOOLS, PATCH_APPLY_TOOLS);

    return buildRouteResult(input, {
      intent: 'artifact.patch.apply',
      nextStep: 'apply',
      confidence: 0.95,
      risk: 'write_modify',
      targetKind: 'patch_plan',
      mutationRequested: true,
      commitAllowed: true,
      stopConditions: [],
      explanation: `Patch plan ${input.patchPlanId} ready for apply.`,
      allowedTools: filterImplemented(allowed),
      blockedTools: filterImplemented(blocked),
      domainTags: constraints.domainTags,
    });
  }

  // Rule 4: ideaId + apply/commit language
  if (input.ideaId && hasKeyword(text, APPLY_COMMIT_KEYWORDS)) {
    const allowed = unionSets([READ_ONLY_TOOLS, CREATIVE_APPLY_TOOLS]);
    const blocked = differenceSets(MUTATION_TOOLS, CREATIVE_APPLY_TOOLS);

    return buildRouteResult(input, {
      intent: 'creative.apply_patch',
      nextStep: 'apply',
      confidence: 0.92,
      risk: 'write_modify',
      targetKind: 'idea',
      mutationRequested: true,
      commitAllowed: true,
      stopConditions: [],
      explanation: `Idea ${input.ideaId} ready for apply.`,
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

  // Rule 5.5: authoring skill candidate language
  if (!constraints.hasMutationLanguage && hasKeyword(text, AUTHORING_SKILL_KEYWORDS)) {
    return buildRouteResult(input, {
      intent: 'docs.update',
      nextStep: 'read_resource',
      confidence: 0.8,
      risk: 'read_only',
      targetKind: 'documentation',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation:
        'Authoring-oriented request detected. Recommend the LLM-assisted authoring skill selection workflow before planning.',
      allowedTools: filterImplemented(
        unionSets([
          READ_ONLY_TOOLS,
          DOCS_TOOLS,
          ['workbench.recommend_skills', 'workbench.apply_skill'],
        ]),
      ),
      recommendedTools: limitRecommended(['workbench.recommend_skills']),
      blockedTools: filterImplemented(MUTATION_TOOLS),
      domainTags: constraints.domainTags,
      requiredEvidence: [
        'skill catalog resource risuai-workbench://skills/index',
        'LLM-selected skill id and reason',
        'explicit user approval before workbench.apply_skill',
      ],
      routingSignals: [
        'authoring_skill_candidate',
        'approval_required',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
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

  // Rule 6.5: explicit RisuLua/Fengari execution, debugging, smoke, or parity language.
  // This must precede the generic Lua analysis rule below.
  const runtimeSubjectRequested = hasKeyword(text, RISULUA_RUNTIME_SUBJECT_KEYWORDS);
  const runtimeSmokeRequested = hasKeyword(text, RISULUA_RUNTIME_SMOKE_KEYWORDS)
    && (runtimeSubjectRequested || hasKeyword(text, RISULUA_SPLIT_RUNTIME_KEYWORDS));
  const hasEnglishRuntimeDebugVerb = /\b(?:execute|run|debug|reproduce)\b/u.test(text)
    || (/\bcall\b/u.test(text) && !/\bcall graph\b/u.test(text));
  const runtimeDebugRequested = runtimeSubjectRequested
    && (hasEnglishRuntimeDebugVerb || hasKeyword(text, RISULUA_RUNTIME_DEBUG_KEYWORDS));
  if (runtimeSmokeRequested || runtimeDebugRequested) {
    const intent: WorkbenchIntent = runtimeSmokeRequested
      ? 'risulua_runtime_smoke'
      : 'risulua_runtime_debug';
    const largeInput = hasKeyword(text, LARGE_RUNTIME_INPUT_KEYWORDS);
    const buttonAction = text.includes('button action') || text.includes('버튼 액션');
    return buildRouteResult(input, {
      intent,
      nextStep: 'execute',
      confidence: runtimeSmokeRequested ? 0.93 : 0.9,
      risk: 'read_only',
      targetKind: 'lua_runtime',
      mutationRequested: false,
      commitAllowed: false,
      stopConditions: [],
      explanation: buttonAction
        ? 'RisuLua runtime debugging request detected. Prepare risulua.debug_call with the button-action host profile.'
        : largeInput
          ? 'RisuLua runtime execution request detected. Put source larger than 128 KiB in workbench.context before prepare_action and run_action.'
          : 'RisuLua runtime execution request detected. Use the isolated Fengari runtime actions.',
      allowedTools: filterImplemented(READ_ONLY_TOOLS),
      blockedTools: filterImplemented(MUTATION_TOOLS),
      domainTags: uniqueStable([...constraints.domainTags, 'risulua', 'lua-runtime']),
      routingSignals: [
        runtimeSmokeRequested ? 'risulua_runtime:smoke' : 'risulua_runtime:debug',
        ...(largeInput ? ['large_input:context_required'] : []),
        ...(buttonAction ? ['host_profile:button-action'] : []),
      ],
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
      recommendedTools: limitRecommended(
        unionSets([
          [
            'workbench.query_risulua_api',
            'workbench.explain_risulua_runtime_api',
            'workbench.query_lua_analysis',
            'workbench.query_lua_call_graph',
            'workbench.query_lua_state_access',
          ],
          domainRecommendedTools(constraints.domainTags),
        ]),
      ),
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
      stopConditions: ['preview_required'],
      explanation:
        'New project scaffold request detected. Preview risu-core scaffold output first.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, ['workbench.run_scaffold']])),
      recommendedTools: limitRecommended(['workbench.run_scaffold']),
      blockedTools: filterImplemented(differenceSets(MUTATION_TOOLS, ['workbench.run_scaffold'])),
      domainTags: constraints.domainTags,
      routingSignals: [
        'scaffold',
        'preview_required',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
    });
  }

  // Rule 7.6: extract/unpack/import language with source file-type signal
  const extractSourceText = `${text} ${input.target ?? ''}`;
  if (
    hasKeyword(text, EXTRACT_KEYWORDS) &&
    hasKeyword(extractSourceText, EXTRACT_SOURCE_KEYWORDS)
  ) {
    const hasTarget = Boolean(input.target);
    const hasSourceSignal = hasKeyword(extractSourceText, EXTRACT_SOURCE_KEYWORDS);
    const missingSourcePath = !hasTarget && !hasSourceSignal;

    return buildRouteResult(input, {
      intent: 'core.extract.preview',
      nextStep: 'apply',
      confidence: 0.9,
      risk: 'external_process',
      targetKind: hasTarget ? 'path' : 'workspace',
      mutationRequested: true,
      commitAllowed: true,
      mutationMode: 'guarded_direct',
      stopConditions: missingSourcePath ? ['missing_target'] : [],
      missingInputs: missingSourcePath ? ['sourcePath'] : [],
      explanation:
        'Extract or import request for RisuAI archive detected. Use facade catalog/prepare_action/run_action to route to core.run_extract. Do not call legacy workbench.run_extract in default MCP mode.',
      allowedTools: filterImplemented(
        unionSets([
          READ_ONLY_TOOLS,
          [FACADE_TOOLS.catalog, FACADE_TOOLS.prepareAction, FACADE_TOOLS.runAction],
        ]),
      ),
      recommendedTools: [FACADE_TOOLS.catalog, FACADE_TOOLS.prepareAction, FACADE_TOOLS.runAction],
      blockedTools: [],
      domainTags: constraints.domainTags,
      routingSignals: [
        'extract',
        'external_process',
        'facade_action:core.run_extract',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
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
      explanation:
        'Explicit structured order edit detected. A guarded direct order mutation tool is appropriate, subject to validation and safety gate.',
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
      discouragedTools: filterImplemented(['workbench.edit_order', 'workbench.apply_patch_plan']),
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
      explanation:
        'Explicit frontmatter field/value edit detected. A guarded direct mutation tool is appropriate, subject to its own validation and safety gate.',
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
      blockedTools: filterImplemented(
        differenceSets(MUTATION_TOOLS, ['workbench.edit_frontmatter']),
      ),
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
  if (
    hasKeyword(text, FRONTMATTER_KEYWORDS) &&
    !(input.target && hasKeyword(text, INSPECT_KEYWORDS))
  ) {
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
      routingSignals: [
        'preview',
        'frontmatter',
        ...constraints.domainTags.map((tag) => `domain:${tag}`),
      ],
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
  if (
    !mutationNeedsPreview &&
    hasKeyword(text, DOCS_KEYWORDS) &&
    !constraints.hasMutationLanguage
  ) {
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
      recommendedTools: limitRecommended(
        unionSets([VALIDATE_TOOLS, domainRecommendedTools(constraints.domainTags)]),
      ),
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
        ...(constraints.domainTags.includes('frontmatter')
          ? ['workbench.validate_frontmatter']
          : []),
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
      stopConditions: ['preview_required'],
      explanation:
        'Mutation language detected without preview evidence; preview required before commit.',
      allowedTools: filterImplemented(unionSets([READ_ONLY_TOOLS, PREVIEW_TOOLS])),
      blockedTools: filterImplemented(MUTATION_TOOLS),
      domainTags: constraints.domainTags,
      recommendedTools: limitRecommended(
        unionSets([
          constraints.domainTags.includes('risulua')
            ? ['workbench.query_lua_analysis', 'workbench.query_lua_state_access']
            : [],
          constraints.hasReadSignals ? ['workbench.inspect_path', 'workbench.validate_path'] : [],
          ['workbench.suggest_patch'],
          domainRecommendedTools(constraints.domainTags),
        ]),
      ),
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
