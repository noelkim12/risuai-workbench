/**
 * Main Editor 도메인의 문서 모델, preview, simulator profile API를 외부에 공개하는 barrel 파일.
 * @file packages/core/src/domain/editor/index.ts
 *
 * Export는 세 그룹으로 나뉩니다:
 * - **Stable public API** — VS Code extension, webview, core test에서 직접 소비하는 진입점.
 * - **Lorebook position mapping** — lorebook CONTENT 전용 Monaco/source 좌표 변환.
 *   VS Code LSP bridge가 직접 import하므로 호환성 유지가 필요하지만,
 *   범용 mapper가 아니라 lorebook 전용 surface임을 문서화합니다.
 * - **Internal candidate / compatibility** — format별 parser/preview 내부 구현에서만 직접 사용하는
 *   저수준 scanner, offset, helper surface. 외부 패키지 소비자는 없지만,
 *   기존 core test import 호환성을 위해 barrel에서 재노출을 유지합니다.
 */

// ─── Stable public API ──────────────────────────────────────────────────────

// Document model types — 공통 문서 모델 타입과 format별 state 타입
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
} from './document-model/types';
export { MAIN_EDITOR_FORMAT_KINDS } from './document-model/types';

// Document model parser dispatch — formatKind별 parser 진입점
export { parseMainEditorDocumentModel } from './document-model/parse-main-editor-document-model';

// Preview DTO types — 공통 preview 상태, diagnostic, coverage helper
export type { EditorPreviewStatus, EditorPreviewDiagnostic, EditorPreviewMetadataBase } from './preview/types';
export { createPreviewDiagnostic } from './preview/create-preview-diagnostic';
export { formatCoverageSummary } from './preview/coverage-summary';

// Lorebook format — parse, reassemble, serialize policy, preview
export { parseLorebookEditorDocument, reassembleLorebookEditorDocument } from './formats/lorebook/document-model';
export { canSerializeLorebookModel } from './formats/lorebook/serialize-policy';
export type { LorebookContentPreviewResult } from './formats/lorebook/preview/quick-preview';
export { createLorebookContentPreview } from './formats/lorebook/preview/quick-preview';
export type { LorebookRuntimePreviewInput, LorebookRuntimePreviewResult, LorebookRuntimeVariableBinding } from './formats/lorebook/preview/runtime-preview';
export { createLorebookContentRuntimePreview } from './formats/lorebook/preview/runtime-preview';

// Regex format — parse, reassemble, serialize policy, preview
export { parseRegexEditorDocument, reassembleRegexEditorDocument } from './formats/regex/document-model';
export { canSerializeRegexModel } from './formats/regex/serialize-policy';
export type { RegexMainEditorPreviewInput, RegexMainEditorPreviewResult } from './formats/regex/preview';
export { createRegexMainEditorPreview } from './formats/regex/preview';

// Prompt format — parse, reassemble, serialize policy, rules, preview
export { parsePromptEditorDocument, reassemblePromptEditorDocument } from './formats/prompt/document-model';
export { canSerializePromptModel } from './formats/prompt/serialize-policy';
export type { PromptSectionName, PromptType, PromptTypeRule } from './formats/prompt/prompt-rules';
export { PROMPT_SECTION_NAMES, PROMPT_TYPES, getPromptTypeRule, isPromptType } from './formats/prompt/prompt-rules';
export type { PromptMainEditorPreviewInput, PromptMainEditorPreviewResult } from './formats/prompt/preview';
export { createPromptMainEditorPreview } from './formats/prompt/preview';

// HTML format — parse, reassemble, preview, preview security
export { parseHtmlEditorDocument, reassembleHtmlEditorDocument } from './formats/html/document-model';
export { HTML_PREVIEW_CSP, createSandboxedHtmlSrcdoc, escapeHtmlAttribute, resolveHtmlPreviewSandboxMode } from './formats/html/preview-security';
export type { HtmlPreviewSandboxMode } from './formats/html/preview-security';
export type { HtmlMainEditorPreviewInput, HtmlMainEditorPreviewResult } from './formats/html/preview';
export { createHtmlMainEditorPreview } from './formats/html/preview';

// Runtime profile — simulator profile 타입, 기본값, validation, clone, variable merge
export type {
  SimulatorProfile,
  SimulatorProfileChatMessage,
  SimulatorProfileChatRole,
  SimulatorProfileHtmlContext,
  SimulatorProfileTarget,
  SimulatorProfileVariableOverrides,
  SimulatorProfileVariablePatch,
  MainEditorSimulatorProfile,
} from './runtime-profile';
export {
  cloneSimulatorProfile,
  createDefaultMainEditorSimulatorProfile,
  createDefaultSimulatorProfile,
  createEmptySimulatorProfileVariables,
  isSimulatorProfile,
  mergeSimulatorProfileVariables,
  normalizeSimulatorProfile,
} from './runtime-profile';

// ─── Lorebook position mapping ──────────────────────────────────────────────
// VS Code mainEditorLspBridge가 직접 소비하는 lorebook CONTENT 전용 좌표 변환.
// 범용 mapper가 아니며, lorebook CONTENT section과 Monaco source 사이의 매핑만 담당합니다.

export type { ContentMonacoPosition, ContentMonacoRange } from './formats/lorebook/content-position-mapper';
export { mapContentMonacoPositionToSourcePosition, mapSourceRangeToContentMonacoRange } from './formats/lorebook/content-position-mapper';

// ─── Internal candidate / compatibility ──────────────────────────────────────
// 아래 surface는 editor domain 내부 구현(format parser, content-position-mapper)과
// core editor test에서만 직접 사용합니다. 외부 패키지 소비자가 없습니다.
// 기존 barrel 재노출은 import 호환성을 위해 유지하며, 직접 사용보다는
// 상위 수준의 public API(parseMainEditorDocumentModel, preview, simulate)를 권장합니다.

/**
 * UTF-16 offset 기반 줄/글자 위치 변환 index 생성.
 * @internal lorebook content-position-mapper와 core test에서만 사용합니다.
 */
export type { LineOffsetIndex } from './shared/source-position/line-offset-index';
export { createLineOffsetIndex } from './shared/source-position/line-offset-index';

/**
 * Frontmatter와 `@@@ SECTION` 기반 section scan orchestration.
 * @internal format별 parser(lorebook/regex/prompt)와 core test에서만 사용합니다.
 */
export type { ScanEditorDocumentSectionsOptions, ScannedEditorDocumentSections } from './shared/sections/scan-editor-document';
export { scanEditorDocumentSections } from './shared/sections/scan-editor-document';

/**
 * 경고가 없는 빈 document model용 빈 warning 배열 생성기.
 * @internal document-model 내부 default helper입니다.
 */
export { createEmptyEditorDocumentWarnings } from './document-model/types';
