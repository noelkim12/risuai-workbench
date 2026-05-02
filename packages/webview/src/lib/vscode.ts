/**
 * VS Code webview API singleton and Character Browser outbound messages.
 * @file packages/webview/src/lib/vscode.ts
 */

import {
  CHARACTER_BROWSER_PROTOCOL,
  CHARACTER_BROWSER_PROTOCOL_VERSION,
  CHARACTER_BROWSER_VIEW_ID,
  type CharacterBrowserOpenItemMessage,
  type CharacterBrowserReadyMessage,
  type CharacterBrowserRefreshMessage,
  type CharacterBrowserSelectMessage,
  type CharacterBrowserWebviewMessage,
} from './types';

type VsCodeApi = {
  postMessage(message: CharacterBrowserWebviewMessage): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let vscodeApi: VsCodeApi | undefined;

/**
 * getVsCodeApi 함수.
 * VS Code webview API를 한 번만 acquire해서 message bridge singleton으로 재사용함.
 *
 * @returns VS Code API 또는 브라우저 preview 환경의 undefined
 */
export function getVsCodeApi(): VsCodeApi | undefined {
  vscodeApi ??= window.acquireVsCodeApi?.();
  return vscodeApi;
}

/**
 * createCharacterBrowserReadyMessage 함수.
 * Sidebar webview가 extension host에 최초 준비 완료를 알리는 versioned message를 생성함.
 *
 * @returns Character Browser ready message
 */
export function createCharacterBrowserReadyMessage(): CharacterBrowserReadyMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/ready',
    payload: {
      viewId: CHARACTER_BROWSER_VIEW_ID,
    },
  };
}

/**
 * createCharacterBrowserRefreshMessage 함수.
 * Sidebar refresh action을 extension host가 처리할 versioned message로 생성함.
 *
 * @returns Character Browser refresh request message
 */
export function createCharacterBrowserRefreshMessage(): CharacterBrowserRefreshMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/refreshCharacters',
    payload: {
      viewId: CHARACTER_BROWSER_VIEW_ID,
    },
  };
}

/**
 * createCharacterBrowserSelectMessage 함수.
 * Card selection state를 Phase 4 detail view의 seed로 extension host에 전달함.
 *
 * @param stableId - 선택된 character card의 stable id
 * @returns Character Browser selection message
 */
export function createCharacterBrowserSelectMessage(stableId: string): CharacterBrowserSelectMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/selectCharacter',
    payload: {
      stableId,
    },
  };
}

/**
 * createCharacterBrowserOpenItemMessage 함수.
 * Detail item open action을 extension host가 처리할 versioned message로 생성함.
 *
 * @param stableId - item이 속한 character stable id
 * @param itemId - scanner가 만든 stable item id
 * @returns Character Browser open item message
 */
export function createCharacterBrowserOpenItemMessage(stableId: string, itemId: string): CharacterBrowserOpenItemMessage {
  return {
    protocol: CHARACTER_BROWSER_PROTOCOL,
    version: CHARACTER_BROWSER_PROTOCOL_VERSION,
    type: 'character-browser/openItem',
    payload: {
      stableId,
      itemId,
    },
  };
}
