/**
 * Artifact Browser webview-side message and card types.
 * @file packages/webview/src/lib/types.ts
 */

import type {
  MainEditorAdvancedLspErrorPayload,
  MainEditorCodeLensRequestPayload,
  MainEditorCodeLensResultPayload,
  MainEditorDocumentSnapshotPayload,
  MainEditorEditAppliedPayload,
  MainEditorEditPayload,
  MainEditorErrorPayload,
  MainEditorFormatPreviewRequestPayload,
  MainEditorFormatPreviewResultPayload,
  MainEditorInitPayload,
  MainEditorDiagnosticsUpdatePayload,
  MainEditorLspCompletionRequestPayload,
  MainEditorLspCompletionResponsePayload,
  MainEditorLspDefinitionRequestPayload,
  MainEditorLspDefinitionResponsePayload,
  MainEditorLspErrorPayload,
  MainEditorLspHoverRequestPayload,
  MainEditorLspHoverResponsePayload,
  MainEditorPrepareRenameRequestPayload,
  MainEditorPrepareRenameResultPayload,
  MainEditorPreviewRequestPayload,
  MainEditorPreviewResultPayload,
  MainEditorPreviewRuntimeRequestPayload,
  MainEditorPreviewRuntimeResultPayload,
  MainEditorReadyPayload,
  MainEditorRevealLocationRequestPayload,
  MainEditorReferencesRequestPayload,
  MainEditorReferencesResultPayload,
  MainEditorRenameRequestPayload,
  MainEditorRenameResultPayload,
  MainEditorSimulatorProfileListRequestPayload,
  MainEditorSimulatorProfileListResultPayload,
  MainEditorSimulatorProfileSaveRequestPayload,
  MainEditorSimulatorProfileSaveResultPayload,
  MainEditorStructuredEditPayload,
  MainEditorUpdatePreferencesPayload,
  MainEditorVariableCandidatesRequestPayload,
  MainEditorVariableCandidatesResultPayload,
  MainEditorWorkspaceSymbolsRequestPayload,
  MainEditorWorkspaceSymbolsResultPayload,
} from './types/mainEditor';
import type {
  MarkerEditorErrorPayload,
  MarkerEditorImageSelectedPayload,
  MarkerEditorInitPayload,
  MarkerEditorReadyPayload,
  MarkerEditorResetRequestPayload,
  MarkerEditorResetResponsePayload,
  MarkerEditorSavePayload,
  MarkerEditorSavedPayload,
  MarkerEditorSelectImagePayload,
} from './types/markerEditor';

export const ARTIFACT_BROWSER_PROTOCOL = 'risu-workbench.artifact-browser';
export const ARTIFACT_BROWSER_PROTOCOL_VERSION = 1;
export const ARTIFACT_BROWSER_VIEW_ID = 'risuWorkbench.cards';
export const MARKER_EDITOR_PROTOCOL = 'risu-workbench.marker-editor';
export const MARKER_EDITOR_PROTOCOL_VERSION = 1;
export const MAIN_EDITOR_PROTOCOL = 'risu-workbench.main-editor';
export const MAIN_EDITOR_PROTOCOL_VERSION = 1;

export type ArtifactBrowserProtocol = typeof ARTIFACT_BROWSER_PROTOCOL;
export type ArtifactBrowserProtocolVersion = typeof ARTIFACT_BROWSER_PROTOCOL_VERSION;
export type MarkerEditorProtocol = typeof MARKER_EDITOR_PROTOCOL;
export type MarkerEditorProtocolVersion = typeof MARKER_EDITOR_PROTOCOL_VERSION;
export type MainEditorProtocol = typeof MAIN_EDITOR_PROTOCOL;
export type MainEditorProtocolVersion = typeof MAIN_EDITOR_PROTOCOL_VERSION;
export type WebviewMessageProtocol = ArtifactBrowserProtocol | MarkerEditorProtocol | MainEditorProtocol;
export type WebviewMessageProtocolVersion =
  | ArtifactBrowserProtocolVersion
  | MarkerEditorProtocolVersion
  | MainEditorProtocolVersion;
