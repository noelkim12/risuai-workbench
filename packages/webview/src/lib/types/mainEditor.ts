/**
 * Main Editor webview-side state and message payload types.
 * @file packages/webview/src/lib/types/mainEditor.ts
 */

export type MainEditorFormatKind = 'lorebook' | 'regex' | 'prompt' | 'html';
export type MainEditorLanguageId = 'risulorebook' | 'risuregex' | 'risuprompt' | 'risuhtml';
export type MainEditorSectionName = 'CONTENT' | 'KEYS' | 'SECONDARY_KEYS' | 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';
export type MainEditorPromptType = 'plain' | 'jailbreak' | 'cot' | 'chatML' | 'persona' | 'description' | 'lorebook' | 'postEverything' | 'memory' | 'authornote' | 'chat' | 'cache';
export type MainEditorFormatSectionName = 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';

export interface MainEditorPreferenceState {
  splitRatio: number;
  frontmatterOpen: boolean;
  drawerOpen: boolean;
}

export interface MainEditorDocumentSnapshotPayload {
  documentUri: string;
  documentDisplayPath: string;
  documentVersion: number;
  formatKind: MainEditorFormatKind;
  languageId: MainEditorLanguageId;
  rawText: string;
  model: MainEditorDocumentModelPayload;
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

export interface MainEditorInitPayload extends MainEditorDocumentSnapshotPayload {
  preferences: MainEditorPreferenceState;
}

export interface MainEditorReadyPayload {
  documentUri: string;
}

export interface MainEditorEditPayload {
  requestId: string;
  documentUri: string;
  baseVersion: number;
  nextText: string;
}

export interface MainEditorStructuredEditPayload {
  requestId: string;
  documentUri: string;
  baseVersion: number;
  formatKind: MainEditorFormatKind;
  state: unknown;
}

export interface MainEditorUpdatePreferencesPayload {
  documentUri: string;
  formatKind: MainEditorFormatKind;
  preferences: MainEditorPreferenceState;
}

export interface MainEditorEditAppliedPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
}

export interface MainEditorErrorPayload {
  code: string;
  message: string;
  requestId?: string;
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

export interface MainEditorWorkspaceEditPayload {
  editId: string;
  summary: string;
  affectedUris: string[];
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

export interface MainEditorRegexStructuredStatePayload {
  frontmatter: Record<string, unknown>;
  inText: string;
  outText: string;
}

export interface MainEditorPromptStructuredStatePayload {
  frontmatter: Record<string, unknown>;
  type: MainEditorPromptType;
  sections: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>>;
}

export interface MainEditorHtmlStructuredStatePayload {
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

export interface MainEditorFormatPreviewRequestPayload {
  requestId: string;
  documentUri: string;
  documentVersion: number;
  sectionName: MainEditorFormatSectionName;
  activeProfileId: string;
  sampleInput?: string;
  profile?: MainEditorSimulatorProfilePayload;
  formatKind: 'regex' | 'prompt' | 'html';
  state: MainEditorRegexStructuredStatePayload | MainEditorPromptStructuredStatePayload | MainEditorHtmlStructuredStatePayload;
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
