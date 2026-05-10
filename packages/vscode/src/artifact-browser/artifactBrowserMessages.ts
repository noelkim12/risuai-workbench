/**
 * Artifact Browser sidebar bridge helpers.
 * @file packages/vscode/src/artifact-browser/artifactBrowserMessages.ts
 */

import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
  type BrowserArtifactCard,
  type BrowserSection,
  type ArtifactBrowserCardsMessage,
  type ArtifactBrowserDetailMessage,
  type ArtifactBrowserOpenItemMessage,
  type ArtifactBrowserReadyMessage,
  type ArtifactBrowserRefreshMessage,
  type ArtifactBrowserSelectMessage,
} from './artifactBrowserTypes';

/**
 * isArtifactBrowserReadyMessage 함수.
 * Webview readiness envelope가 현재 Artifact Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns readiness envelope 여부
 */
export function isArtifactBrowserReadyMessage(message: unknown): message is ArtifactBrowserReadyMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<ArtifactBrowserReadyMessage>;
  return (
    candidate.protocol === ARTIFACT_BROWSER_PROTOCOL &&
    candidate.version === ARTIFACT_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'artifact-browser/ready' &&
    candidate.payload?.viewId === ARTIFACT_BROWSER_VIEW_ID
  );
}

/**
 * isArtifactBrowserRefreshMessage 함수.
 * Webview refresh request가 현재 Artifact Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns refresh request envelope 여부
 */
export function isArtifactBrowserRefreshMessage(message: unknown): message is ArtifactBrowserRefreshMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<ArtifactBrowserRefreshMessage>;
  return (
    candidate.protocol === ARTIFACT_BROWSER_PROTOCOL &&
    candidate.version === ARTIFACT_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'artifact-browser/refresh' &&
    candidate.payload?.viewId === ARTIFACT_BROWSER_VIEW_ID
  );
}

/**
 * isArtifactBrowserSelectMessage 함수.
 * Webview selection message가 detail-view seed로 저장 가능한지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns selectArtifact envelope 여부
 */
export function isArtifactBrowserSelectMessage(message: unknown): message is ArtifactBrowserSelectMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<ArtifactBrowserSelectMessage>;
  return (
    candidate.protocol === ARTIFACT_BROWSER_PROTOCOL &&
    candidate.version === ARTIFACT_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'artifact-browser/select' &&
    typeof candidate.payload?.stableId === 'string' &&
    candidate.payload.stableId.length > 0
  );
}

/**
 * isArtifactBrowserOpenItemMessage 함수.
 * Webview file-backed item open 요청이 현재 protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns openItem envelope 여부
 */
export function isArtifactBrowserOpenItemMessage(message: unknown): message is ArtifactBrowserOpenItemMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<ArtifactBrowserOpenItemMessage>;
  return (
    candidate.protocol === ARTIFACT_BROWSER_PROTOCOL &&
    candidate.version === ARTIFACT_BROWSER_PROTOCOL_VERSION &&
    candidate.type === 'artifact-browser/openItem' &&
    typeof candidate.payload?.stableId === 'string' &&
    candidate.payload.stableId.length > 0 &&
    typeof candidate.payload.itemId === 'string' &&
    candidate.payload.itemId.length > 0
  );
}

/**
 * createArtifactBrowserCardsMessage 함수.
 * Discovery card snapshot을 versioned extension-host 메시지로 감쌈.
 *
 * @param cards - workspace에서 발견한 manifest-backed card 목록
 * @param selectedStableId - refresh 후 유지할 선택 card stable id
 * @returns Artifact Browser cards snapshot message
 */
export function createArtifactBrowserCardsMessage(
  cards: BrowserArtifactCard[],
  selectedStableId?: string,
): ArtifactBrowserCardsMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/cards',
    payload: {
      generatedAt: new Date().toISOString(),
      cards,
      ...(selectedStableId && { selectedStableId }),
    },
  };
}

/**
 * createArtifactBrowserDetailMessage 함수.
  * 선택된 artifact detail section snapshot을 versioned extension-host 메시지로 감쌈.
 *
  * @param stableId - detail이 로드된 artifact stable id
 * @param sections - scanner가 구성한 section 목록
 * @returns Artifact Browser detail snapshot message
 */
export function createArtifactBrowserDetailMessage(
  stableId: string,
  sections: BrowserSection[],
): ArtifactBrowserDetailMessage {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/detailLoaded',
    payload: {
      generatedAt: new Date().toISOString(),
      stableId,
      sections,
    },
  };
}
