/**
 * VS Code webview API singleton and Artifact Browser outbound messages.
 * @file packages/webview/src/lib/vscode.ts
 */

import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserOpenItemMessage,
  type ArtifactBrowserReadyMessage,
  type ArtifactBrowserRefreshMessage,
  type ArtifactBrowserSelectMessage,
  type ArtifactBrowserWebviewMessage,
} from './types';

type VsCodeApi = {
  postMessage(message: ArtifactBrowserWebviewMessage): void;
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
 * createArtifactBrowserReadyMessage 함수.
 * Sidebar webview가 extension host에 최초 준비 완료를 알리는 versioned message를 생성함.
 *
 * @returns Artifact Browser ready message
 */
export function createArtifactBrowserReadyMessage(): ArtifactBrowserReadyMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/ready',
    payload: {
      viewId: ARTIFACT_BROWSER_VIEW_ID,
    },
  };
}

/**
 * createArtifactBrowserRefreshMessage 함수.
 * Sidebar refresh action을 extension host가 처리할 versioned message로 생성함.
 *
 * @returns Artifact Browser refresh request message
 */
export function createArtifactBrowserRefreshMessage(): ArtifactBrowserRefreshMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/refresh',
    payload: {
      viewId: ARTIFACT_BROWSER_VIEW_ID,
    },
  };
}

/**
 * createArtifactBrowserSelectMessage 함수.
 * Card selection state를 Phase 4 detail view의 seed로 extension host에 전달함.
 *
 * @param stableId - 선택된 artifact card의 stable id
 * @returns Artifact Browser selection message
 */
export function createArtifactBrowserSelectMessage(stableId: string): ArtifactBrowserSelectMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/select',
    payload: {
      stableId,
    },
  };
}

/**
 * createArtifactBrowserOpenItemMessage 함수.
 * Detail item open action을 extension host가 처리할 versioned message로 생성함.
 *
 * @param stableId - item이 속한 artifact stable id
 * @param itemId - scanner가 만든 stable item id
 * @returns Artifact Browser open item message
 */
export function createArtifactBrowserOpenItemMessage(stableId: string, itemId: string): ArtifactBrowserOpenItemMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/openItem',
    payload: {
      stableId,
      itemId,
    },
  };
}
