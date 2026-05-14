/**
 * Main custom text editor extension-host contracts and guards.
 * @file packages/vscode/src/editors/mainEditor/mainEditorTypes.ts
 */

import path from 'node:path';

export const MAIN_EDITOR_PROTOCOL = 'risu-workbench.main-editor';
export const MAIN_EDITOR_PROTOCOL_VERSION = 1;

export type MainEditorFormatKind = 'lorebook' | 'regex' | 'prompt' | 'html';
export type MainEditorSectionName = 'CONTENT' | 'KEYS' | 'SECONDARY_KEYS' | 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';
export type MainEditorPromptType = 'plain' | 'jailbreak' | 'cot' | 'chatML' | 'persona' | 'description' | 'lorebook' | 'postEverything' | 'memory' | 'authornote' | 'chat' | 'cache';
export type MainEditorFormatSectionName = 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';

export interface MainEditorFormatDefinition {
  kind: MainEditorFormatKind;
  extension: '.risulorebook' | '.risuregex' | '.risuprompt' | '.risuhtml';
  languageId: 'risulorebook' | 'risuregex' | 'risuprompt' | 'risuhtml';
  viewType: string;
  displayName: string;
}

export const MAIN_EDITOR_FORMATS: readonly MainEditorFormatDefinition[] = [
  {
    kind: 'lorebook',
    extension: '.risulorebook',
    languageId: 'risulorebook',
    viewType: 'risuWorkbench.mainEditor.lorebook',
    displayName: 'Risu Lorebook Editor',
  },
  {
    kind: 'regex',
    extension: '.risuregex',
    languageId: 'risuregex',
    viewType: 'risuWorkbench.mainEditor.regex',
    displayName: 'Risu Regex Editor',
  },
  {
    kind: 'prompt',
    extension: '.risuprompt',
    languageId: 'risuprompt',
    viewType: 'risuWorkbench.mainEditor.prompt',
    displayName: 'Risu Prompt Editor',
  },
  {
    kind: 'html',
    extension: '.risuhtml',
    languageId: 'risuhtml',
    viewType: 'risuWorkbench.mainEditor.html',
    displayName: 'Risu HTML Editor',
  },
];

export interface MainEditorPreferenceState {
  splitRatio: number;
  frontmatterOpen: boolean;
  drawerOpen: boolean;
}

export interface MainEditorEditPayload {
  requestId: string;
  documentUri: string;
  baseVersion: number;
  nextText: string;
}

export interface MainEditorDocumentWarningPayload {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sectionName?: string;
  fieldName?: string;
}

export interface MainEditorDocumentModelPayload {
  formatKind: MainEditorFormatKind;
  state: unknown;
  warnings: MainEditorDocumentWarningPayload[];
  sections: Array<{ name: string; normalizedContent: string }>;
}

export interface MainEditorStructuredEditPayload {
  requestId: string;
  documentUri: string;
  baseVersion: number;
  formatKind: MainEditorFormatKind;
  state: unknown;
}

interface LorebookStructuredEditState {
  frontmatter: Record<string, string>;
  unknownFrontmatter: unknown[];
  keysText: string;
  secondaryKeysText: string;
  contentText: string;
  hasSecondaryKeysSection: boolean;
}

export interface RegexStructuredState {
  frontmatter: Record<string, unknown>;
  inText: string;
  outText: string;
}

export interface PromptStructuredState {
  frontmatter: Record<string, unknown>;
  type: MainEditorPromptType;
  sections: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>>;
}

export interface HtmlStructuredState {
  contentText: string;
}

export interface MainEditorSimulatorProfilePayload {
  id: string;
  name: string;
  target: { characterId?: string; moduleIds: string[]; presetId?: string };
  variables: MainEditorVariableOverridesPayload;
  chatHistory: Array<{ role: 'user' | 'assistant' | 'system' | 'bot'; content: string; timestamp?: string }>;
  htmlContext: { enabledHtmlDocumentUris: string[] };
}

export interface MainEditorReadyPayload {
  documentUri: string;
}

export interface MainEditorMonacoPositionPayload {
  lineNumber: number;
  column: number;
}

export interface MainEditorMonacoRangePayload {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MainEditorLspRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  sectionName: MainEditorSectionName;
  contentVersion: number;
  position: MainEditorMonacoPositionPayload;
}

export interface MainEditorLspCompletionRequestPayload extends MainEditorLspRequestPayload {
  triggerCharacter?: string;
}

export type MainEditorLspHoverRequestPayload = MainEditorLspRequestPayload;

