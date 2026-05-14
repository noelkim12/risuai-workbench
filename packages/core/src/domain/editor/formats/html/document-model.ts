/**
 * `.risuhtml` 문서 전체를 단일 본문으로 보존하는 identity format module.
 * @file packages/core/src/domain/editor/formats/html/document-model.ts
 */

import type { EditorDocumentModel, HtmlEditorState } from '../../document-model/types';

/**
 * parseHtmlEditorDocument 함수.
 * `.risuhtml` 원문 전체를 Main Editor가 직접 편집하는 identity 상태로 감쌉니다.
 *
 * @param source - 별도 section 분해 없이 그대로 보존할 `.risuhtml` 전체 원문입니다.
 * @returns 원문 전체를 full section과 contentText로 담은 html editor model을 반환합니다.
 */
export function parseHtmlEditorDocument(source: string): EditorDocumentModel<HtmlEditorState> {
  return {
    formatKind: 'html',
    source,
    lineEnding: source.includes('\r\n') ? '\r\n' : '\n',
    hasFinalNewline: source.endsWith('\n'),
    frontmatter: null,
    sections: [
      {
        name: 'full',
        markerRange: { startOffset: 0, endOffset: 0 },
        contentRange: { startOffset: 0, endOffset: source.length },
        rawContent: source,
        normalizedContent: source,
        structuralTrailingNewline: '',
      },
    ],
    warnings: [],
    state: { contentText: source },
  };
}

/**
 * reassembleHtmlEditorDocument 함수.
 * html identity 상태의 content text를 그대로 `.risuhtml` 원문으로 반환합니다.
 *
 * @param _model - 동일한 reassemble 인터페이스를 맞추기 위해 전달되는 기존 html editor model입니다.
 * @param state - 사용자가 편집한 HTML 전체 본문을 담은 다음 상태입니다.
 * @returns state의 contentText를 재조립된 `.risuhtml` 원문으로 반환합니다.
 */
export function reassembleHtmlEditorDocument(_model: EditorDocumentModel<HtmlEditorState>, state: HtmlEditorState): string {
  return state.contentText;
}
