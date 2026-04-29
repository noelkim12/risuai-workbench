/**
 * Character Browser sidebar message contract and manifest-backed card model.
 * @file packages/vscode/src/character-browser/characterBrowserTypes.ts
 */

export const CHARACTER_BROWSER_PROTOCOL = 'risu-workbench.character-browser';
export const CHARACTER_BROWSER_PROTOCOL_VERSION = 1;
export const CHARACTER_BROWSER_VIEW_ID = 'risuWorkbench.cards';

export type CharacterBrowserProtocol = typeof CHARACTER_BROWSER_PROTOCOL;
export type CharacterBrowserProtocolVersion = typeof CHARACTER_BROWSER_PROTOCOL_VERSION;

/**
 * MessageEnvelope interface.
 * Versioned bridge envelope shared by extension-host and webview messages.
 *
 * @param TType - Stable protocol message type identifier
 * @param TPayload - Message-specific payload shape
 */
export interface MessageEnvelope<TType extends string, TPayload> {
  protocol: CharacterBrowserProtocol;
  version: CharacterBrowserProtocolVersion;
  type: TType;
  payload: TPayload;
}

export type CharacterSourceFormat = 'charx' | 'png' | 'json' | 'scaffold';
export type CharacterBrowserStatus = 'ready' | 'warning' | 'invalid';
export type CharacterSectionKind = 'manifest' | 'lorebooks' | 'regexRules' | 'html' | 'lua' | 'diagnostics';
export type CharacterItemType =
  | 'manifest'
  | 'image'
  | 'json'
  | 'charx'
  | 'risutext'
  | 'risulorebook'
  | 'risuregex'
  | 'risulua'
  | 'risuhtml'
  | 'png'
  | 'markdown'
  | 'regex'
  | 'diagnostic'
  | 'unknown';

export interface CharacterManifestFlags {
  utilityBot: boolean;
  lowLevelAccess: boolean;
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
  | 'readError';

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
 * CharacterItem interface.
 * Detail view에서 파일 또는 진단 항목 하나를 안정적으로 참조함.
 */
export interface CharacterItem {
  id: string;
  label: string;
  type: CharacterItemType;
  fileUri?: string;
  relativePath?: string;
  description?: string;
  extension?: string;
  source?: 'manifest' | 'scanner' | 'diagnostics';
}

/**
 * CharacterSection interface.
 * Detail view accordion이 렌더링할 character 관련 항목 그룹.
 */
export interface CharacterSection {
  id: string;
  label: string;
  kind: CharacterSectionKind;
  count: number;
  items: CharacterItem[];
}

export interface CharacterBrowserReadyPayload {
  viewId: typeof CHARACTER_BROWSER_VIEW_ID;
}

export interface CharacterBrowserRefreshPayload {
  viewId: typeof CHARACTER_BROWSER_VIEW_ID;
}

export interface CharacterBrowserSelectPayload {
  stableId: string;
}

export interface CharacterBrowserOpenItemPayload {
  stableId: string;
  itemId: string;
}

export interface CharacterBrowserCardsPayload {
  generatedAt: string;
  cards: CharacterBrowserCard[];
}

export interface CharacterBrowserDetailPayload {
  generatedAt: string;
  stableId: string;
  sections: CharacterSection[];
}

export type CharacterBrowserReadyMessage = MessageEnvelope<
  'character-browser/ready',
  CharacterBrowserReadyPayload
>;

export type CharacterBrowserCardsMessage = MessageEnvelope<
  'character-browser/cards',
  CharacterBrowserCardsPayload
>;

export type CharacterBrowserRefreshMessage = MessageEnvelope<
  'character-browser/refreshCharacters',
  CharacterBrowserRefreshPayload
>;

export type CharacterBrowserSelectMessage = MessageEnvelope<
  'character-browser/selectCharacter',
  CharacterBrowserSelectPayload
>;

export type CharacterBrowserOpenItemMessage = MessageEnvelope<
  'character-browser/openItem',
  CharacterBrowserOpenItemPayload
>;

export type CharacterBrowserDetailMessage = MessageEnvelope<
  'character-browser/characterDetailLoaded',
  CharacterBrowserDetailPayload
>;

export type CharacterBrowserWebviewMessage =
  | CharacterBrowserReadyMessage
  | CharacterBrowserRefreshMessage
  | CharacterBrowserSelectMessage
  | CharacterBrowserOpenItemMessage;
export type CharacterBrowserExtensionMessage = CharacterBrowserCardsMessage | CharacterBrowserDetailMessage;