export type MainEditorLspDefinitionRequestPayload = MainEditorLspRequestPayload;

export interface MainEditorLspCompletionItemPayload {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText: string;
  insertTextFormat?: 'plainText' | 'snippet';
  range?: MainEditorMonacoRangePayload;
}

export interface MainEditorLspCompletionResponsePayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  items: MainEditorLspCompletionItemPayload[];
  incomplete: boolean;
}

export interface MainEditorLspHoverResponsePayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contents: string[];
  range?: MainEditorMonacoRangePayload;
}

export interface MainEditorLspDefinitionTargetPayload {
  uri: string;
  range: MainEditorMonacoRangePayload;
  sameDocument: boolean;
}

export interface MainEditorLspDefinitionResponsePayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  targets: MainEditorLspDefinitionTargetPayload[];
}

export interface MainEditorLspErrorPayload {
  requestId: string;
  documentUri: string;
  code: 'staleDocument' | 'unsupportedSection' | 'languageClientUnavailable' | 'requestFailed';
  message: string;
}

export type MainEditorAdvancedLspKind = 'references' | 'prepareRename' | 'rename' | 'codeLens' | 'workspaceSymbols';

export interface MainEditorSourcePositionPayload {
  line: number;
  character: number;
}

export interface MainEditorSourceRangePayload {
  start: MainEditorSourcePositionPayload;
  end: MainEditorSourcePositionPayload;
}

export interface MainEditorLocationPayload {
  uri: string;
  sourceRange: MainEditorSourceRangePayload;
  sectionName?: MainEditorSectionName;
  monacoRange?: MainEditorMonacoRangePayload;
}

export interface MainEditorAdvancedLspBaseRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: MainEditorSectionName;
}

export interface MainEditorReferencesRequestPayload extends MainEditorAdvancedLspBaseRequestPayload {
  position: MainEditorMonacoPositionPayload;
  includeDeclaration: boolean;
}

export interface MainEditorPrepareRenameRequestPayload extends MainEditorAdvancedLspBaseRequestPayload {
  position: MainEditorMonacoPositionPayload;
}

export interface MainEditorRenameRequestPayload extends MainEditorAdvancedLspBaseRequestPayload {
  position: MainEditorMonacoPositionPayload;
  newName: string;
}

export interface MainEditorCodeLensRequestPayload extends MainEditorAdvancedLspBaseRequestPayload {}

export interface MainEditorWorkspaceSymbolsRequestPayload {
  requestId: string;
  query: string;
  limit: number;
}

export interface MainEditorRevealLocationRequestPayload {
  requestId: string;
  location: MainEditorLocationPayload;
}

export interface MainEditorReferencesResultPayload {
  requestId: string;
  locations: MainEditorLocationPayload[];
}

export interface MainEditorPrepareRenameResultPayload {
  requestId: string;
  range?: MainEditorMonacoRangePayload;
  placeholder: string;
  rejected: boolean;
}

export interface MainEditorWorkspaceEditPayload {
  editId: string;
  summary: string;
  affectedUris: string[];
}

export interface MainEditorRenameResultPayload {
  requestId: string;
  edit: MainEditorWorkspaceEditPayload;
}

export interface MainEditorCodeLensPayload {
  sourceRange: MainEditorSourceRangePayload;
  monacoRange?: MainEditorMonacoRangePayload;
  title: string;
  command?: string;
  arguments?: unknown[];
  tooltip?: string;
}

export interface MainEditorCodeLensResultPayload {
  requestId: string;
  lenses: MainEditorCodeLensPayload[];
}

export interface MainEditorWorkspaceSymbolPayload {
  name: string;
  kind: number;
  containerName?: string;
  location: MainEditorLocationPayload;
}

export interface MainEditorWorkspaceSymbolsResultPayload {
  requestId: string;
  symbols: MainEditorWorkspaceSymbolPayload[];
}

export interface MainEditorAdvancedLspErrorPayload {
  requestId: string;
  kind: MainEditorAdvancedLspKind;
  code: 'stale-document' | 'unsupported-section' | 'provider-unavailable' | 'invalid-request' | 'rename-rejected' | 'internal-error';
  message: string;
}

export interface MainEditorDiagnosticMarkerPayload {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  code?: string;
  source: 'cbs-lsp' | 'preview';
  range: MainEditorMonacoRangePayload;
}

export interface MainEditorDiagnosticsUpdatePayload {
  documentUri: string;
  documentVersion: number;
  sectionName: MainEditorSectionName;
  markers: MainEditorDiagnosticMarkerPayload[];
}

