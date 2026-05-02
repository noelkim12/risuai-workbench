/**
 * Character Browser webview-side message and card types.
 * @file packages/webview/src/lib/types.ts
 */

export const CHARACTER_BROWSER_PROTOCOL = 'risu-workbench.character-browser';
export const CHARACTER_BROWSER_PROTOCOL_VERSION = 1;
export const CHARACTER_BROWSER_VIEW_ID = 'risuWorkbench.cards';

export type CharacterBrowserProtocol = typeof CHARACTER_BROWSER_PROTOCOL;
export type CharacterBrowserProtocolVersion = typeof CHARACTER_BROWSER_PROTOCOL_VERSION;
export type CharacterSourceFormat = 'charx' | 'png' | 'json' | 'scaffold';
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

export interface MessageEnvelope<TType extends string, TPayload> {
  protocol: CharacterBrowserProtocol;
  version: CharacterBrowserProtocolVersion;
  type: TType;
  payload: TPayload;
}

export type CharacterBrowserStatus = 'ready' | 'warning' | 'invalid';

export interface CharacterManifestFlags {
  utilityBot: boolean;
  lowLevelAccess: boolean;
}

export interface ManifestParseWarning {
  code: string;
  field?: string;
  message: string;
}

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
