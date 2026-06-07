import type { CompactCanonicalIntent } from '../contracts/intent-route';

const MAX_CANONICAL_CANDIDATES = 3;
const MAX_ACTION_IDS = 5;
const MAX_RESOURCE_LINKS = 5;

interface CandidateDraft {
  id: string;
  confidence: number;
  evidence: string[];
  [key: string]: unknown;
}

const TARGET_KEYWORDS: Array<{ id: string; confidence: number; keywords: readonly string[] }> = [
  { id: 'charx', confidence: 0.88, keywords: ['charx', '.charx', 'character', '캐릭터', '카드'] },
  { id: 'module', confidence: 0.88, keywords: ['module', 'risum', '.risum', 'risumodule', '.risumodule', '모듈'] },
  { id: 'preset', confidence: 0.9, keywords: ['preset', 'risup', '.risup', '프리셋'] },
];

const EXTENSION_KEYWORDS: Array<{ id: string; confidence: number; keywords: readonly string[]; resource: string }> = [
  { id: '.risulorebook', confidence: 0.88, keywords: ['lorebook', '로어북', 'char_book', '_modulelorebook'], resource: 'risuai-workbench://wiki/custom-extension/extensions/lorebook.md' },
  { id: '.risuregex', confidence: 0.92, keywords: ['regex', 'regexp', '정규식', 'customscripts', 'customscript', 'presetregex', '충돌'], resource: 'risuai-workbench://wiki/custom-extension/extensions/regex.md' },
  { id: '.risulua', confidence: 0.9, keywords: ['lua', 'risulua', 'triggerscript', '스크립트'], resource: 'risuai-workbench://wiki/custom-extension/extensions/lua.md' },
  { id: '.risuprompt', confidence: 0.88, keywords: ['prompttemplate', 'prompt template', '프롬프트 템플릿', '프롬프트'], resource: 'risuai-workbench://wiki/custom-extension/extensions/prompt-template.md' },
  { id: '.risutoggle', confidence: 0.86, keywords: ['toggle', '토글', 'custommoduletoggle', 'customprompttemplatetoggle'], resource: 'risuai-workbench://wiki/custom-extension/extensions/toggle.md' },
  { id: '.risuvar', confidence: 0.86, keywords: ['variable', 'variables', 'defaultvariables', '변수'], resource: 'risuai-workbench://wiki/custom-extension/extensions/variable.md' },
  { id: '.risuhtml', confidence: 0.86, keywords: ['html', 'backgroundhtml', 'backgroundembedding', '배경'], resource: 'risuai-workbench://wiki/custom-extension/extensions/html.md' },
  { id: '.risutext', confidence: 0.94, keywords: ['first_mes', 'first message', '첫 메시지', '첫메시지', 'description', 'system_prompt', '본문', 'prose'], resource: 'risuai-workbench://wiki/custom-extension/extensions/text.md' },
];

const UPSTREAM_FIELDS: Array<{ id: string; extension: string; keywords: readonly string[]; path?: string }> = [
  { id: 'first_mes', extension: '.risutext', keywords: ['first_mes', 'first message', '첫 메시지', '첫메시지'], path: 'character/first_mes.risutext' },
  { id: 'description', extension: '.risutext', keywords: ['description', '묘사'], path: 'character/description.risutext' },
  { id: 'system_prompt', extension: '.risutext', keywords: ['system_prompt', '시스템 프롬프트'], path: 'character/system_prompt.risutext' },
  { id: 'char_book', extension: '.risulorebook', keywords: ['char_book', '로어북', 'lorebook'] },
  { id: '_moduleLorebook', extension: '.risulorebook', keywords: ['_modulelorebook', 'module lorebook', '모듈 로어북'] },
  { id: 'customScripts', extension: '.risuregex', keywords: ['customscripts', 'custom scripts', '캐릭터 regex'] },
  { id: 'customscript[]', extension: '.risuregex', keywords: ['customscript', 'module regex', '모듈 regex'] },
  { id: 'presetRegex', extension: '.risuregex', keywords: ['presetregex', 'preset regex', '프리셋 regex', '프리셋 정규식', 'regex'] },
  { id: 'triggerscript', extension: '.risulua', keywords: ['triggerscript', 'lua', '스크립트'] },
  { id: 'defaultVariables', extension: '.risuvar', keywords: ['defaultvariables', '변수'] },
  { id: 'backgroundHTML', extension: '.risuhtml', keywords: ['backgroundhtml', 'html', '배경'] },
  { id: 'promptTemplate', extension: '.risuprompt', keywords: ['prompttemplate', 'prompt template', '프롬프트 템플릿'] },
];