export interface MainEditorPreviewRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: MainEditorSectionName;
  contentText: string;
}

export interface MainEditorPreviewResultPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: MainEditorSectionName;
  status: 'ok' | 'partial' | 'aborted' | 'error' | 'stale';
  output: string;
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>;
  coverageSummary: string;
}

export type MainEditorVariableSectionScope = 'usedHere' | 'workspace' | 'profiles' | 'traceContext';

export type MainEditorVariableSourceBadge =
  | 'usage'
  | '.risuvar'
  | 'toggle'
  | 'profile'
  | 'history'
  | 'workspace'
  | 'missing'
  | 'runtimeUnknown'
  | 'previewOverride'
  | 'inferred';

export type MainEditorVariableValueKind = 'boolean' | 'enum' | 'number' | 'string' | 'list' | 'unknown';

export interface MainEditorVariableOverridesPayload {
  chatVariables?: Record<string, string>;
  globalVariables?: Record<string, string>;
  toggleValues?: Record<string, boolean>;
  tempVariables?: Record<string, string>;
}

export interface MainEditorVariableCandidatePayload {
  value: string;
  source: MainEditorVariableSourceBadge;
  label: string;
}

export interface MainEditorVariableBindingPayload {
  variableName: string;
  scope: 'chat' | 'global' | 'toggle' | 'temp' | 'iterator';
  direction: 'read' | 'write';
  operation: string;
  status: 'resolved' | 'missing' | 'runtimeUnknown' | 'writeOnly';
  source: MainEditorVariableSourceBadge;
  valueKind: MainEditorVariableValueKind;
  resolvedValue?: string;
  rawValue: string;
  candidates: MainEditorVariableCandidatePayload[];
  usageRanges: Array<{ line: number; character: number; endLine: number; endCharacter: number }>;
}

export interface MainEditorTraceEventPayload {
  phase: 'parse' | 'visit' | 'macro-enter' | 'macro-exit' | 'macro-skip' | 'diagnostic' | 'budget-exceeded';
  message: string;
  node?: string;
  range?: { line: number; character: number; endLine: number; endCharacter: number };
  details?: Record<string, string>;
}

export interface MainEditorRuntimeDiagnosticPayload {
  source: 'cbs-lsp' | 'parser' | 'simulator';
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  range?: { line: number; character: number; endLine: number; endCharacter: number };
}

export interface MainEditorRuntimeEffectPayload {
  operation: string;
  kind?: string;
  targetStore?: string;
  target?: string;
  valuePreview?: string;
  committed: boolean;
  commitBlockedReason?: string;
  source?: string;
}

export interface MainEditorPreviewRuntimeRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: 'CONTENT';
  contentText: string;
  overrides: MainEditorVariableOverridesPayload;
  profileId?: string;
}

export interface MainEditorPreviewRuntimeResultPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: 'CONTENT';
  status: 'ok' | 'partial' | 'aborted' | 'error' | 'stale';
  output: string;
  bindings: MainEditorVariableBindingPayload[];
  warnings: Array<{ code: string; variableName: string; message: string }>;
  diagnostics: MainEditorRuntimeDiagnosticPayload[];
  effects: MainEditorRuntimeEffectPayload[];
  trace: MainEditorTraceEventPayload[];
  coverageSummary: string;
}

export interface MainEditorFormatPreviewRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  sectionName: MainEditorFormatSectionName;
  activeProfileId: string;
  sampleInput?: string;
  profile?: MainEditorSimulatorProfilePayload;
  formatKind: 'regex' | 'prompt' | 'html';
  state: RegexStructuredState | PromptStructuredState | HtmlStructuredState;
}

export interface MainEditorFormatPreviewResultPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  formatKind: 'regex' | 'prompt' | 'html';
  sectionName: MainEditorFormatSectionName;
  status: 'ok' | 'partial' | 'aborted' | 'error' | 'stale';
  output: string;
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>;
  metadata: Record<string, string>;
}

export interface MainEditorSimulatorProfileListRequestPayload {
  requestId: string;
  documentUri: string;
}

export interface MainEditorSimulatorProfileListResultPayload {
  requestId: string;
  documentUri: string;
  profiles: MainEditorSimulatorProfilePayload[];
  activeProfileId: string;
}

export interface MainEditorSimulatorProfileSaveRequestPayload {
  requestId: string;
  documentUri: string;
  profile: MainEditorSimulatorProfilePayload;
  activeProfileId?: string;
}

