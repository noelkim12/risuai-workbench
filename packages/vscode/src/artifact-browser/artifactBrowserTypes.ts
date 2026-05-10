/**
 * Artifact Browser sidebar message contract and manifest-backed card model.
 * @file packages/vscode/src/artifact-browser/artifactBrowserTypes.ts
 */

export const ARTIFACT_BROWSER_PROTOCOL = 'risu-workbench.artifact-browser';
export const ARTIFACT_BROWSER_PROTOCOL_VERSION = 1;
export const ARTIFACT_BROWSER_VIEW_ID = 'risuWorkbench.cards';
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

export type BrowserArtifactKind = 'character' | 'module';
export type BrowserArtifactStatus = 'ready' | 'warning' | 'invalid';
export type CharacterSourceFormat = 'charx' | 'png' | 'json' | 'scaffold';
export type ModuleSourceFormat = 'risum' | 'json' | 'scaffold' | 'unknown';
export type CharacterBrowserStatus = BrowserArtifactStatus;
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
}

export type BrowserArtifactCard = CharacterBrowserCard | ModuleBrowserCard;

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

export type MarkerEditFields = CharacterEditFields | ModuleEditFields;

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

export type MarkerEditorInitPayload = CharacterEditorInitPayload | ModuleEditorInitPayload;

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
  | MarkerEditorSaveMessage
  | MarkerEditorResetRequestMessage
  | MarkerEditorSelectImageMessage;

export type MarkerEditorExtensionMessage =
  | MarkerEditorInitMessage
  | MarkerEditorSavedMessage
  | MarkerEditorResetResponseMessage
  | MarkerEditorImageSelectedMessage
  | MarkerEditorErrorMessage;