export type BrowserArtifactKind = 'character' | 'module';
export type BrowserArtifactStatus = 'ready' | 'warning' | 'invalid';
export type CharacterSourceFormat = 'charx' | 'png' | 'json' | 'scaffold';
export type ModuleSourceFormat = 'risum' | 'json' | 'scaffold' | 'unknown';
export type CharacterSectionKind = 'manifest' | 'lorebooks' | 'regexRules' | 'html' | 'lua' | 'diagnostics';
export type BrowserSectionKind = CharacterSectionKind | 'toggle' | 'variables';
export type BrowserItemType =
  | 'manifest'
  | 'image'
  | 'json'
  | 'charx'
  | 'risutext'
  | 'risulorebook'
  | 'risuregex'
  | 'risulua'
  | 'risuhtml'
  | 'risutoggle'
  | 'risuvar'
  | 'png'
  | 'markdown'
  | 'regex'
  | 'diagnostic'
  | 'unknown';
export type CharacterItemType = BrowserItemType;

export interface MessageEnvelope<TType extends string, TPayload> {
  protocol: WebviewMessageProtocol;
  version: WebviewMessageProtocolVersion;
  type: TType;
  payload: TPayload;
}

export type CharacterBrowserStatus = BrowserArtifactStatus;

export interface CharacterManifestFlags {
  utilityBot: boolean;
  lowLevelAccess: boolean;
}

export interface ModuleBrowserFlags {
  lowLevelAccess: boolean;
  hideIcon: boolean;
  hasCjs: boolean;
  hasMcp: boolean;
}

export interface ManifestParseWarning {
  code: string;
  field?: string;
  message: string;
}

export interface CharacterBrowserCard {
  artifactKind: 'character';
  stableId: string;
  manifestId: string;
  name: string;
  creator: string;
  characterVersion: string;
  sourceFormat: CharacterSourceFormat | 'unknown';
  imageUri?: string;
  status: CharacterBrowserStatus;
  tags: string[];
  flags: CharacterManifestFlags;
  markerUri: string;
  rootUri: string;
  imagePath?: string | null;
  rootPathLabel: string;
  markerPathLabel: string;
  createdAtLabel?: string;
  modifiedAtLabel?: string;
  warnings: ManifestParseWarning[];
}

export interface ModuleBrowserCard {
  artifactKind: 'module';
  stableId: string;
  manifestId: string;
  name: string;
  description: string;
  sourceFormat: ModuleSourceFormat;
  namespace?: string;
  imageUri?: string;
  imagePath?: string | null;
  status: BrowserArtifactStatus;
  flags: ModuleBrowserFlags;
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel: string;
  warnings: ManifestParseWarning[];
}

export type BrowserArtifactCard = CharacterBrowserCard | ModuleBrowserCard;

export interface BrowserItem {
  id: string;
  label: string;
  type: BrowserItemType;
  fileUri?: string;
  relativePath?: string;
  description?: string;
  extension?: string;
  source?: 'manifest' | 'scanner' | 'diagnostics';
}

export type CharacterItem = BrowserItem;

export interface BrowserSection {
  id: string;
  label: string;
  kind: BrowserSectionKind;
  count: number;
  items: BrowserItem[];
}

export type CharacterSection = BrowserSection;

export interface ArtifactBrowserReadyPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserRefreshPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserSelectPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenItemPayload {
  stableId: string;
  itemId: string;
}

export interface ArtifactBrowserCardsPayload {
  generatedAt: string;
  cards: BrowserArtifactCard[];
  selectedStableId?: string;
}

export interface ArtifactBrowserDetailPayload {
  generatedAt: string;
  stableId: string;
  sections: BrowserSection[];
}