export interface MainEditorSimulatorProfileSaveResultPayload {
  requestId: string;
  documentUri: string;
  profile: MainEditorSimulatorProfilePayload;
  activeProfileId: string;
  status: 'ok' | 'error';
  message?: string;
}

export interface MainEditorVariableCandidatesRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  formatKind: MainEditorFormatKind;
  sectionName: 'CONTENT';
  scope: Exclude<MainEditorVariableSectionScope, 'usedHere'>;
  variableNames: string[];
}

export interface MainEditorVariableCandidatesResultPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  contentVersion: number;
  scope: Exclude<MainEditorVariableSectionScope, 'usedHere'>;
  candidatesByVariable: Record<string, MainEditorVariableCandidatePayload[]>;
  stale: boolean;
}

export type MainEditorWebviewMessage =
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/ready';
      payload: MainEditorReadyPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/edit';
      payload: MainEditorEditPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/structuredEdit';
      payload: MainEditorStructuredEditPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/updatePreferences';
      payload: {
        documentUri: string;
        formatKind: MainEditorFormatKind;
        preferences: MainEditorPreferenceState;
      };
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspCompletion';
      payload: MainEditorLspCompletionRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspHover';
      payload: MainEditorLspHoverRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspDefinition';
      payload: MainEditorLspDefinitionRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspReferences';
      payload: MainEditorReferencesRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspPrepareRename';
      payload: MainEditorPrepareRenameRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspRename';
      payload: MainEditorRenameRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspCodeLens';
      payload: MainEditorCodeLensRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspWorkspaceSymbols';
      payload: MainEditorWorkspaceSymbolsRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/lspRevealLocation';
      payload: MainEditorRevealLocationRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/previewRequest';
      payload: MainEditorPreviewRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/previewRuntimeRequest';
      payload: MainEditorPreviewRuntimeRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/formatPreviewRequest';
      payload: MainEditorFormatPreviewRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/simulatorProfileListRequest';
      payload: MainEditorSimulatorProfileListRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/simulatorProfileSaveRequest';
      payload: MainEditorSimulatorProfileSaveRequestPayload;
    }
  | {
      protocol: typeof MAIN_EDITOR_PROTOCOL;
      version: typeof MAIN_EDITOR_PROTOCOL_VERSION;
      type: 'main-editor/variableCandidatesRequest';
      payload: MainEditorVariableCandidatesRequestPayload;
    };

/**
 * detectMainEditorFormat 함수.
 * 파일 경로 확장자를 Phase 1 main editor 포맷 정의로 매핑함.
 *
 * @param filePath - 판별할 로컬 파일 경로
 * @returns 지원 포맷이면 정의, 아니면 null
 */
export function detectMainEditorFormat(filePath: string): MainEditorFormatDefinition | null {
  const extension = path.extname(filePath).toLowerCase();
  return MAIN_EDITOR_FORMATS.find((format) => format.extension === extension) ?? null;
}

/**
 * getMainEditorPreferenceKey 함수.
 * workspaceState에 저장할 포맷별 preference key를 만듦.
 *
 * @param formatKind - preference를 나눌 main editor 포맷
 * @returns workspaceState key
 */
export function getMainEditorPreferenceKey(formatKind: MainEditorFormatKind): string {
  return `mainEditor.${formatKind}.preferences`;
}

/**
 * createDefaultMainEditorPreferences 함수.
 * Phase 1 shell에서 쓸 기본 UI preference skeleton을 만듦.
 *
 * @returns 기본 split/frontmatter/drawer preference
 */
export function createDefaultMainEditorPreferences(): MainEditorPreferenceState {
  return {
    splitRatio: 0.58,
    frontmatterOpen: true,
    drawerOpen: false,
  };
}

/**
 * normalizeMainEditorPreferences 함수.
 * 저장소나 message boundary에서 온 preference를 검증하고 invalid 값은 기본값으로 되돌림.
 *
 * @param value - 검증할 preference 후보
 * @returns 유효한 preference 또는 기본 preference
 */
export function normalizeMainEditorPreferences(value: unknown): MainEditorPreferenceState {
  return isMainEditorPreferenceState(value) ? value : createDefaultMainEditorPreferences();
}

/**
 * isMainEditorWebviewMessage 함수.
 * webview-origin message envelope와 payload shape를 검증함.
 *
 * @param message - 검증할 unknown message
 * @returns Phase 1 main editor webview message 여부
 */
