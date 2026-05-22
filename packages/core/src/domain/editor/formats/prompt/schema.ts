/**
 * Prompt format의 section 이름 schema. 상세 규칙은 prompt-rules.ts를 참조합니다.
 * @file packages/core/src/domain/editor/formats/prompt/schema.ts
 */

/** Prompt scanner가 인식하는 section 이름. */
export const PROMPT_KNOWN_SECTIONS = ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'] as const;

export type { PromptSectionName, PromptType, PromptTypeRule } from './prompt-rules';
export { PROMPT_SECTION_NAMES, PROMPT_TYPES, getPromptTypeRule, isPromptType } from './prompt-rules';