export type ArtifactBrowserReadyMessage = MessageEnvelope<
  'artifact-browser/ready',
  ArtifactBrowserReadyPayload
>;

export type ArtifactBrowserCardsMessage = MessageEnvelope<
  'artifact-browser/cards',
  ArtifactBrowserCardsPayload
>;

export type ArtifactBrowserRefreshMessage = MessageEnvelope<
  'artifact-browser/refresh',
  ArtifactBrowserRefreshPayload
>;

export type ArtifactBrowserSelectMessage = MessageEnvelope<
  'artifact-browser/select',
  ArtifactBrowserSelectPayload
>;

export type ArtifactBrowserOpenItemMessage = MessageEnvelope<
  'artifact-browser/openItem',
  ArtifactBrowserOpenItemPayload
>;

export type ArtifactBrowserDetailMessage = MessageEnvelope<
  'artifact-browser/detailLoaded',
  ArtifactBrowserDetailPayload
>;

export type ArtifactBrowserWebviewMessage =
  | ArtifactBrowserReadyMessage
  | ArtifactBrowserRefreshMessage
  | ArtifactBrowserSelectMessage
  | ArtifactBrowserOpenItemMessage;
export type ArtifactBrowserExtensionMessage = ArtifactBrowserCardsMessage | ArtifactBrowserDetailMessage;

export type MarkerEditorReadyMessage = MessageEnvelope<'marker-editor/ready', MarkerEditorReadyPayload>;

export type MarkerEditorSaveMessage = MessageEnvelope<'marker-editor/save', MarkerEditorSavePayload>;

export type MarkerEditorResetRequestMessage = MessageEnvelope<
  'marker-editor/reset',
  MarkerEditorResetRequestPayload
>;

export type MarkerEditorSelectImageMessage = MessageEnvelope<
  'marker-editor/selectImage',
  MarkerEditorSelectImagePayload
>;

export type MarkerEditorInitMessage = MessageEnvelope<'marker-editor/init', MarkerEditorInitPayload>;

export type MarkerEditorSavedMessage = MessageEnvelope<'marker-editor/saved', MarkerEditorSavedPayload>;

export type MarkerEditorResetResponseMessage = MessageEnvelope<
  'marker-editor/reset',
  MarkerEditorResetResponsePayload
>;

export type MarkerEditorImageSelectedMessage = MessageEnvelope<
  'marker-editor/imageSelected',
  MarkerEditorImageSelectedPayload
>;

export type MarkerEditorErrorMessage = MessageEnvelope<'marker-editor/error', MarkerEditorErrorPayload>;

export type MainEditorReadyMessage = MessageEnvelope<'main-editor/ready', MainEditorReadyPayload>;

export type MainEditorEditMessage = MessageEnvelope<'main-editor/edit', MainEditorEditPayload>;

export type MainEditorStructuredEditMessage = MessageEnvelope<
  'main-editor/structuredEdit',
  MainEditorStructuredEditPayload
>;

export type MainEditorUpdatePreferencesMessage = MessageEnvelope<
  'main-editor/updatePreferences',
  MainEditorUpdatePreferencesPayload
>;

export type MainEditorInitMessage = MessageEnvelope<'main-editor/init', MainEditorInitPayload>;

export type MainEditorDocumentChangedMessage = MessageEnvelope<
  'main-editor/documentChanged',
  MainEditorDocumentSnapshotPayload
>;

export type MainEditorEditAppliedMessage = MessageEnvelope<'main-editor/editApplied', MainEditorEditAppliedPayload>;

export type MainEditorErrorMessage = MessageEnvelope<'main-editor/error', MainEditorErrorPayload>;

export type MainEditorLspCompletionRequestMessage = MessageEnvelope<
  'main-editor/lspCompletion',
  MainEditorLspCompletionRequestPayload
>;

export type MainEditorLspHoverRequestMessage = MessageEnvelope<'main-editor/lspHover', MainEditorLspHoverRequestPayload>;