export function isMainEditorWebviewMessage(message: unknown): message is MainEditorWebviewMessage {
  if (!isRecord(message)) return false;
  if (message.protocol !== MAIN_EDITOR_PROTOCOL || message.version !== MAIN_EDITOR_PROTOCOL_VERSION) return false;

  if (message.type === 'main-editor/ready') {
    return isRecord(message.payload) && typeof message.payload.documentUri === 'string';
  }

  if (message.type === 'main-editor/edit') {
    return isMainEditorEditPayload(message.payload);
  }

  if (message.type === 'main-editor/structuredEdit') {
    return isMainEditorStructuredEditPayload(message.payload);
  }

  if (message.type === 'main-editor/updatePreferences') {
    return (
      isRecord(message.payload) &&
      typeof message.payload.documentUri === 'string' &&
      isMainEditorFormatKind(message.payload.formatKind) &&
      isMainEditorPreferenceState(message.payload.preferences)
    );
  }

  if (message.type === 'main-editor/lspCompletion') {
    return isMainEditorLspCompletionRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspHover' || message.type === 'main-editor/lspDefinition') {
    return isMainEditorLspRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspReferences') {
    return isMainEditorReferencesRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspPrepareRename') {
    return isMainEditorPrepareRenameRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspRename') {
    return isMainEditorRenameRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspCodeLens') {
    return isMainEditorCodeLensRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspWorkspaceSymbols') {
    return isMainEditorWorkspaceSymbolsRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/lspRevealLocation') {
    return isMainEditorRevealLocationRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/previewRequest') {
    return isMainEditorPreviewRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/previewRuntimeRequest') {
    return isMainEditorPreviewRuntimeRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/formatPreviewRequest') {
    return isMainEditorFormatPreviewRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/simulatorProfileListRequest') {
    return isMainEditorSimulatorProfileListRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/simulatorProfileSaveRequest') {
    return isMainEditorSimulatorProfileSaveRequestPayload(message.payload);
  }

  if (message.type === 'main-editor/variableCandidatesRequest') {
    return isMainEditorVariableCandidatesRequestPayload(message.payload);
  }

  return false;
}

/**
 * isMainEditorEditMessage 함수.
 * main editor raw edit request만 좁혀 검증함.
 *
 * @param message - 검증할 unknown message
 * @returns edit request message 여부
 */
export function isMainEditorEditMessage(
  message: unknown,
): message is Extract<MainEditorWebviewMessage, { type: 'main-editor/edit' }> {
  return isMainEditorWebviewMessage(message) && message.type === 'main-editor/edit';
}

/**
 * isMainEditorStructuredEditMessage 함수.
 * main editor structured edit request만 좁혀 검증함.
 *
 * @param message - 검증할 unknown message
 * @returns structured edit request message 여부
 */
export function isMainEditorStructuredEditMessage(
  message: unknown,
): message is Extract<MainEditorWebviewMessage, { type: 'main-editor/structuredEdit' }> {
  return isMainEditorWebviewMessage(message) && message.type === 'main-editor/structuredEdit';
}

function isMainEditorEditPayload(value: unknown): value is MainEditorEditPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    typeof value.baseVersion === 'number' &&
    Number.isInteger(value.baseVersion) &&
    typeof value.nextText === 'string'
  );
}

function isMainEditorStructuredEditPayload(value: unknown): value is MainEditorStructuredEditPayload {
  if (!isRecord(value)) return false;
  if (typeof value.requestId !== 'string') return false;
  if (typeof value.documentUri !== 'string') return false;
  if (typeof value.baseVersion !== 'number' || !Number.isInteger(value.baseVersion)) return false;
  if (!isMainEditorFormatKind(value.formatKind)) return false;

  switch (value.formatKind) {
    case 'lorebook':
      return isLorebookStructuredEditState(value.state);
    case 'regex':
      return isRegexStructuredState(value.state);
    case 'prompt':
      return isPromptStructuredState(value.state);
    case 'html':
      return isHtmlStructuredState(value.state);
  }
}

function isMainEditorLspRequestPayload(value: unknown): value is MainEditorLspRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    typeof value.documentVersion === 'number' &&
    Number.isInteger(value.documentVersion) &&
    isMainEditorSectionName(value.sectionName) &&
    typeof value.contentVersion === 'number' &&
    Number.isInteger(value.contentVersion) &&
    isMainEditorMonacoPosition(value.position)
  );
}

function isMainEditorLspCompletionRequestPayload(value: unknown): value is MainEditorLspCompletionRequestPayload {
  return isMainEditorLspRequestPayload(value) && (!('triggerCharacter' in value) || typeof value.triggerCharacter === 'string');
}

