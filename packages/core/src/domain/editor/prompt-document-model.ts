/**
 * `.risuprompt` 문서의 type-aware section을 구조화 편집 상태로 다루는 모델 유틸입니다.
 * @file packages/core/src/domain/editor/prompt-document-model.ts
 */

import type { EditorDocumentModel, PromptEditorState } from './document-model-types';
import { scanEditorDocumentSections } from './section-scanner';

const PROMPT_SECTIONS = ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'] as const;

/**
 * parsePromptEditorDocument 함수.
 * `.risuprompt` 원문을 Main Editor가 사용할 type-aware skeleton 상태로 분해합니다.
 *
 * @param source - section-scanner가 prompt frontmatter와 허용 section을 찾을 `.risuprompt` 전체 원문입니다.
 * @returns prompt type, section 본문, range 정보를 포함한 prompt editor model을 반환합니다.
 */
export function parsePromptEditorDocument(source: string): EditorDocumentModel<PromptEditorState> {
  const scanned = scanEditorDocumentSections(source, { knownSections: PROMPT_SECTIONS });
  const frontmatter = Object.fromEntries((scanned.frontmatter?.fields ?? []).map((field) => [field.key, field.value]));
  const sections = Object.fromEntries(
    scanned.sections
      .filter((section) => isPromptSectionName(section.name))
      .map((section) => [section.name, section.normalizedContent]),
  );

  return {
    formatKind: 'prompt',
    source,
    lineEnding: scanned.lineEnding,
    hasFinalNewline: scanned.hasFinalNewline,
    frontmatter: scanned.frontmatter,
    sections: scanned.sections,
    warnings: scanned.warnings,
    state: {
      frontmatter,
      type: frontmatter.type ?? null,
      sections,
    },
  };
}

/**
 * reassemblePromptEditorDocument 함수.
 * prompt skeleton 상태를 `.risuprompt` 원문으로 재조립합니다.
 *
 * @param model - 기존 줄바꿈, final newline, scanner warning을 확인하기 위한 prompt editor model입니다.
 * @param state - 사용자가 편집한 frontmatter와 prompt section 본문을 반영할 다음 상태입니다.
 * @returns warning이 없을 때 재조립된 `.risuprompt` 원문을 반환합니다.
 */
export function reassemblePromptEditorDocument(model: EditorDocumentModel<PromptEditorState>, state: PromptEditorState): string {
  if (model.warnings.length > 0) return model.source;

  const lineEnding = model.lineEnding;
  const frontmatterLines = Object.entries(state.frontmatter).map(([key, value]) => `${key}: ${value}`);
  const sectionLines = PROMPT_SECTIONS.flatMap((name) =>
    state.sections[name] === undefined ? [] : [`@@@ ${name}`, state.sections[name] ?? ''],
  );
  const joined = ['---', ...frontmatterLines, '---', ...sectionLines].join(lineEnding);
  return model.hasFinalNewline ? `${joined}${lineEnding}` : joined;
}

/**
 * isPromptSectionName 함수.
 * section-scanner가 찾은 marker 이름이 prompt 편집기가 지원하는 section인지 판별합니다.
 *
 * @param name - prompt section state에 안전하게 넣을 수 있는지 확인할 marker 이름입니다.
 * @returns 지원하는 prompt section 이름이면 true를 반환합니다.
 */
function isPromptSectionName(name: string): name is (typeof PROMPT_SECTIONS)[number] {
  return PROMPT_SECTIONS.some((sectionName) => sectionName === name);
}
