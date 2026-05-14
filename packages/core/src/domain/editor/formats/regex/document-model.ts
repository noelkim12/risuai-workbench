/**
 * `.risuregex` 문서의 IN/OUT section을 구조화 편집 상태로 다루는 format module.
 * @file packages/core/src/domain/editor/formats/regex/document-model.ts
 */

import type { EditorDocumentModel, RegexEditorState } from '../../document-model/types';
import { scanEditorDocumentSections } from '../../shared/sections/scan-editor-document';
import { canSerializeRegexModel } from './serialize-policy';
import { REGEX_KNOWN_SECTIONS } from './schema';

/**
 * parseRegexEditorDocument 함수.
 * `.risuregex` 원문을 Main Editor의 IN/OUT skeleton 상태로 분해합니다.
 *
 * @param source - section-scanner가 frontmatter와 IN/OUT marker를 찾을 `.risuregex` 전체 원문입니다.
 * @returns frontmatter, section range, IN/OUT 본문을 담은 regex editor model을 반환합니다.
 */
export function parseRegexEditorDocument(source: string): EditorDocumentModel<RegexEditorState> {
  const scanned = scanEditorDocumentSections(source, { knownSections: [...REGEX_KNOWN_SECTIONS] });
  const sections = new Map(scanned.sections.map((section) => [section.name, section]));
  return {
    formatKind: 'regex',
    source,
    lineEnding: scanned.lineEnding,
    hasFinalNewline: scanned.hasFinalNewline,
    frontmatter: scanned.frontmatter,
    sections: scanned.sections,
    warnings: scanned.warnings,
    state: {
      frontmatter: Object.fromEntries((scanned.frontmatter?.fields ?? []).map((field) => [field.key, field.value])),
      inText: sections.get('IN')?.normalizedContent ?? '',
      outText: sections.get('OUT')?.normalizedContent ?? '',
    },
  };
}

/**
 * reassembleRegexEditorDocument 함수.
 * regex skeleton 상태를 `.risuregex` 원문으로 재조립합니다.
 *
 * @param model - 기존 줄바꿈, final newline, scanner warning을 확인하기 위한 regex editor model입니다.
 * @param state - 사용자가 편집한 frontmatter와 IN/OUT 본문을 반영할 다음 상태입니다.
 * @returns warning이 없을 때 재조립된 `.risuregex` 원문을 반환합니다.
 */
export function reassembleRegexEditorDocument(model: EditorDocumentModel<RegexEditorState>, state: RegexEditorState): string {
  if (!canSerializeRegexModel(model)) return model.source;

  const lineEnding = model.lineEnding;
  const frontmatterLines = Object.entries(state.frontmatter).map(([key, value]) => `${key}: ${value}`);
  const joined = ['---', ...frontmatterLines, '---', '@@@ IN', state.inText, '@@@ OUT', state.outText].join(lineEnding);
  return model.hasFinalNewline ? `${joined}${lineEnding}` : joined;
}