export type MainEditorLspDefinitionRequestMessage = MessageEnvelope<
  'main-editor/lspDefinition',
  MainEditorLspDefinitionRequestPayload
>;

export type MainEditorLspReferencesRequestMessage = MessageEnvelope<
  'main-editor/lspReferences',
  MainEditorReferencesRequestPayload
>;

export type MainEditorLspPrepareRenameRequestMessage = MessageEnvelope<
  'main-editor/lspPrepareRename',
  MainEditorPrepareRenameRequestPayload
>;

export type MainEditorLspRenameRequestMessage = MessageEnvelope<'main-editor/lspRename', MainEditorRenameRequestPayload>;

export type MainEditorLspCodeLensRequestMessage = MessageEnvelope<'main-editor/lspCodeLens', MainEditorCodeLensRequestPayload>;

export type MainEditorLspWorkspaceSymbolsRequestMessage = MessageEnvelope<
  'main-editor/lspWorkspaceSymbols',
  MainEditorWorkspaceSymbolsRequestPayload
>;

export type MainEditorLspRevealLocationRequestMessage = MessageEnvelope<
  'main-editor/lspRevealLocation',
  MainEditorRevealLocationRequestPayload
>;

export type MainEditorPreviewRequestMessage = MessageEnvelope<'main-editor/previewRequest', MainEditorPreviewRequestPayload>;

export type MainEditorPreviewRuntimeRequestMessage = MessageEnvelope<
  'main-editor/previewRuntimeRequest',
  MainEditorPreviewRuntimeRequestPayload
>;

export type MainEditorFormatPreviewRequestMessage = MessageEnvelope<
  'main-editor/formatPreviewRequest',
  MainEditorFormatPreviewRequestPayload
>;

export type MainEditorSimulatorProfileListRequestMessage = MessageEnvelope<
  'main-editor/simulatorProfileListRequest',
  MainEditorSimulatorProfileListRequestPayload
>;

export type MainEditorSimulatorProfileSaveRequestMessage = MessageEnvelope<
  'main-editor/simulatorProfileSaveRequest',
  MainEditorSimulatorProfileSaveRequestPayload
>;

export type MainEditorVariableCandidatesRequestMessage = MessageEnvelope<
  'main-editor/variableCandidatesRequest',
  MainEditorVariableCandidatesRequestPayload
>;

export type MainEditorLspCompletionResponseMessage = MessageEnvelope<
  'main-editor/lspCompletionResult',
  MainEditorLspCompletionResponsePayload
>;

export type MainEditorLspHoverResponseMessage = MessageEnvelope<'main-editor/lspHoverResult', MainEditorLspHoverResponsePayload>;

export type MainEditorLspDefinitionResponseMessage = MessageEnvelope<
  'main-editor/lspDefinitionResult',
  MainEditorLspDefinitionResponsePayload
>;

export type MainEditorLspErrorMessage = MessageEnvelope<'main-editor/lspError', MainEditorLspErrorPayload>;

export type MainEditorLspReferencesResultMessage = MessageEnvelope<
  'main-editor/lspReferencesResult',
  MainEditorReferencesResultPayload
>;

export type MainEditorLspPrepareRenameResultMessage = MessageEnvelope<
  'main-editor/lspPrepareRenameResult',
  MainEditorPrepareRenameResultPayload
>;

export type MainEditorLspRenameResultMessage = MessageEnvelope<'main-editor/lspRenameResult', MainEditorRenameResultPayload>;

export type MainEditorLspCodeLensResultMessage = MessageEnvelope<'main-editor/lspCodeLensResult', MainEditorCodeLensResultPayload>;

export type MainEditorLspWorkspaceSymbolsResultMessage = MessageEnvelope<
  'main-editor/lspWorkspaceSymbolsResult',
  MainEditorWorkspaceSymbolsResultPayload
>;

export type MainEditorLspAdvancedErrorMessage = MessageEnvelope<
  'main-editor/lspAdvancedError',
  MainEditorAdvancedLspErrorPayload
