/**
 * Main Editor authoring과 preview에서 쓰는 `.risuprompt` type/section 규칙입니다.
 * @file packages/core/src/domain/editor/prompt-rules.ts
 */

export type PromptType = 'plain' | 'jailbreak' | 'cot' | 'chatML' | 'persona' | 'description' | 'lorebook' | 'postEverything' | 'memory' | 'authornote' | 'chat' | 'cache';
export type PromptSectionName = 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT';

export interface PromptTypeRule {
  requiredFields: string[];
  allowedSections: PromptSectionName[];
  sectionless: boolean;
}

export const PROMPT_TYPES: readonly PromptType[] = [
  'plain',
  'jailbreak',
  'cot',
  'chatML',
  'persona',
  'description',
  'lorebook',
  'postEverything',
  'memory',
  'authornote',
  'chat',
  'cache',
];

export const PROMPT_SECTION_NAMES: readonly PromptSectionName[] = ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'];

const PLAIN_RULE: PromptTypeRule = {
  requiredFields: ['type', 'type2', 'role'],
  allowedSections: ['TEXT'],
  sectionless: false,
};

const INNER_FORMAT_RULE: PromptTypeRule = {
  requiredFields: ['type'],
  allowedSections: ['INNER_FORMAT'],
  sectionless: false,
};

const RULES: Record<PromptType, PromptTypeRule> = {
  plain: PLAIN_RULE,
  jailbreak: PLAIN_RULE,
  cot: PLAIN_RULE,
  chatML: { requiredFields: ['type'], allowedSections: ['TEXT'], sectionless: false },
  persona: INNER_FORMAT_RULE,
  description: INNER_FORMAT_RULE,
  lorebook: INNER_FORMAT_RULE,
  postEverything: INNER_FORMAT_RULE,
  memory: INNER_FORMAT_RULE,
  authornote: { requiredFields: ['type'], allowedSections: ['INNER_FORMAT', 'DEFAULT_TEXT'], sectionless: false },
  chat: { requiredFields: ['type', 'range_start', 'range_end'], allowedSections: [], sectionless: true },
  cache: { requiredFields: ['type', 'name', 'depth', 'cache_role'], allowedSections: [], sectionless: true },
};

/**
 * getPromptTypeRule 함수.
 * `.risuprompt` 12개 type에 대응하는 field/section 규칙을 반환합니다.
 *
 * @param type - Main Editor가 section 구조를 판단해야 하는 prompt type입니다.
 * @returns 해당 type의 immutable rule snapshot입니다.
 */
export function getPromptTypeRule(type: PromptType): PromptTypeRule {
  const rule = RULES[type];
  return {
    requiredFields: [...rule.requiredFields],
    allowedSections: [...rule.allowedSections],
    sectionless: rule.sectionless,
  };
}

/**
 * isPromptType 함수.
 * unknown 값을 지원되는 `.risuprompt` type으로 좁힙니다.
 *
 * @param value - prompt frontmatter나 외부 입력에서 온 type 후보 값입니다.
 * @returns 지원되는 prompt type이면 true입니다.
 */
export function isPromptType(value: unknown): value is PromptType {
  return typeof value === 'string' && PROMPT_TYPES.some((type) => type === value);
}
