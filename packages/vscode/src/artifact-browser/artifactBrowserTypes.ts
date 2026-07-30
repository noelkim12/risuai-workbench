/**
 * Artifact Browser sidebar message contract and manifest-backed card model.
 * @file packages/vscode/src/artifact-browser/artifactBrowserTypes.ts
 */

import type { AnalysisShowcase } from '@risuai-workbench/core';

export const ARTIFACT_BROWSER_PROTOCOL = 'risu-workbench.artifact-browser';
export const ARTIFACT_BROWSER_PROTOCOL_VERSION = 1;
export const ARTIFACT_BROWSER_VIEW_ID = 'risuaiWorkbench.cards';
export const MARKER_EDITOR_PROTOCOL = 'risu-workbench.marker-editor';
export const MARKER_EDITOR_PROTOCOL_VERSION = 1;

export type ArtifactBrowserProtocol = typeof ARTIFACT_BROWSER_PROTOCOL;
export type ArtifactBrowserProtocolVersion = typeof ARTIFACT_BROWSER_PROTOCOL_VERSION;
export type MarkerEditorProtocol = typeof MARKER_EDITOR_PROTOCOL;
export type MarkerEditorProtocolVersion = typeof MARKER_EDITOR_PROTOCOL_VERSION;
export type WebviewMessageProtocol = ArtifactBrowserProtocol | MarkerEditorProtocol;
export type WebviewMessageProtocolVersion = ArtifactBrowserProtocolVersion | MarkerEditorProtocolVersion;

/**
 * MessageEnvelope interface.
 * Versioned bridge envelope shared by extension-host and webview messages.
 *
 * @param TType - Stable protocol message type identifier
 * @param TPayload - Message-specific payload shape
 */
export interface MessageEnvelope<TType extends string, TPayload> {
  protocol: WebviewMessageProtocol;
  version: WebviewMessageProtocolVersion;
  type: TType;
  payload: TPayload;
}

export type BrowserArtifactKind = 'character' | 'module' | 'plugin';
export type BrowserArtifactStatus = 'ready' | 'warning' | 'invalid';
export type CharacterSourceFormat = 'charx' | 'png' | 'json' | 'scaffold';
export type ModuleSourceFormat = 'risum' | 'json' | 'scaffold' | 'unknown';
export type PluginFramework = 'vanilla' | 'svelte';
export type CharacterBrowserStatus = BrowserArtifactStatus;
export type CharacterSectionKind =
  | 'manifest'
  | 'character'
  | 'lorebooks'
  | 'regexRules'
  | 'html'
  | 'lua'
  | 'assets'
  | 'diagnostics';
export type BrowserSectionKind = CharacterSectionKind | 'toggle' | 'variables';
export type ArtifactBrowserCreateSectionKind = Extract<BrowserSectionKind, 'lorebooks' | 'regexRules' | 'lua' | 'character'>;
export type ArtifactBrowserCreateSectionEntryKind = 'folder' | 'file';
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

export type ManifestParseWarningCode =
  | 'missingRequiredField'
  | 'missingOptionalField'
  | 'legacyNumericTimestamp'
  | 'invalidDateTime'
  | 'emptyManifestId'
  | 'missingImageFile'
  | 'unknownSchemaVersion'
  | 'invalidSourceFormat'
  | 'invalidKind'
  | 'invalidFlagType'
  | 'invalidJson'
  | 'readError'
  | 'conflictingRootMarkers';

export interface ManifestParseWarning {
  code: ManifestParseWarningCode;
  field?: string;
  message: string;
}

export interface RisucharManifestRaw {
  $schema?: string;
  kind: unknown;
  schemaVersion: unknown;
  id: unknown;
  name: unknown;
  creator: unknown;
  characterVersion: unknown;
  createdAt: string | number | null | unknown;
  modifiedAt: string | number | null | unknown;
  sourceFormat: unknown;
  image?: unknown;
  tags?: unknown;
  flags: unknown;
  [key: string]: unknown;
}