>;

export type MainEditorDiagnosticsUpdateMessage = MessageEnvelope<
  'main-editor/diagnosticsUpdate',
  MainEditorDiagnosticsUpdatePayload
>;

export type MainEditorPreviewResultMessage = MessageEnvelope<'main-editor/previewResult', MainEditorPreviewResultPayload>;

export type MainEditorPreviewRuntimeResultMessage = MessageEnvelope<
  'main-editor/previewRuntimeResult',
  MainEditorPreviewRuntimeResultPayload
>;

export type MainEditorFormatPreviewResultMessage = MessageEnvelope<
  'main-editor/formatPreviewResult',
  MainEditorFormatPreviewResultPayload
>;

export type MainEditorSimulatorProfileListResultMessage = MessageEnvelope<
  'main-editor/simulatorProfileListResult',
  MainEditorSimulatorProfileListResultPayload
>;

export type MainEditorSimulatorProfileSaveResultMessage = MessageEnvelope<
  'main-editor/simulatorProfileSaveResult',
  MainEditorSimulatorProfileSaveResultPayload
>;

export type MainEditorVariableCandidatesResultMessage = MessageEnvelope<
  'main-editor/variableCandidatesResult',
  MainEditorVariableCandidatesResultPayload
>;

export type MarkerEditorWebviewMessage =
  | MarkerEditorReadyMessage
  | MarkerEditorSaveMessage
  | MarkerEditorResetRequestMessage
  | MarkerEditorSelectImageMessage;

export type MarkerEditorExtensionMessage =
  | MarkerEditorInitMessage
  | MarkerEditorSavedMessage
  | MarkerEditorResetResponseMessage
  | MarkerEditorImageSelectedMessage
  | MarkerEditorErrorMessage;

export type MainEditorWebviewMessage =
  | MainEditorReadyMessage
  | MainEditorEditMessage
  | MainEditorStructuredEditMessage
  | MainEditorUpdatePreferencesMessage
  | MainEditorLspCompletionRequestMessage
  | MainEditorLspHoverRequestMessage
  | MainEditorLspDefinitionRequestMessage
  | MainEditorLspReferencesRequestMessage
  | MainEditorLspPrepareRenameRequestMessage
  | MainEditorLspRenameRequestMessage
  | MainEditorLspCodeLensRequestMessage
  | MainEditorLspWorkspaceSymbolsRequestMessage
  | MainEditorLspRevealLocationRequestMessage
  | MainEditorPreviewRequestMessage
  | MainEditorPreviewRuntimeRequestMessage
  | MainEditorFormatPreviewRequestMessage
  | MainEditorSimulatorProfileListRequestMessage
  | MainEditorSimulatorProfileSaveRequestMessage
  | MainEditorVariableCandidatesRequestMessage;

export type MainEditorExtensionMessage =
  | MainEditorInitMessage
  | MainEditorDocumentChangedMessage
  | MainEditorEditAppliedMessage
  | MainEditorErrorMessage
  | MainEditorLspCompletionResponseMessage
  | MainEditorLspHoverResponseMessage
  | MainEditorLspDefinitionResponseMessage
  | MainEditorLspErrorMessage
  | MainEditorLspReferencesResultMessage
  | MainEditorLspPrepareRenameResultMessage
  | MainEditorLspRenameResultMessage
  | MainEditorLspCodeLensResultMessage
  | MainEditorLspWorkspaceSymbolsResultMessage
  | MainEditorLspAdvancedErrorMessage
  | MainEditorDiagnosticsUpdateMessage
  | MainEditorPreviewResultMessage
  | MainEditorPreviewRuntimeResultMessage
  | MainEditorFormatPreviewResultMessage
  | MainEditorSimulatorProfileListResultMessage
  | MainEditorSimulatorProfileSaveResultMessage
  | MainEditorVariableCandidatesResultMessage;