const EXTENSION_ACTION_IDS: Record<string, readonly string[]> = {
  '.risulorebook': ['validate.cbs_syntax', 'analyze.query_cbs_usage', 'analyze.query_variable_flow'],
  '.risuregex': ['validate.cbs_syntax', 'analyze.query_cbs_usage', 'analyze.query_composition_conflicts'],
  '.risulua': ['analyze.query_lua_analysis', 'analyze.query_lua_call_graph', 'analyze.query_lua_state_access'],
  '.risuprompt': ['analyze.query_prompt_chain', 'validate.cbs_syntax'],
  '.risuhtml': ['inspect.path', 'validate.path'],
  '.risuvar': ['analyze.query_variable_flow', 'inspect.path', 'validate.path'],
  '.risutoggle': ['inspect.path', 'validate.path'],
  '.risutext': ['inspect.path', 'validate.path'],
};

function includesKeyword(text: string, keyword: string): boolean {
  return text.includes(keyword.toLowerCase());
}

function matchCandidates(text: string, entries: Array<{ id: string; confidence: number; keywords: readonly string[] }>): CandidateDraft[] {
  return entries
    .map((entry) => ({
      id: entry.id,
      confidence: entry.confidence,
      evidence: entry.keywords.filter((keyword) => includesKeyword(text, keyword)).slice(0, 3),
    }))
    .filter((entry) => entry.evidence.length > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CANONICAL_CANDIDATES);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function inferTaskType(text: string): CompactCanonicalIntent['taskType'] {
  if (['extract', 'unpack', 'import', '추출', '풀어', '가져오기'].some((word) => text.includes(word))) return 'package';
  if (['충돌', 'conflict', '분석', 'analyze', '영향', 'impact', '봐줘', '확인'].some((word) => text.includes(word))) return 'analyze';
  if (['수정', '바꿔', '고쳐', 'edit', 'fix', 'modify'].some((word) => text.includes(word))) return 'modify';
  if (['생성', 'create', 'scaffold'].some((word) => text.includes(word))) return 'create';
  if (['검증', 'validate', 'verify'].some((word) => text.includes(word))) return 'validate';
  return 'unknown';
}

export function resolveCompactCanonicalIntent(input: {
  request: string;
  target?: string;
  context?: string;
  recommendedActions: readonly string[];
}): CompactCanonicalIntent | undefined {
  const text = `${input.request} ${input.target ?? ''} ${input.context ?? ''}`.toLowerCase();
  const targets = matchCandidates(text, TARGET_KEYWORDS);
  const extensions = matchCandidates(text, EXTENSION_KEYWORDS);
  const extensionIds = new Set(extensions.map((candidate) => candidate.id));
  const upstreamFields = UPSTREAM_FIELDS
    .filter((field) => field.keywords.some((keyword) => includesKeyword(text, keyword)) || extensionIds.has(field.extension))
    .slice(0, MAX_CANONICAL_CANDIDATES)
    .map((field) => ({ id: field.id, extension: field.extension }));
  const pathCandidates = UPSTREAM_FIELDS
    .filter((field) => field.path && upstreamFields.some((candidate) => candidate.id === field.id))
    .slice(0, MAX_CANONICAL_CANDIDATES)
    .map((field) => ({ path: field.path!, reason: `${field.id} canonical path` }));
  const targetResources = targets.map((candidate) => `risuai-workbench://wiki/custom-extension/targets/${candidate.id === 'charx' ? 'charx' : candidate.id}.md`);
  const extensionResources = EXTENSION_KEYWORDS
    .filter((entry) => extensionIds.has(entry.id))
    .map((entry) => entry.resource);
  const resourceLinks = uniqueStrings([...targetResources, ...extensionResources]).slice(0, MAX_RESOURCE_LINKS);

  const domainActionIds: string[] = [];
  for (const extensionId of extensionIds) {
    domainActionIds.push(...(EXTENSION_ACTION_IDS[extensionId] ?? []));
  }
  if (extensionIds.has('.risuregex') || targets.some((candidate) => candidate.id === 'preset')) {
    domainActionIds.push('analyze.query_composition_conflicts', 'validate.artifact');
  }
  if (extensionIds.has('.risutext') || targets.some((candidate) => candidate.id === 'charx')) {
    domainActionIds.push('patch.suggest', 'validate.artifact');
  }
  const actionIds = uniqueStrings([...input.recommendedActions, ...domainActionIds]).slice(0, MAX_ACTION_IDS);

  if (targets.length === 0 && extensions.length === 0 && upstreamFields.length === 0) {
    return undefined;
  }

  return {
    taskType: inferTaskType(text),
    targets,
    extensions,
    upstreamFields,
    pathCandidates,
    contextKinds: uniqueStrings(['artifact-candidates', 'canonical-rules']).slice(0, 5),
    actionIds,
    resourceLinks,
    truncated: false,
  };
}
