/**
 * Main Editor parser와 serializer가 공유하는 warning DTO 타입.
 * @file packages/core/src/domain/editor/shared/diagnostics/editor-warning.ts
 */

import type { SourceRange } from '../source-position/types';

export type EditorDocumentWarningSeverity = 'info' | 'warning' | 'error';

export interface EditorDocumentWarning {
  code:
    | 'missing-frontmatter'
    | 'malformed-frontmatter'
    | 'missing-section'
    | 'duplicate-section'
    | 'unsupported-section'
    | 'out-of-order-section'
    | 'unsupported-frontmatter-field';
  severity: EditorDocumentWarningSeverity;
  message: string;
  range: SourceRange;
  sectionName?: string;
  fieldName?: string;
}