export interface RisucharManifestNormalized {
  stableId: string;
  manifestId: string;
  name: string;
  creator: string;
  characterVersion: string;
  createdAt: string | null;
  modifiedAt: string | null;
  sourceFormat: CharacterSourceFormat | 'unknown';
  imagePath?: string | null;
  tags: string[];
  flags: CharacterManifestFlags;
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel: string;
  parseWarnings: ManifestParseWarning[];
  extra: Record<string, unknown>;
  valid: boolean;
}

/**
 * CharacterBrowserCard interface.
 * Manifest-backed card summary sent from the extension host.
 */
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
  analysisProfile: BrowserAnalysisProfile;
}

/**
 * ModuleBrowserCard interface.
 * Module marker-backed card summary without character-only metadata requirements.
 */
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
  analysisProfile: BrowserAnalysisProfile;
}

/**
 * PluginBrowserCard interface.
 * `.risuplugin` marker-backed plugin project card. MVP: list/selection only - no detail view.
 */
export interface PluginBrowserCard {
  artifactKind: 'plugin';
  stableId: string;
  manifestId: string;
  name: string;
  description: string;
  framework: PluginFramework | 'unknown';
  iconUri?: string;
  status: BrowserArtifactStatus;
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel: string;
  warnings: ManifestParseWarning[];
  analysisProfile: BrowserAnalysisProfile;
}

export type BrowserArtifactCard = CharacterBrowserCard | ModuleBrowserCard | PluginBrowserCard;

/**
 * CharacterItem interface.
 * Detail view에서 파일 또는 진단 항목 하나를 안정적으로 참조함.
 */
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

export interface BrowserTreeNode {
  id: string;
  label: string;
  kind: 'folder' | 'item';
  relativePath?: string;
  treePath?: string;
  lorebookPath?: string;
  description?: string;
  detailDescription?: string;
  item?: BrowserItem;
  children?: BrowserTreeNode[];
}

/**
 * CharacterSection interface.
 * Detail view accordion이 렌더링할 character 관련 항목 그룹.
 */
export interface BrowserSection {
  id: string;
  label: string;
  kind: BrowserSectionKind;
  count: number;
  items: BrowserItem[];
  tree?: BrowserTreeNode[];
}

export type CharacterSection = BrowserSection;

export type BrowserAnalysisProfile =
  | { readonly kind: 'none' }
  | { readonly kind: 'legacy'; readonly reportAvailable: true }
  | { readonly kind: 'invalid'; readonly reason: 'malformed' | 'unsupported-version' | 'artifact-mismatch' }
  | {
      readonly kind: 'available';
      readonly freshness: 'fresh' | 'outdated';
      readonly reportAvailable: boolean;
      readonly showcase: AnalysisShowcase;
    };

export interface ArtifactBrowserReadyPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserRefreshPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export type ArtifactBrowserCreateArtifactKind = 'charx' | 'module' | 'plugin';

export interface ArtifactBrowserCreateArtifactPayload {
  kind: ArtifactBrowserCreateArtifactKind;
  name: string;
  creator?: string;
  tags?: string[];
  utilityBot?: boolean;
  lowLevelAccess?: boolean;
  description?: string;
  framework?: PluginFramework;
}

export interface ArtifactBrowserImportArtifactPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
  fileName?: string;
  dataBase64?: string;
}

export interface ArtifactBrowserImportArtifactChunkPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
  transferId: string;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  chunkBase64: string;
}

export interface ArtifactBrowserPackArtifactPayload {
  stableId: string;
  recovery: boolean;
}

export interface ArtifactBrowserHmrStartBroadcastPayload {
  stableId: string;
}

export type ArtifactBrowserHmrStopBroadcastPayload = Record<string, never>;

export type ArtifactBrowserHmrSavePluginPayload = Record<string, never>;

export type ArtifactBrowserHmrOpenSavedPluginPayload = Record<string, never>;

export type ArtifactBrowserHmrSaveCompletedPayload =
  | { readonly kind: 'saved' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string };

export interface ArtifactBrowserHmrStatusPayload {
  running: boolean;
  stableId?: string;
  artifactName?: string;
  artifactKind?: 'character' | 'module';
  connectionString?: string;
  version?: number;
  updateCount: number;
  lastPollAtMs?: number;
  lastError?: string;
}