function isMainEditorAdvancedLspBaseRequestPayload(value: unknown): value is MainEditorAdvancedLspBaseRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    isNonNegativeInteger(value.documentVersion) &&
    isMainEditorFormatKind(value.formatKind) &&
    isSectionAllowedForFormat(value.formatKind, value.sectionName)
  );
}

function isMainEditorReferencesRequestPayload(value: unknown): value is MainEditorReferencesRequestPayload {
  return (
    isRecord(value) &&
    isMainEditorAdvancedLspBaseRequestPayload(value) &&
    isMainEditorMonacoPosition(value.position) &&
    typeof value.includeDeclaration === 'boolean'
  );
}

function isMainEditorPrepareRenameRequestPayload(value: unknown): value is MainEditorPrepareRenameRequestPayload {
  return isRecord(value) && isMainEditorAdvancedLspBaseRequestPayload(value) && isMainEditorMonacoPosition(value.position);
}

function isMainEditorRenameRequestPayload(value: unknown): value is MainEditorRenameRequestPayload {
  return (
    isRecord(value) &&
    isMainEditorAdvancedLspBaseRequestPayload(value) &&
    isMainEditorMonacoPosition(value.position) &&
    typeof value.newName === 'string' &&
    value.newName.trim().length > 0
  );
}

function isMainEditorCodeLensRequestPayload(value: unknown): value is MainEditorCodeLensRequestPayload {
  return isMainEditorAdvancedLspBaseRequestPayload(value);
}

function isMainEditorWorkspaceSymbolsRequestPayload(value: unknown): value is MainEditorWorkspaceSymbolsRequestPayload {
  return isRecord(value) && typeof value.requestId === 'string' && typeof value.query === 'string' && isPositiveInteger(value.limit);
}

function isMainEditorRevealLocationRequestPayload(value: unknown): value is MainEditorRevealLocationRequestPayload {
  return isRecord(value) && typeof value.requestId === 'string' && isMainEditorLocationPayload(value.location);
}

function isMainEditorLocationPayload(value: unknown): value is MainEditorLocationPayload {
  return isRecord(value) && typeof value.uri === 'string' && isMainEditorSourceRange(value.sourceRange);
}

function isMainEditorSourceRange(value: unknown): value is MainEditorSourceRangePayload {
  return (
    isRecord(value) &&
    isMainEditorSourcePosition(value.start) &&
    isMainEditorSourcePosition(value.end) &&
    (value.end.line > value.start.line || (value.end.line === value.start.line && value.end.character >= value.start.character))
  );
}

function isMainEditorSourcePosition(value: unknown): value is MainEditorSourcePositionPayload {
  return isRecord(value) && isNonNegativeInteger(value.line) && isNonNegativeInteger(value.character);
}

function isSectionAllowedForFormat(formatKind: unknown, sectionName: unknown): sectionName is MainEditorSectionName {
  if (formatKind === 'lorebook') return sectionName === 'CONTENT';
  if (formatKind === 'regex') return sectionName === 'IN' || sectionName === 'OUT';
  if (formatKind === 'prompt') return sectionName === 'TEXT' || sectionName === 'INNER_FORMAT' || sectionName === 'DEFAULT_TEXT';
  if (formatKind === 'html') return sectionName === 'FULL';
  return false;
}

function isMainEditorPreviewRequestPayload(value: unknown): value is MainEditorPreviewRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    typeof value.documentVersion === 'number' &&
    Number.isInteger(value.documentVersion) &&
    typeof value.contentVersion === 'number' &&
    Number.isInteger(value.contentVersion) &&
    value.formatKind === 'lorebook' &&
    value.sectionName === 'CONTENT' &&
    typeof value.contentText === 'string'
  );
}

function isMainEditorPreviewRuntimeRequestPayload(value: unknown): value is MainEditorPreviewRuntimeRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    typeof value.documentVersion === 'number' &&
    Number.isInteger(value.documentVersion) &&
    typeof value.contentVersion === 'number' &&
    Number.isInteger(value.contentVersion) &&
    value.formatKind === 'lorebook' &&
    value.sectionName === 'CONTENT' &&
    typeof value.contentText === 'string' &&
    isMainEditorVariableOverridesPayload(value.overrides) &&
    (!('profileId' in value) || typeof value.profileId === 'string')
  );
}

