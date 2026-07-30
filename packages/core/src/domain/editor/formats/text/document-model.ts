/**
 * `.risutext` 문서 전체를 단일 TEXT 본문으로 보존하는 identity format module.
 * @file packages/core/src/domain/editor/formats/text/document-model.ts
 */

import type { EditorDocumentModel, TextEditorState } from '../../document-model/types';

export function parseTextEditorDocument(source: string): EditorDocumentModel<TextEditorState> {
  return {
    formatKind: 'text',
    source,
    lineEnding: source.includes('\r\n') ? '\r\n' : '\n',
    hasFinalNewline: source.endsWith('\n'),
    frontmatter: null,
    sections: [
      {
        name: 'TEXT',
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

export function reassembleTextEditorDocument(
  _model: EditorDocumentModel<TextEditorState>,
  state: TextEditorState,
): string {
  return state.contentText;
}
