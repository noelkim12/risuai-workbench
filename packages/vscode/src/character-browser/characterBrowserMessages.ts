/**
 * Character Browser sidebar bridge helpers.
 * @file packages/vscode/src/character-browser/characterBrowserMessages.ts
 */

import {
  CHARACTER_BROWSER_PROTOCOL,
  CHARACTER_BROWSER_PROTOCOL_VERSION,
  CHARACTER_BROWSER_VIEW_ID,
  type CharacterBrowserCard,
  type CharacterBrowserCardsMessage,
  type CharacterBrowserDetailMessage,
  type CharacterBrowserOpenItemMessage,
  type CharacterBrowserReadyMessage,
  type CharacterBrowserRefreshMessage,
  type CharacterBrowserSelectMessage,
  type CharacterSection,
} from './characterBrowserTypes';

/**
 * isCharacterBrowserReadyMessage 함수.
 * Webview readiness envelope가 현재 Character Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns readiness envelope 여부
 */
export function isCharacterBrowserReadyMessage(message: unknown): message is CharacterBrowserReadyMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<CharacterBrowserReadyMessage>;
  return (
    candidate.protocol === CHARACTER_BROWSER_PROTOCOL &&
    candidate.version === CHARACTER_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'character-browser/ready' &&
    candidate.payload?.viewId === CHARACTER_BROWSER_VIEW_ID
  );
}

/**
 * isCharacterBrowserRefreshMessage 함수.
 * Webview refresh request가 현재 Character Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns refresh request envelope 여부
 */
export function isCharacterBrowserRefreshMessage(message: unknown): message is CharacterBrowserRefreshMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<CharacterBrowserRefreshMessage>;
  return (
    candidate.protocol === CHARACTER_BROWSER_PROTOCOL &&
    candidate.version === CHARACTER_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'character-browser/refreshCharacters' &&
    candidate.payload?.viewId === CHARACTER_BROWSER_VIEW_ID
  );
}

/**
 * isCharacterBrowserSelectMessage 함수.
 * Webview selection message가 detail-view seed로 저장 가능한지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns selectCharacter envelope 여부
 */
export function isCharacterBrowserSelectMessage(message: unknown): message is CharacterBrowserSelectMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<CharacterBrowserSelectMessage>;
  return (
    candidate.protocol === CHARACTER_BROWSER_PROTOCOL &&
    candidate.version === CHARACTER_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'character-browser/selectCharacter' &&
    typeof candidate.payload?.stableId === 'string' &&
    candidate.payload.stableId.length > 0
  );
}

/**
 * isCharacterBrowserOpenItemMessage 함수.
 * Webview file-backed item open 요청이 현재 protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns openItem envelope 여부
 */
export function isCharacterBrowserOpenItemMessage(message: unknown): message is CharacterBrowserOpenItemMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<CharacterBrowserOpenItemMessage>;
  return (
    candidate.protocol === CHARACTER_BROWSER_PROTOCOL &&
    candidate.version === CHARACTER_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'character-browser/openItem' &&
    typeof candidate.payload?.stableId === 'string' &&
    candidate.payload.stableId.length > 0 &&
    typeof candidate.payload.itemId === 'string' &&
    candidate.payload.itemId.length > 0
  );
}

/**
 * createCharacterBrowserCardsMessage 함수.
 * Discovery card snapshot을 versioned extension-host 메시지로 감쌈.
 *
 * @param cards - workspace에서 발견한 manifest-backed card 목록
 * @returns Character Browser cards snapshot message
 */
export function createCharacterBrowserCardsMessage(cards: CharacterBrowserCard[]): CharacterBrowserCardsMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/cards',
    payload: {
      generatedAt: new Date().toISOString(),
      cards,
    },
  };
}

/**
 * createCharacterBrowserDetailMessage 함수.
 * 선택된 character detail section snapshot을 versioned extension-host 메시지로 감쌈.
 *
 * @param stableId - detail이 로드된 character stable id
 * @param sections - scanner가 구성한 section 목록
 * @returns Character Browser detail snapshot message
 */
export function createCharacterBrowserDetailMessage(
  stableId: string,
  sections: CharacterSection[],
): CharacterBrowserDetailMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/characterDetailLoaded',
    payload: {
      generatedAt: new Date().toISOString(),
      stableId,
      sections,
    },
  };
}