function isMainEditorFormatPreviewRequestPayload(value: unknown): value is MainEditorFormatPreviewRequestPayload {
  if (!isRecord(value)) return false;
  if (typeof value.requestId !== 'string') return false;
  if (typeof value.documentUri !== 'string') return false;
  if (!isNonNegativeInteger(value.documentVersion)) return false;
  if (!isMainEditorFormatSectionName(value.sectionName)) return false;
  if (typeof value.activeProfileId !== 'string') return false;
  if ('sampleInput' in value && typeof value.sampleInput !== 'string') return false;
  if ('profile' in value && !isSimulatorProfile(value.profile)) return false;

  if (value.formatKind === 'regex') return isRegexPreviewSectionName(value.sectionName) && isRegexStructuredState(value.state);
  if (value.formatKind === 'prompt') return isPromptPreviewSectionName(value.sectionName) && isPromptStructuredState(value.state);
  if (value.formatKind === 'html') return value.sectionName === 'FULL' && isHtmlStructuredState(value.state);
  return false;
}

function isMainEditorSimulatorProfileListRequestPayload(
  value: unknown,
): value is MainEditorSimulatorProfileListRequestPayload {
  return isRecord(value) && typeof value.requestId === 'string' && typeof value.documentUri === 'string';
}

function isMainEditorSimulatorProfileSaveRequestPayload(
  value: unknown,
): value is MainEditorSimulatorProfileSaveRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    isSimulatorProfile(value.profile) &&
    (!('activeProfileId' in value) || typeof value.activeProfileId === 'string')
  );
}

function isMainEditorVariableCandidatesRequestPayload(value: unknown): value is MainEditorVariableCandidatesRequestPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.documentUri === 'string' &&
    typeof value.documentVersion === 'number' &&
    Number.isInteger(value.documentVersion) &&
    typeof value.contentVersion === 'number' &&
    Number.isInteger(value.contentVersion) &&
    value.formatKind === 'lorebook' &&
    value.sectionName === 'CONTENT' &&
    isVariableCandidateScope(value.scope) &&
    Array.isArray(value.variableNames) &&
    value.variableNames.every((name) => typeof name === 'string')
  );
}

function isMainEditorVariableOverridesPayload(value: unknown): value is MainEditorVariableOverridesPayload {
  if (!isRecord(value)) return false;
  return (
    optionalStringRecord(value.chatVariables) &&
    optionalStringRecord(value.globalVariables) &&
    optionalBooleanRecord(value.toggleValues) &&
    optionalStringRecord(value.tempVariables)
  );
}

function optionalStringRecord(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string'));
}

function optionalBooleanRecord(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean'));
}

function isVariableCandidateScope(value: unknown): value is Exclude<MainEditorVariableSectionScope, 'usedHere'> {
  return value === 'workspace' || value === 'profiles' || value === 'traceContext';
}

export function isMainEditorMonacoPosition(value: unknown): value is MainEditorMonacoPositionPayload {
  return (
    isRecord(value) &&
    typeof value.lineNumber === 'number' &&
    Number.isInteger(value.lineNumber) &&
    value.lineNumber >= 1 &&
    typeof value.column === 'number' &&
    Number.isInteger(value.column) &&
    value.column >= 1
  );
}

export function isMainEditorMonacoRange(value: unknown): value is MainEditorMonacoRangePayload {
  if (!isRecord(value)) return false;
  const startLineNumber = value.startLineNumber;
  const startColumn = value.startColumn;
  const endLineNumber = value.endLineNumber;
  const endColumn = value.endColumn;
  if (!isPositiveInteger(startLineNumber) || !isPositiveInteger(startColumn) || !isPositiveInteger(endLineNumber) || !isPositiveInteger(endColumn)) {
    return false;
  }
  if (endLineNumber < startLineNumber) return false;
  return endLineNumber !== startLineNumber || endColumn >= startColumn;
}

function isLorebookStructuredEditState(value: unknown): value is LorebookStructuredEditState {
  return (
    isRecord(value) &&
    isStringRecord(value.frontmatter) &&
    Array.isArray(value.unknownFrontmatter) &&
    typeof value.keysText === 'string' &&
    typeof value.secondaryKeysText === 'string' &&
    typeof value.contentText === 'string' &&
    typeof value.hasSecondaryKeysSection === 'boolean'
  );
}

export function isRegexStructuredState(value: unknown): value is RegexStructuredState {
  return (
    isRecord(value) &&
    isPlainScalarRecord(value.frontmatter) &&
    typeof value.inText === 'string' &&
    typeof value.outText === 'string'
  );
}

