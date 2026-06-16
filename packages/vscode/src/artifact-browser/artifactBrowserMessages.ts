/**
 * Artifact Browser sidebar bridge helpers.
 * @file packages/vscode/src/artifact-browser/artifactBrowserMessages.ts
 */

import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserCreateSectionEntryMessage,
  type ArtifactBrowserCreateSectionEntryPayload,
  type ArtifactBrowserMoveLorebookFolderMessage,
  type ArtifactBrowserMoveLorebookFolderPayload,
  type ArtifactBrowserMoveLorebookItemMessage,
  type ArtifactBrowserMoveLorebookItemPayload,
  type ArtifactBrowserMoveRegexItemMessage,
  type ArtifactBrowserMoveRegexItemPayload,
  type ArtifactBrowserOpenItemPayload,
  type BrowserArtifactCard,
  type BrowserSection,
  type ArtifactBrowserCardsMessage,
  type ArtifactBrowserDetailMessage,
  type ArtifactBrowserOpenItemMessage,
  type ArtifactBrowserReadyMessage,
  type ArtifactBrowserReadyPayload,
  type ArtifactBrowserRefreshPayload,
  type ArtifactBrowserRefreshMessage,
  type ArtifactBrowserSelectPayload,
  type ArtifactBrowserSelectMessage,
} from './artifactBrowserTypes';
import { isPlainRecord, isProtocolEnvelope } from '../shared/protocolEnvelope';

type ArtifactBrowserPayloadGuard<TPayload> = (payload: unknown) => payload is TPayload;

/**
 * createArtifactBrowserMessageGuard 함수.
 * Artifact Browser inbound envelope 검증과 payload 검증을 한 곳에서 결합함.
 *
 * @param type - 검증할 Artifact Browser message type
 * @param payloadGuard - type별 payload shape 검증 callback
 * @returns message 전체를 검증하는 type guard
 */
type ArtifactBrowserInboundMessage =
  | ArtifactBrowserReadyMessage
  | ArtifactBrowserRefreshMessage
  | ArtifactBrowserSelectMessage
  | ArtifactBrowserOpenItemMessage
  | ArtifactBrowserMoveLorebookItemMessage
  | ArtifactBrowserMoveLorebookFolderMessage
  | ArtifactBrowserMoveRegexItemMessage
  | ArtifactBrowserCreateSectionEntryMessage;

function createArtifactBrowserMessageGuard<TMessage extends ArtifactBrowserInboundMessage>(
  type: TMessage['type'],
  payloadGuard: ArtifactBrowserPayloadGuard<TMessage['payload']>,
): (message: unknown) => message is TMessage {
  return (message: unknown): message is TMessage =>
    isProtocolEnvelope(message, ARTIFACT_BROWSER_PROTOCOL, ARTIFACT_BROWSER_PROTOCOL_VERSION, type) &&
    payloadGuard(message.payload);
}

const isArtifactBrowserViewPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserReadyPayload | ArtifactBrowserRefreshPayload> = (
  payload,
): payload is ArtifactBrowserReadyPayload | ArtifactBrowserRefreshPayload =>
  isPlainRecord(payload) && payload.viewId === ARTIFACT_BROWSER_VIEW_ID;

const isArtifactBrowserSelectPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserSelectPayload> = (
  payload,
): payload is ArtifactBrowserSelectPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserOpenItemPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserOpenItemPayload> = (
  payload,
): payload is ArtifactBrowserOpenItemPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.itemId === 'string' &&
  payload.itemId.length > 0;

const isPlacement = (value: unknown): value is 'inside' | 'before' | 'after' =>
  value === 'inside' || value === 'before' || value === 'after';

const isSiblingPlacement = (value: unknown): value is 'before' | 'after' => value === 'before' || value === 'after';

const isArtifactBrowserMoveLorebookItemPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserMoveLorebookItemPayload> = (
  payload,
): payload is ArtifactBrowserMoveLorebookItemPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.itemId === 'string' &&
  payload.itemId.length > 0 &&
  (payload.targetFolderPath === null || typeof payload.targetFolderPath === 'string') &&
  (payload.placement === undefined || isPlacement(payload.placement)) &&
  (payload.targetItemId === undefined || typeof payload.targetItemId === 'string');

const isArtifactBrowserMoveLorebookFolderPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserMoveLorebookFolderPayload> = (
  payload,
): payload is ArtifactBrowserMoveLorebookFolderPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.folderPath === 'string' &&
  payload.folderPath.length > 0 &&
  typeof payload.targetFolderPath === 'string' &&
  payload.targetFolderPath.length > 0 &&
  isSiblingPlacement(payload.placement);

const isArtifactBrowserMoveRegexItemPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserMoveRegexItemPayload> = (
  payload,
): payload is ArtifactBrowserMoveRegexItemPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.itemId === 'string' &&
  payload.itemId.length > 0 &&
  typeof payload.targetItemId === 'string' &&
  payload.targetItemId.length > 0 &&
  isSiblingPlacement(payload.placement);

const isArtifactBrowserCreateSectionEntryPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserCreateSectionEntryPayload
> = (payload): payload is ArtifactBrowserCreateSectionEntryPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  isCreatableSectionKind(payload.sectionKind) &&
  isCreateSectionEntryKind(payload.entryKind) &&
  isCreateSectionEntryCompatible(payload.sectionKind, payload.entryKind) &&
  (payload.targetFolderPath === undefined || isSafeTargetFolderPath(payload.targetFolderPath));

const isArtifactBrowserReadyMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserReadyMessage>(
  'artifact-browser/ready',
  isArtifactBrowserViewPayload,
);

const isArtifactBrowserRefreshMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserRefreshMessage>(
  'artifact-browser/refresh',
  isArtifactBrowserViewPayload,
);

const isArtifactBrowserSelectMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserSelectMessage>(
  'artifact-browser/select',
  isArtifactBrowserSelectPayload,
);

const isArtifactBrowserOpenItemMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserOpenItemMessage>(
  'artifact-browser/openItem',
  isArtifactBrowserOpenItemPayload,
);

const isArtifactBrowserMoveLorebookItemMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserMoveLorebookItemMessage>(
    'artifact-browser/moveLorebookItem',
    isArtifactBrowserMoveLorebookItemPayload,
  );

const isArtifactBrowserMoveLorebookFolderMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserMoveLorebookFolderMessage>(
    'artifact-browser/moveLorebookFolder',
    isArtifactBrowserMoveLorebookFolderPayload,
  );

const isArtifactBrowserMoveRegexItemMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserMoveRegexItemMessage>(
    'artifact-browser/moveRegexItem',
    isArtifactBrowserMoveRegexItemPayload,
  );

const isArtifactBrowserCreateSectionEntryMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserCreateSectionEntryMessage>(
    'artifact-browser/createSectionEntry',
    isArtifactBrowserCreateSectionEntryPayload,
  );

/**
 * isArtifactBrowserReadyMessage 함수.
 * Webview readiness envelope가 현재 Artifact Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns readiness envelope 여부
 */
export function isArtifactBrowserReadyMessage(message: unknown): message is ArtifactBrowserReadyMessage {
  return isArtifactBrowserReadyMessageEnvelope(message);
}

/**
 * isArtifactBrowserRefreshMessage 함수.
 * Webview refresh request가 현재 Artifact Browser protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns refresh request envelope 여부
 */
export function isArtifactBrowserRefreshMessage(message: unknown): message is ArtifactBrowserRefreshMessage {
  return isArtifactBrowserRefreshMessageEnvelope(message);
}

/**
 * isArtifactBrowserSelectMessage 함수.
 * Webview selection message가 detail-view seed로 저장 가능한지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns selectArtifact envelope 여부
 */
export function isArtifactBrowserSelectMessage(message: unknown): message is ArtifactBrowserSelectMessage {
  return isArtifactBrowserSelectMessageEnvelope(message);
}

/**
 * isArtifactBrowserOpenItemMessage 함수.
 * Webview file-backed item open 요청이 현재 protocol과 일치하는지 확인함.
 *
 * @param message - Webview에서 수신한 unknown 메시지
 * @returns openItem envelope 여부
 */
export function isArtifactBrowserOpenItemMessage(message: unknown): message is ArtifactBrowserOpenItemMessage {
  return isArtifactBrowserOpenItemMessageEnvelope(message);
}

export function isArtifactBrowserMoveLorebookItemMessage(
  message: unknown,
): message is ArtifactBrowserMoveLorebookItemMessage {
  return isArtifactBrowserMoveLorebookItemMessageEnvelope(message);
}

export function isArtifactBrowserMoveLorebookFolderMessage(
  message: unknown,
): message is ArtifactBrowserMoveLorebookFolderMessage {
  return isArtifactBrowserMoveLorebookFolderMessageEnvelope(message);
}

export function isArtifactBrowserMoveRegexItemMessage(message: unknown): message is ArtifactBrowserMoveRegexItemMessage {
  return isArtifactBrowserMoveRegexItemMessageEnvelope(message);
}

export function isArtifactBrowserCreateSectionEntryMessage(
  message: unknown,
): message is ArtifactBrowserCreateSectionEntryMessage {
  return isArtifactBrowserCreateSectionEntryMessageEnvelope(message);
}

function isCreatableSectionKind(value: unknown): value is ArtifactBrowserCreateSectionEntryPayload['sectionKind'] {
  return value === 'lorebooks' || value === 'regexRules' || value === 'lua';
}

function isCreateSectionEntryKind(value: unknown): value is ArtifactBrowserCreateSectionEntryPayload['entryKind'] {
  return value === 'folder' || value === 'file';
}

function isCreateSectionEntryCompatible(
  sectionKind: ArtifactBrowserCreateSectionEntryPayload['sectionKind'],
  entryKind: ArtifactBrowserCreateSectionEntryPayload['entryKind'],
): boolean {
  return entryKind === 'file' || sectionKind === 'lorebooks' || sectionKind === 'lua';
}

function isSafeTargetFolderPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  );
}

type ArtifactBrowserExtensionResponse = ArtifactBrowserCardsMessage | ArtifactBrowserDetailMessage;

/**
 * createArtifactBrowserExtensionMessage 함수.
 * Extension host가 webview에 보내는 Artifact Browser response message의 protocol envelope를 일관되게 생성함.
 *
 * @param type - Artifact Browser extension response message type string
 * @param payload - type에 대응하는 payload 객체
 * @returns versioned Artifact Browser extension response message
 */
function createArtifactBrowserExtensionMessage<TType extends ArtifactBrowserExtensionResponse['type']>(
  type: TType,
  payload: Extract<ArtifactBrowserExtensionResponse, { type: TType }>['payload'],
): Extract<ArtifactBrowserExtensionResponse, { type: TType }> {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type,
    payload,
  } as Extract<ArtifactBrowserExtensionResponse, { type: TType }>;
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
  return createArtifactBrowserExtensionMessage('artifact-browser/cards', {
    generatedAt: new Date().toISOString(),
    cards,
    ...(selectedStableId && { selectedStableId }),
  });
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
  return createArtifactBrowserExtensionMessage('artifact-browser/detailLoaded', {
    generatedAt: new Date().toISOString(),
    stableId,
    sections,
  });
}
