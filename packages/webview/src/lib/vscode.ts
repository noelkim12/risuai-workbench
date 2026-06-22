/**
 * VS Code webview API singleton and Artifact Browser outbound messages.
 * @file packages/webview/src/lib/vscode.ts
 */

import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserCreateArtifactMessage,
  type ArtifactBrowserCreateArtifactPayload,
  type ArtifactBrowserCreateSectionEntryKind,
  type ArtifactBrowserCreateSectionEntryMessage,
  type ArtifactBrowserCreateSectionKind,
  type ArtifactBrowserImportArtifactMessage,
  type ArtifactBrowserImportArtifactPayload,
  type ArtifactBrowserMoveLorebookFolderMessage,
  type ArtifactBrowserMoveLorebookItemMessage,
  type ArtifactBrowserMoveRegexItemMessage,
  type ArtifactBrowserOpenItemMessage,
  type ArtifactBrowserReadyMessage,
  type ArtifactBrowserRefreshMessage,
  type ArtifactBrowserSelectMessage,
  type ArtifactBrowserWebviewMessage,
  type MainEditorWebviewMessage,
  type MarkerEditorWebviewMessage,
} from './types';

type WebviewOutboundMessage = ArtifactBrowserWebviewMessage | MarkerEditorWebviewMessage | MainEditorWebviewMessage;

export type VsCodeApi = {
  postMessage(message: WebviewOutboundMessage): void;
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
 * createArtifactBrowserWebviewMessage 함수.
 * Artifact Browser webview outbound message의 protocol envelope를 일관되게 생성함.
 *
 * @param type - Artifact Browser message type string
 * @param payload - type에 대응하는 payload 객체
 * @returns versioned Artifact Browser webview message
 */
function createArtifactBrowserWebviewMessage<TType extends ArtifactBrowserWebviewMessage['type']>(
  type: TType,
  payload: Extract<ArtifactBrowserWebviewMessage, { type: TType }>['payload'],
): Extract<ArtifactBrowserWebviewMessage, { type: TType }> {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type,
    payload,
  } as Extract<ArtifactBrowserWebviewMessage, { type: TType }>;
}

/**
 * createArtifactBrowserReadyMessage 함수.
 * Sidebar webview가 extension host에 최초 준비 완료를 알리는 versioned message를 생성함.
 *
 * @returns Artifact Browser ready message
 */
export function createArtifactBrowserReadyMessage(): ArtifactBrowserReadyMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/ready', {
    viewId: ARTIFACT_BROWSER_VIEW_ID,
  });
}

/**
 * createArtifactBrowserRefreshMessage 함수.
 * Sidebar refresh action을 extension host가 처리할 versioned message로 생성함.
 *
 * @returns Artifact Browser refresh request message
 */
export function createArtifactBrowserRefreshMessage(): ArtifactBrowserRefreshMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/refresh', {
    viewId: ARTIFACT_BROWSER_VIEW_ID,
  });
}

export function createArtifactBrowserCreateArtifactMessage(
  payload: ArtifactBrowserCreateArtifactPayload,
): ArtifactBrowserCreateArtifactMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/createArtifact', payload);
}

export function createArtifactBrowserImportArtifactMessage(
  payload: Omit<ArtifactBrowserImportArtifactPayload, 'viewId'>,
): ArtifactBrowserImportArtifactMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/importArtifact', {
    viewId: ARTIFACT_BROWSER_VIEW_ID,
    ...payload,
  });
}

/**
 * createArtifactBrowserSelectMessage 함수.
 * Card selection state를 Phase 4 detail view의 seed로 extension host에 전달함.
 *
 * @param stableId - 선택된 artifact card의 stable id
 * @returns Artifact Browser selection message
 */
export function createArtifactBrowserSelectMessage(stableId: string): ArtifactBrowserSelectMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/select', {
    stableId,
  });
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
  return createArtifactBrowserWebviewMessage('artifact-browser/openItem', {
    stableId,
    itemId,
  });
}

export function createArtifactBrowserMoveLorebookItemMessage(
  stableId: string,
  itemId: string,
  targetFolderPath: string | null,
  placement?: 'inside' | 'before' | 'after',
  targetItemId?: string,
): ArtifactBrowserMoveLorebookItemMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/moveLorebookItem', {
    stableId,
    itemId,
    targetFolderPath,
    ...(placement && { placement }),
    ...(targetItemId && { targetItemId }),
  });
}

export function createArtifactBrowserMoveLorebookFolderMessage(
  stableId: string,
  folderPath: string,
  targetFolderPath: string,
  placement: 'before' | 'after',
): ArtifactBrowserMoveLorebookFolderMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/moveLorebookFolder', {
    stableId,
    folderPath,
    targetFolderPath,
    placement,
  });
}

export function createArtifactBrowserMoveRegexItemMessage(
  stableId: string,
  itemId: string,
  targetItemId: string,
  placement: 'before' | 'after',
): ArtifactBrowserMoveRegexItemMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/moveRegexItem', {
    stableId,
    itemId,
    targetItemId,
    placement,
  });
}

export function createArtifactBrowserCreateSectionEntryMessage(
  stableId: string,
  sectionKind: ArtifactBrowserCreateSectionKind,
  entryKind: ArtifactBrowserCreateSectionEntryKind,
  targetFolderPath?: string,
): ArtifactBrowserCreateSectionEntryMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/createSectionEntry', {
    stableId,
    sectionKind,
    entryKind,
    ...(targetFolderPath && { targetFolderPath }),
  });
}
