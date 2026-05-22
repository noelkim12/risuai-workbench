/**
 * Main Editor formatKind에 따라 전용 document model parser로 위임하는 진입점.
 * @file packages/core/src/domain/editor/document-model/parse-main-editor-document-model.ts
 */

import type { EditorDocumentModel, EditorFormatState, MainEditorFormatKind } from './types';
import { parseHtmlEditorDocument } from '../formats/html/document-model';
import { parseLorebookEditorDocument } from '../formats/lorebook/document-model';
import { parsePromptEditorDocument } from '../formats/prompt/document-model';
import { parseRegexEditorDocument } from '../formats/regex/document-model';

/**
 * parseMainEditorDocumentModel 함수.
 * Main Editor format kind에 맞는 document model parser를 선택해 실행함.
 *
 * @param formatKind - 어떤 전용 parser로 위임할지 결정하는 Main Editor 포맷
 * @param source - 선택된 parser가 구조화할 전체 문서 원문
 * @returns formatKind에 대응하는 editor document model
 */
export function parseMainEditorDocumentModel(
  formatKind: MainEditorFormatKind,
  source: string,
): EditorDocumentModel<EditorFormatState> {
  switch (formatKind) {
    case 'lorebook':
      return parseLorebookEditorDocument(source);
    case 'regex':
      return parseRegexEditorDocument(source);
    case 'prompt':
      return parsePromptEditorDocument(source);
    case 'html':
      return parseHtmlEditorDocument(source);
  }
}