export function isPromptStructuredState(value: unknown): value is PromptStructuredState {
  return (
    isRecord(value) &&
    isPlainScalarRecord(value.frontmatter) &&
    isMainEditorPromptType(value.type) &&
    isRecord(value.sections) &&
    Object.entries(value.sections).every(
      ([key, sectionValue]) =>
        (key === 'TEXT' || key === 'INNER_FORMAT' || key === 'DEFAULT_TEXT') && typeof sectionValue === 'string',
    )
  );
}

export function isHtmlStructuredState(value: unknown): value is HtmlStructuredState {
  return isRecord(value) && typeof value.contentText === 'string';
}

export function isSimulatorProfile(value: unknown): value is MainEditorSimulatorProfilePayload {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.trim().length === 0) return false;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return false;
  if (!isSimulatorProfileTarget(value.target)) return false;
  if (!isMainEditorVariableOverridesPayload(value.variables)) return false;
  if (!Array.isArray(value.chatHistory) || !value.chatHistory.every(isSimulatorChatMessage)) return false;
  return isRecord(value.htmlContext) && isHtmlDocumentUriList(value.htmlContext.enabledHtmlDocumentUris);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isPlainScalarRecord(value: unknown): value is Record<string, string | number | boolean | null> {
  return isRecord(value) && Object.values(value).every(isPlainScalarValue);
}

function isPlainScalarValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function isSimulatorProfileTarget(value: unknown): value is MainEditorSimulatorProfilePayload['target'] {
  return (
    isRecord(value) &&
    (!('characterId' in value) || isSafeProfileIdentifier(value.characterId)) &&
    Array.isArray(value.moduleIds) &&
    value.moduleIds.every(isSafeProfileIdentifier) &&
    (!('presetId' in value) || isSafeProfileIdentifier(value.presetId))
  );
}

function isSimulatorChatMessage(value: unknown): value is MainEditorSimulatorProfilePayload['chatHistory'][number] {
  return (
    isRecord(value) &&
    isSimulatorChatRole(value.role) &&
    typeof value.content === 'string' &&
    (!('timestamp' in value) || typeof value.timestamp === 'string')
  );
}

function isSafeProfileIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character === '/' || character === '\\');
}

function isHtmlDocumentUriList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isHtmlDocumentUri);
}

function isHtmlDocumentUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const uri = new URL(value);
    return (uri.protocol === 'file:' || uri.protocol === 'untitled:') && uri.pathname.endsWith('.risuhtml');
  } catch {
    return false;
  }
}

function isSimulatorChatRole(value: unknown): value is 'user' | 'assistant' | 'system' | 'bot' {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'bot';
}

function isMainEditorFormatKind(value: unknown): value is MainEditorFormatKind {
  return value === 'lorebook' || value === 'regex' || value === 'prompt' || value === 'html';
}

function isMainEditorSectionName(value: unknown): value is MainEditorSectionName {
  return (
    value === 'CONTENT' ||
    value === 'KEYS' ||
    value === 'SECONDARY_KEYS' ||
    value === 'IN' ||
    value === 'OUT' ||
    value === 'TEXT' ||
    value === 'INNER_FORMAT' ||
    value === 'DEFAULT_TEXT' ||
    value === 'FULL'
  );
}

function isMainEditorFormatSectionName(value: unknown): value is MainEditorFormatSectionName {
  return value === 'IN' || value === 'OUT' || value === 'TEXT' || value === 'INNER_FORMAT' || value === 'DEFAULT_TEXT' || value === 'FULL';
}

function isRegexPreviewSectionName(value: MainEditorFormatSectionName): boolean {
  return value === 'IN' || value === 'OUT';
}

function isPromptPreviewSectionName(value: MainEditorFormatSectionName): boolean {
  return value === 'TEXT' || value === 'INNER_FORMAT' || value === 'DEFAULT_TEXT';
}

function isMainEditorPromptType(value: unknown): value is MainEditorPromptType {
  return (
    value === 'plain' ||
    value === 'jailbreak' ||
    value === 'cot' ||
    value === 'chatML' ||
    value === 'persona' ||
    value === 'description' ||
    value === 'lorebook' ||
    value === 'postEverything' ||
    value === 'memory' ||
    value === 'authornote' ||
    value === 'chat' ||
    value === 'cache'
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isMainEditorPreferenceState(value: unknown): value is MainEditorPreferenceState {
  return (
    isRecord(value) &&
    typeof value.splitRatio === 'number' &&
    Number.isFinite(value.splitRatio) &&
    value.splitRatio >= 0.2 &&
    value.splitRatio <= 0.8 &&
    typeof value.frontmatterOpen === 'boolean' &&
    typeof value.drawerOpen === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