export interface ArtifactBrowserAnalyzeArtifactPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenAssetManagerPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenMarkerEditorPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenPluginViewerPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenAnalysisShowcasePayload {
  stableId: string;
}

export interface ArtifactBrowserShareAnalysisShowcasePayload {
  stableId: string;
}

export interface ArtifactBrowserOpenAnalysisReportPayload {
  stableId: string;
}

export interface ArtifactBrowserPackCompletedPayload {
  stableId: string;
  ok: boolean;
  outputPath?: string;
  outputRelativePath?: string;
  error?: string;
}

export interface ArtifactBrowserOpenPackedOutputPayload {
  stableId: string;
  destination: 'os' | 'explorer' | 'clipboard';
}

export interface ArtifactBrowserSelectPayload {
  stableId: string;
}

export interface ArtifactBrowserOpenItemPayload {
  stableId: string;
  itemId: string;
}

export interface ArtifactBrowserMoveLorebookItemPayload {
  stableId: string;
  itemId: string;
  targetFolderPath: string | null;
  placement?: 'inside' | 'before' | 'after';
  targetItemId?: string;
}

export interface ArtifactBrowserMoveLorebookFolderPayload {
  stableId: string;
  folderPath: string;
  targetFolderPath: string;
  placement: 'before' | 'after';
}

export interface ArtifactBrowserMoveRegexItemPayload {
  stableId: string;
  itemId: string;
  targetItemId: string;
  placement: 'before' | 'after';
}

export interface ArtifactBrowserMoveGreetingItemPayload {
  stableId: string;
  itemId: string;
  targetItemId: string;
  placement: 'before' | 'after';
}

