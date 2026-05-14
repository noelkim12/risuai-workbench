/**
 * Main Editor 도메인의 문서 모델, preview, simulator profile API를 외부에 공개하는 barrel 파일.
 * @file packages/core/src/domain/editor/index.ts
 */

export type {
  EditorDocumentBaseModel,
  EditorDocumentModel,
  EditorDocumentWarning,
  EditorDocumentWarningSeverity,
  EditorFormatState,
  EditorFrontmatterBlock,
  EditorFrontmatterField,
  EditorSectionBlock,
  HtmlEditorState,
  LorebookEditorState,
  MainEditorFormatKind,
  PromptEditorState,
  RegexEditorState,
  SourceLocatedRange,
  SourcePosition,
  SourceRange,
} from './document-model-types';
export { MAIN_EDITOR_FORMAT_KINDS, createEmptyEditorDocumentWarnings } from './document-model-types';
export type { LineOffsetIndex } from './line-offsets';
export { createLineOffsetIndex } from './line-offsets';
export type { ContentMonacoPosition, ContentMonacoRange } from './content-position-mapping';
export { mapContentMonacoPositionToSourcePosition, mapSourceRangeToContentMonacoRange } from './content-position-mapping';
export type { LorebookContentPreviewResult } from './lorebook-preview';
export { createLorebookContentPreview } from './lorebook-preview';
export type { LorebookRuntimePreviewInput, LorebookRuntimePreviewResult, LorebookRuntimeVariableBinding } from './lorebook-preview-runtime';
export { createLorebookContentRuntimePreview } from './lorebook-preview-runtime';
export type { RegexMainEditorPreviewInput, RegexMainEditorPreviewResult } from './regex-preview-adapter';
export { createRegexMainEditorPreview } from './regex-preview-adapter';
export type { PromptSectionName, PromptType, PromptTypeRule } from './prompt-rules';
export { PROMPT_SECTION_NAMES, PROMPT_TYPES, getPromptTypeRule, isPromptType } from './prompt-rules';
export type { PromptMainEditorPreviewInput, PromptMainEditorPreviewResult } from './prompt-preview-adapter';
export { createPromptMainEditorPreview } from './prompt-preview-adapter';
export type { HtmlMainEditorPreviewInput, HtmlMainEditorPreviewResult } from './html-preview-adapter';
export { createHtmlMainEditorPreview } from './html-preview-adapter';
export type {
  SimulatorProfile,
  SimulatorProfileChatMessage,
  SimulatorProfileChatRole,
  SimulatorProfileHtmlContext,
  SimulatorProfileTarget,
  SimulatorProfileVariableOverrides,
  SimulatorProfileVariablePatch,
  MainEditorSimulatorProfile,
} from './simulator-profile';
export {
  cloneSimulatorProfile,
  createDefaultMainEditorSimulatorProfile,
  createDefaultSimulatorProfile,
  createEmptySimulatorProfileVariables,
  isSimulatorProfile,
  mergeSimulatorProfileVariables,
  normalizeSimulatorProfile,
} from './simulator-profile';
export type { ScanEditorDocumentSectionsOptions, ScannedEditorDocumentSections } from './section-scanner';
export { scanEditorDocumentSections } from './section-scanner';
export { parseLorebookEditorDocument, reassembleLorebookEditorDocument } from './lorebook-document-model';
export { parseRegexEditorDocument, reassembleRegexEditorDocument } from './regex-document-model';
export { parsePromptEditorDocument, reassemblePromptEditorDocument } from './prompt-document-model';
export { parseHtmlEditorDocument, reassembleHtmlEditorDocument } from './html-document-model';
export { parseMainEditorDocumentModel } from './main-editor-document-model';
