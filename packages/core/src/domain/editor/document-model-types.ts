/**
 * Main Editor 문서 모델에서 함께 쓰는 타입 계약을 모아둔 파일.
 * @file packages/core/src/domain/editor/document-model-types.ts
 */

export const MAIN_EDITOR_FORMAT_KINDS = ['lorebook', 'regex', 'prompt', 'html'] as const;

export type MainEditorFormatKind = (typeof MAIN_EDITOR_FORMAT_KINDS)[number];

export type EditorDocumentWarningSeverity = 'info' | 'warning' | 'error';

export interface SourceRange {
  startOffset: number;
  endOffset: number;
}

export interface SourcePosition {
  line: number;
  character: number;
  offset: number;
}

export interface SourceLocatedRange extends SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

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

export interface EditorFrontmatterField {
  key: string;
  value: string;
  rawLine: string;
  range: SourceRange;
  keyRange: SourceRange;
  valueRange: SourceRange;
}

export interface EditorFrontmatterBlock {
  exists: boolean;
  range: SourceRange;
  bodyRange: SourceRange;
  raw: string;
  fields: EditorFrontmatterField[];
  unknownFields: EditorFrontmatterField[];
}

export interface EditorSectionBlock {
  name: string;
  markerRange: SourceRange;
  contentRange: SourceRange;
  rawContent: string;
  normalizedContent: string;
  structuralTrailingNewline: '' | '\n' | '\r\n';
}

export interface EditorDocumentBaseModel {
  formatKind: MainEditorFormatKind;
  source: string;
  lineEnding: '\n' | '\r\n';
  hasFinalNewline: boolean;
  frontmatter: EditorFrontmatterBlock | null;
  sections: EditorSectionBlock[];
  warnings: EditorDocumentWarning[];
}

export interface LorebookEditorState {
  frontmatter: Record<string, string>;
  unknownFrontmatter: EditorFrontmatterField[];
  keysText: string;
  secondaryKeysText: string;
  contentText: string;
  hasSecondaryKeysSection: boolean;
}

export interface RegexEditorState {
  frontmatter: Record<string, string>;
  inText: string;
  outText: string;
}

export interface PromptEditorState {
  frontmatter: Record<string, string>;
  type: string | null;
  sections: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>>;
}

export interface HtmlEditorState {
  contentText: string;
}

export type EditorFormatState = LorebookEditorState | RegexEditorState | PromptEditorState | HtmlEditorState;

export interface EditorDocumentModel<TState extends EditorFormatState = EditorFormatState> extends EditorDocumentBaseModel {
  state: TState;
}

/**
 * createEmptyEditorDocumentWarnings 함수.
 * Main Editor 문서 파서가 누적해서 채울 수 있는 독립적인 warning 배열을 새로 만듦.
 *
 * @returns 호출자가 자유롭게 추가할 수 있는 빈 warning 배열
 */
export function createEmptyEditorDocumentWarnings(): EditorDocumentWarning[] {
  return [];
}