export interface ArtifactBrowserCreateSectionEntryPayload {
  stableId: string;
  sectionKind: ArtifactBrowserCreateSectionKind;
  entryKind: ArtifactBrowserCreateSectionEntryKind;
  targetFolderPath?: string;
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

export type MarkerEditorMode = BrowserArtifactKind;

export type MarkerEditorTimestamp = string | null;

export type CharacterMarkerEditField =
  | 'name'
  | 'creator'
  | 'characterVersion'
  | 'image'
  | 'tags'
  | keyof CharacterManifestFlags;

export type ModuleMarkerEditField = 'name' | 'description' | 'namespace' | 'image' | keyof ModuleBrowserFlags;

export type MarkerEditorEditField = CharacterMarkerEditField | ModuleMarkerEditField;

export interface CharacterEditFields {
  name: string;
  creator: string;
  characterVersion: string;
  image: string | null;
  tags: string[];
  utilityBot: CharacterManifestFlags['utilityBot'];
  lowLevelAccess: CharacterManifestFlags['lowLevelAccess'];
}

export interface ModuleEditFields {
  name: string;
  description: string;
  namespace: string;
  image: string | null;
  lowLevelAccess: ModuleBrowserFlags['lowLevelAccess'];
  hideIcon: ModuleBrowserFlags['hideIcon'];
}

export interface PluginEditFields {
  name: string;
  description: string;
  image: string | null;
}

export type MarkerEditFields = CharacterEditFields | ModuleEditFields | PluginEditFields;

export interface CharacterEditorInitPayload {
  mode: 'character';
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel?: string;
  fields: CharacterEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export interface ModuleEditorInitPayload {
  mode: 'module';
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel?: string;
  fields: ModuleEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export interface PluginEditorInitPayload {
  mode: 'plugin';
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel?: string;
  fields: PluginEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export type MarkerEditorInitPayload =
  | CharacterEditorInitPayload
  | ModuleEditorInitPayload
  | PluginEditorInitPayload;

export interface MarkerEditorReadyPayload {
  markerUri: string;
}

export interface MarkerEditorSavePayload {
  markerUri: string;
  mode: MarkerEditorMode;
  fields: MarkerEditFields;
}

export interface MarkerEditorResetRequestPayload {
  markerUri: string;
  mode: MarkerEditorMode;
}

export interface MarkerEditorSelectImagePayload {
  markerUri: string;
  rootUri: string;
  mode: MarkerEditorMode;
}

export interface MarkerEditorSavedPayload {
  success: boolean;
  message?: string;
  fields?: MarkerEditFields;
  imageUri?: string;
}

export interface MarkerEditorResetResponsePayload {
  fields: MarkerEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export interface MarkerEditorImageSelectedPayload {
  imagePath: string;
  imageUri?: string;
}

export interface MarkerEditorErrorPayload {
  code: string;
  message: string;
  field?: MarkerEditorEditField;
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

export interface ArtifactBrowserOpenCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserCloseCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export type ArtifactBrowserOpenCreateWizardMessage = MessageEnvelope<
  'artifact-browser/openCreateWizard',
  ArtifactBrowserOpenCreateWizardPayload
>;

export type ArtifactBrowserCloseCreateWizardMessage = MessageEnvelope<
  'artifact-browser/closeCreateWizard',
  ArtifactBrowserCloseCreateWizardPayload
>;

export type ArtifactBrowserCreateArtifactMessage = MessageEnvelope<
  'artifact-browser/createArtifact',
  ArtifactBrowserCreateArtifactPayload
>;

export type ArtifactBrowserImportArtifactMessage = MessageEnvelope<
  'artifact-browser/importArtifact',
  ArtifactBrowserImportArtifactPayload
>;

export type ArtifactBrowserImportArtifactChunkMessage = MessageEnvelope<
  'artifact-browser/importArtifactChunk',
  ArtifactBrowserImportArtifactChunkPayload
>;

export type ArtifactBrowserPackArtifactMessage = MessageEnvelope<
  'artifact-browser/packArtifact',
  ArtifactBrowserPackArtifactPayload
>;

export type ArtifactBrowserOpenPackedOutputMessage = MessageEnvelope<
  'artifact-browser/openPackedOutput',
  ArtifactBrowserOpenPackedOutputPayload
>;

export type ArtifactBrowserHmrStartBroadcastMessage = MessageEnvelope<
  'artifact-browser/hmrStartBroadcast',
  ArtifactBrowserHmrStartBroadcastPayload
>;

export type ArtifactBrowserHmrStopBroadcastMessage = MessageEnvelope<
  'artifact-browser/hmrStopBroadcast',
  ArtifactBrowserHmrStopBroadcastPayload
>;

export type ArtifactBrowserHmrSavePluginMessage = MessageEnvelope<
  'artifact-browser/hmrSavePlugin',
  ArtifactBrowserHmrSavePluginPayload
>;

export type ArtifactBrowserHmrOpenSavedPluginMessage = MessageEnvelope<
  'artifact-browser/hmrOpenSavedPlugin',
  ArtifactBrowserHmrOpenSavedPluginPayload
>;

export type ArtifactBrowserHmrSaveCompletedMessage = MessageEnvelope<
  'artifact-browser/hmrSaveCompleted',
  ArtifactBrowserHmrSaveCompletedPayload
>;

export type ArtifactBrowserAnalyzeArtifactMessage = MessageEnvelope<
  'artifact-browser/analyzeArtifact',
  ArtifactBrowserAnalyzeArtifactPayload
>;

export type ArtifactBrowserOpenAssetManagerMessage = MessageEnvelope<
  'artifact-browser/openAssetManager',
  ArtifactBrowserOpenAssetManagerPayload
>;

export type ArtifactBrowserOpenMarkerEditorMessage = MessageEnvelope<
  'artifact-browser/openMarkerEditor',
  ArtifactBrowserOpenMarkerEditorPayload
>;

export type ArtifactBrowserOpenPluginViewerMessage = MessageEnvelope<
  'artifact-browser/openPluginViewer',
  ArtifactBrowserOpenPluginViewerPayload
>;

export type ArtifactBrowserOpenAnalysisShowcaseMessage = MessageEnvelope<
  'artifact-browser/openAnalysisShowcase',
  ArtifactBrowserOpenAnalysisShowcasePayload
>;

export type ArtifactBrowserShareAnalysisShowcaseMessage = MessageEnvelope<
  'artifact-browser/shareAnalysisShowcase',
  ArtifactBrowserShareAnalysisShowcasePayload
>;

export type ArtifactBrowserOpenAnalysisReportMessage = MessageEnvelope<
  'artifact-browser/openAnalysisReport',
  ArtifactBrowserOpenAnalysisReportPayload
>;

export type ArtifactBrowserPackCompletedMessage = MessageEnvelope<
  'artifact-browser/packCompleted',
  ArtifactBrowserPackCompletedPayload
>;

export type ArtifactBrowserHmrStatusMessage = MessageEnvelope<
  'artifact-browser/hmrStatus',
  ArtifactBrowserHmrStatusPayload
>;

export type ArtifactBrowserSelectMessage = MessageEnvelope<
  'artifact-browser/select',
  ArtifactBrowserSelectPayload
>;

export type ArtifactBrowserOpenItemMessage = MessageEnvelope<
  'artifact-browser/openItem',
  ArtifactBrowserOpenItemPayload
>;

export type ArtifactBrowserMoveLorebookItemMessage = MessageEnvelope<
  'artifact-browser/moveLorebookItem',
  ArtifactBrowserMoveLorebookItemPayload
>;

export type ArtifactBrowserMoveLorebookFolderMessage = MessageEnvelope<
  'artifact-browser/moveLorebookFolder',
  ArtifactBrowserMoveLorebookFolderPayload
>;

export type ArtifactBrowserMoveRegexItemMessage = MessageEnvelope<
  'artifact-browser/moveRegexItem',
  ArtifactBrowserMoveRegexItemPayload
>;

export type ArtifactBrowserMoveGreetingItemMessage = MessageEnvelope<
  'artifact-browser/moveGreetingItem',
  ArtifactBrowserMoveGreetingItemPayload
>;

export type ArtifactBrowserCreateSectionEntryMessage = MessageEnvelope<
  'artifact-browser/createSectionEntry',
  ArtifactBrowserCreateSectionEntryPayload
>;

export type ArtifactBrowserDetailMessage = MessageEnvelope<
  'artifact-browser/detailLoaded',
  ArtifactBrowserDetailPayload
>;

export type ArtifactBrowserWebviewMessage =
  | ArtifactBrowserReadyMessage
  | ArtifactBrowserRefreshMessage
  | ArtifactBrowserCreateArtifactMessage
  | ArtifactBrowserImportArtifactMessage
  | ArtifactBrowserPackArtifactMessage
  | ArtifactBrowserOpenPackedOutputMessage
  | ArtifactBrowserHmrStartBroadcastMessage
  | ArtifactBrowserHmrStopBroadcastMessage
  | ArtifactBrowserHmrSavePluginMessage
  | ArtifactBrowserHmrOpenSavedPluginMessage
  | ArtifactBrowserAnalyzeArtifactMessage
  | ArtifactBrowserOpenAssetManagerMessage
  | ArtifactBrowserOpenCreateWizardMessage
  | ArtifactBrowserCloseCreateWizardMessage
  | ArtifactBrowserSelectMessage
  | ArtifactBrowserOpenItemMessage
  | ArtifactBrowserMoveLorebookItemMessage
  | ArtifactBrowserMoveLorebookFolderMessage
  | ArtifactBrowserMoveRegexItemMessage
  | ArtifactBrowserMoveGreetingItemMessage
  | ArtifactBrowserCreateSectionEntryMessage
  | ArtifactBrowserOpenMarkerEditorMessage
  | ArtifactBrowserOpenPluginViewerMessage
  | ArtifactBrowserOpenAnalysisShowcaseMessage
  | ArtifactBrowserShareAnalysisShowcaseMessage
  | ArtifactBrowserOpenAnalysisReportMessage;
export type ArtifactBrowserExtensionMessage =
  | ArtifactBrowserCardsMessage
  | ArtifactBrowserDetailMessage
  | ArtifactBrowserPackCompletedMessage
  | ArtifactBrowserHmrStatusMessage
  | ArtifactBrowserHmrSaveCompletedMessage;

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
