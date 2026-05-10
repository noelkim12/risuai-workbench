/**
 * Artifact Browser webview-side message and card types.
 * @file packages/webview/src/lib/types.ts
 */

import type {
  MarkerEditorErrorPayload,
  MarkerEditorImageSelectedPayload,
  MarkerEditorInitPayload,
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

export type ArtifactBrowserProtocol = typeof ARTIFACT_BROWSER_PROTOCOL;
export type ArtifactBrowserProtocolVersion = typeof ARTIFACT_BROWSER_PROTOCOL_VERSION;
export type MarkerEditorProtocol = typeof MARKER_EDITOR_PROTOCOL;
export type MarkerEditorProtocolVersion = typeof MARKER_EDITOR_PROTOCOL_VERSION;
export type WebviewMessageProtocol = ArtifactBrowserProtocol | MarkerEditorProtocol;
export type WebviewMessageProtocolVersion = ArtifactBrowserProtocolVersion | MarkerEditorProtocolVersion;
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
