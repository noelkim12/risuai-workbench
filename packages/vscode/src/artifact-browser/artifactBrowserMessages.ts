/**
 * Artifact Browser sidebar bridge helpers.
 * @file packages/vscode/src/artifact-browser/artifactBrowserMessages.ts
 */

import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
  type ArtifactBrowserAnalyzeArtifactMessage,
  type ArtifactBrowserAnalyzeArtifactPayload,
  type ArtifactBrowserOpenAnalysisReportMessage,
  type ArtifactBrowserOpenAnalysisReportPayload,
  type ArtifactBrowserOpenAnalysisShowcaseMessage,
  type ArtifactBrowserOpenAnalysisShowcasePayload,
  type ArtifactBrowserOpenAssetManagerMessage,
  type ArtifactBrowserOpenAssetManagerPayload,
  type ArtifactBrowserOpenCreateWizardMessage,
  type ArtifactBrowserOpenCreateWizardPayload,
  type ArtifactBrowserCloseCreateWizardMessage,
  type ArtifactBrowserCloseCreateWizardPayload,
  type ArtifactBrowserCreateArtifactMessage,
  type ArtifactBrowserCreateArtifactPayload,
  type ArtifactBrowserCreateSectionEntryMessage,
  type ArtifactBrowserCreateSectionEntryPayload,
  type ArtifactBrowserMoveLorebookFolderMessage,
  type ArtifactBrowserMoveLorebookFolderPayload,
  type ArtifactBrowserMoveGreetingItemMessage,
  type ArtifactBrowserMoveGreetingItemPayload,
  type ArtifactBrowserMoveLorebookItemMessage,
  type ArtifactBrowserMoveLorebookItemPayload,
  type ArtifactBrowserMoveRegexItemMessage,
  type ArtifactBrowserMoveRegexItemPayload,
  type ArtifactBrowserOpenItemPayload,
  type ArtifactBrowserOpenMarkerEditorMessage,
  type ArtifactBrowserOpenMarkerEditorPayload,
  type ArtifactBrowserOpenPluginViewerMessage,
  type ArtifactBrowserOpenPluginViewerPayload,
  type BrowserArtifactCard,
  type BrowserSection,
  type ArtifactBrowserCardsMessage,
  type ArtifactBrowserDetailMessage,
  type ArtifactBrowserOpenItemMessage,
  type ArtifactBrowserReadyMessage,
  type ArtifactBrowserReadyPayload,
  type ArtifactBrowserRefreshPayload,
  type ArtifactBrowserRefreshMessage,
  type ArtifactBrowserShareAnalysisShowcaseMessage,
  type ArtifactBrowserShareAnalysisShowcasePayload,
  type ArtifactBrowserImportArtifactMessage,
  type ArtifactBrowserImportArtifactChunkMessage,
  type ArtifactBrowserImportArtifactChunkPayload,
  type ArtifactBrowserImportArtifactPayload,
  type ArtifactBrowserHmrStartBroadcastMessage,
  type ArtifactBrowserHmrStartBroadcastPayload,
  type ArtifactBrowserHmrSavePluginMessage,
  type ArtifactBrowserHmrSavePluginPayload,
  type ArtifactBrowserHmrOpenSavedPluginMessage,
  type ArtifactBrowserHmrOpenSavedPluginPayload,
  type ArtifactBrowserHmrSaveCompletedMessage,
  type ArtifactBrowserHmrSaveCompletedPayload,
  type ArtifactBrowserHmrStatusMessage,
  type ArtifactBrowserHmrStatusPayload,
  type ArtifactBrowserHmrStopBroadcastMessage,
  type ArtifactBrowserHmrStopBroadcastPayload,
  type ArtifactBrowserPackArtifactMessage,
  type ArtifactBrowserPackArtifactPayload,
  type ArtifactBrowserOpenPackedOutputMessage,
  type ArtifactBrowserOpenPackedOutputPayload,
  type ArtifactBrowserPackCompletedMessage,
  type ArtifactBrowserPackCompletedPayload,
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
  | ArtifactBrowserCreateArtifactMessage
  | ArtifactBrowserImportArtifactMessage
  | ArtifactBrowserImportArtifactChunkMessage
  | ArtifactBrowserPackArtifactMessage
  | ArtifactBrowserOpenPackedOutputMessage
  | ArtifactBrowserHmrStartBroadcastMessage
  | ArtifactBrowserHmrStopBroadcastMessage
  | ArtifactBrowserHmrSavePluginMessage
  | ArtifactBrowserHmrOpenSavedPluginMessage
  | ArtifactBrowserAnalyzeArtifactMessage
  | ArtifactBrowserOpenAssetManagerMessage
  | ArtifactBrowserOpenCreateWizardMessage
  | ArtifactBrowserCloseCreateWizardMessage
  | ArtifactBrowserSelectMessage
  | ArtifactBrowserOpenItemMessage
  | ArtifactBrowserMoveLorebookItemMessage
  | ArtifactBrowserMoveLorebookFolderMessage
  | ArtifactBrowserMoveRegexItemMessage
  | ArtifactBrowserMoveGreetingItemMessage
  | ArtifactBrowserCreateSectionEntryMessage
  | ArtifactBrowserOpenMarkerEditorMessage
  | ArtifactBrowserOpenPluginViewerMessage
  | ArtifactBrowserOpenAnalysisShowcaseMessage
  | ArtifactBrowserShareAnalysisShowcaseMessage
  | ArtifactBrowserOpenAnalysisReportMessage;

function createArtifactBrowserMessageGuard<TMessage extends ArtifactBrowserInboundMessage>(
  type: TMessage['type'],
  payloadGuard: ArtifactBrowserPayloadGuard<TMessage['payload']>,
): (message: unknown) => message is TMessage {
  return (message: unknown): message is TMessage =>
    isProtocolEnvelope(message, ARTIFACT_BROWSER_PROTOCOL, ARTIFACT_BROWSER_PROTOCOL_VERSION, type) &&
    payloadGuard(message.payload);
 }

function createExactArtifactBrowserMessageGuard<TMessage extends ArtifactBrowserInboundMessage>(
  type: TMessage['type'],
  payloadGuard: ArtifactBrowserPayloadGuard<TMessage['payload']>,
): (message: unknown) => message is TMessage {
  return (message: unknown): message is TMessage =>
    isPlainRecord(message) &&
    hasOnlyKeys(message, ['protocol', 'version', 'type', 'payload']) &&
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

const isArtifactBrowserMoveGreetingItemPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserMoveGreetingItemPayload> = (
  payload,
): payload is ArtifactBrowserMoveGreetingItemPayload =>
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

const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const isArtifactBrowserCreateArtifactPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserCreateArtifactPayload> = (
  payload,
): payload is ArtifactBrowserCreateArtifactPayload =>
  isPlainRecord(payload) &&
  (payload.kind === 'charx' || payload.kind === 'module' || payload.kind === 'plugin') &&
  typeof payload.name === 'string' &&
  payload.name.trim().length > 0 &&
  (payload.kind !== 'plugin' ||
    (PLUGIN_NAME_PATTERN.test(payload.name.trim()) &&
      (payload.framework === 'vanilla' || payload.framework === 'svelte'))) &&
  (payload.framework === undefined || payload.framework === 'vanilla' || payload.framework === 'svelte') &&
  (payload.creator === undefined || typeof payload.creator === 'string') &&
  (payload.description === undefined || typeof payload.description === 'string') &&
  (payload.tags === undefined || (Array.isArray(payload.tags) && payload.tags.every((tag) => typeof tag === 'string'))) &&
  (payload.utilityBot === undefined || typeof payload.utilityBot === 'boolean') &&
  (payload.lowLevelAccess === undefined || typeof payload.lowLevelAccess === 'boolean');

const isArtifactBrowserImportArtifactPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserImportArtifactPayload> = (
  payload,
): payload is ArtifactBrowserImportArtifactPayload =>
  isPlainRecord(payload) &&
  payload.viewId === ARTIFACT_BROWSER_VIEW_ID &&
  ((payload.fileName === undefined && payload.dataBase64 === undefined) ||
    (typeof payload.fileName === 'string' &&
      payload.fileName.length > 0 &&
      typeof payload.dataBase64 === 'string' &&
      payload.dataBase64.length > 0));

const isArtifactBrowserImportArtifactChunkPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserImportArtifactChunkPayload> = (
  payload,
): payload is ArtifactBrowserImportArtifactChunkPayload =>
  isPlainRecord(payload) &&
  payload.viewId === ARTIFACT_BROWSER_VIEW_ID &&
  typeof payload.transferId === 'string' &&
  payload.transferId.length > 0 &&
  typeof payload.fileName === 'string' &&
  payload.fileName.length > 0 &&
  typeof payload.chunkIndex === 'number' &&
  Number.isInteger(payload.chunkIndex) &&
  payload.chunkIndex >= 0 &&
  typeof payload.totalChunks === 'number' &&
  Number.isInteger(payload.totalChunks) &&
  payload.totalChunks > 0 &&
  payload.chunkIndex < payload.totalChunks &&
  typeof payload.chunkBase64 === 'string';

const isArtifactBrowserPackArtifactPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserPackArtifactPayload> = (
  payload,
): payload is ArtifactBrowserPackArtifactPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.recovery === 'boolean';

const isArtifactBrowserOpenPackedOutputPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserOpenPackedOutputPayload> = (
  payload,
): payload is ArtifactBrowserOpenPackedOutputPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  (payload.destination === 'os' || payload.destination === 'explorer' || payload.destination === 'clipboard');

const isArtifactBrowserHmrStartBroadcastPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrStartBroadcastPayload
> = (payload): payload is ArtifactBrowserHmrStartBroadcastPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserHmrStopBroadcastPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrStopBroadcastPayload
> = (payload): payload is ArtifactBrowserHmrStopBroadcastPayload => isPlainRecord(payload);

const isArtifactBrowserHmrSavePluginPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrSavePluginPayload
> = (payload): payload is ArtifactBrowserHmrSavePluginPayload =>
  isPlainRecord(payload) && Object.keys(payload).length === 0;

const isArtifactBrowserHmrOpenSavedPluginPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserHmrOpenSavedPluginPayload
> = (payload): payload is ArtifactBrowserHmrOpenSavedPluginPayload =>
  isPlainRecord(payload) && Object.keys(payload).length === 0;

const isArtifactBrowserAnalyzeArtifactPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserAnalyzeArtifactPayload> = (
  payload,
): payload is ArtifactBrowserAnalyzeArtifactPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserOpenAssetManagerPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserOpenAssetManagerPayload> = (
  payload,
): payload is ArtifactBrowserOpenAssetManagerPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserOpenMarkerEditorPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserOpenMarkerEditorPayload
> = (payload): payload is ArtifactBrowserOpenMarkerEditorPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

const isArtifactBrowserOpenPluginViewerPayload: ArtifactBrowserPayloadGuard<
  ArtifactBrowserOpenPluginViewerPayload
> = (payload): payload is ArtifactBrowserOpenPluginViewerPayload =>
  isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;

function hasOnlyKeys(payload: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(payload);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

const isArtifactBrowserAnalysisActionPayload: ArtifactBrowserPayloadGuard<
  | ArtifactBrowserOpenAnalysisShowcasePayload
  | ArtifactBrowserShareAnalysisShowcasePayload
  | ArtifactBrowserOpenAnalysisReportPayload
> = (payload): payload is
  | ArtifactBrowserOpenAnalysisShowcasePayload
  | ArtifactBrowserShareAnalysisShowcasePayload
  | ArtifactBrowserOpenAnalysisReportPayload =>
  isPlainRecord(payload) &&
  hasOnlyKeys(payload, ['stableId']) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0;

const isArtifactBrowserReadyMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserReadyMessage>(
  'artifact-browser/ready',
  isArtifactBrowserViewPayload,
);

const isArtifactBrowserRefreshMessageEnvelope = createArtifactBrowserMessageGuard<ArtifactBrowserRefreshMessage>(
  'artifact-browser/refresh',
  isArtifactBrowserViewPayload,
);

const isArtifactBrowserOpenCreateWizardPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserOpenCreateWizardPayload> = (
  payload,
): payload is ArtifactBrowserOpenCreateWizardPayload =>
  isPlainRecord(payload) && payload.viewId === ARTIFACT_BROWSER_VIEW_ID;

const isArtifactBrowserCloseCreateWizardPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserCloseCreateWizardPayload> = (
  payload,
): payload is ArtifactBrowserCloseCreateWizardPayload =>
  isPlainRecord(payload) && payload.viewId === ARTIFACT_BROWSER_VIEW_ID;

const isArtifactBrowserOpenCreateWizardMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenCreateWizardMessage>(
    'artifact-browser/openCreateWizard',
    isArtifactBrowserOpenCreateWizardPayload,
  );

const isArtifactBrowserCloseCreateWizardMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserCloseCreateWizardMessage>(
    'artifact-browser/closeCreateWizard',
    isArtifactBrowserCloseCreateWizardPayload,
  );

const isArtifactBrowserCreateArtifactMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserCreateArtifactMessage>(
    'artifact-browser/createArtifact',
    isArtifactBrowserCreateArtifactPayload,
  );

const isArtifactBrowserImportArtifactMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserImportArtifactMessage>(
    'artifact-browser/importArtifact',
    isArtifactBrowserImportArtifactPayload,
  );

const isArtifactBrowserImportArtifactChunkMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserImportArtifactChunkMessage>(
    'artifact-browser/importArtifactChunk',
    isArtifactBrowserImportArtifactChunkPayload,
  );

const isArtifactBrowserPackArtifactMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserPackArtifactMessage>(
    'artifact-browser/packArtifact',
    isArtifactBrowserPackArtifactPayload,
  );

const isArtifactBrowserOpenPackedOutputMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenPackedOutputMessage>(
    'artifact-browser/openPackedOutput',
    isArtifactBrowserOpenPackedOutputPayload,
  );

const isArtifactBrowserHmrStartBroadcastMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserHmrStartBroadcastMessage>(
    'artifact-browser/hmrStartBroadcast',
    isArtifactBrowserHmrStartBroadcastPayload,
  );

const isArtifactBrowserHmrStopBroadcastMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserHmrStopBroadcastMessage>(
    'artifact-browser/hmrStopBroadcast',
    isArtifactBrowserHmrStopBroadcastPayload,
  );

const isArtifactBrowserHmrSavePluginMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserHmrSavePluginMessage>(
    'artifact-browser/hmrSavePlugin',
    isArtifactBrowserHmrSavePluginPayload,
  );

const isArtifactBrowserHmrOpenSavedPluginMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserHmrOpenSavedPluginMessage>(
    'artifact-browser/hmrOpenSavedPlugin',
    isArtifactBrowserHmrOpenSavedPluginPayload,
  );

const isArtifactBrowserAnalyzeArtifactMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserAnalyzeArtifactMessage>(
    'artifact-browser/analyzeArtifact',
    isArtifactBrowserAnalyzeArtifactPayload,
  );

const isArtifactBrowserOpenAssetManagerMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenAssetManagerMessage>(
    'artifact-browser/openAssetManager',
    isArtifactBrowserOpenAssetManagerPayload,
  );

const isArtifactBrowserOpenMarkerEditorMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenMarkerEditorMessage>(
    'artifact-browser/openMarkerEditor',
    isArtifactBrowserOpenMarkerEditorPayload,
  );

const isArtifactBrowserOpenPluginViewerMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenPluginViewerMessage>(
    'artifact-browser/openPluginViewer',
    isArtifactBrowserOpenPluginViewerPayload,
  );

const isArtifactBrowserOpenAnalysisShowcaseMessageEnvelope =
  createExactArtifactBrowserMessageGuard<ArtifactBrowserOpenAnalysisShowcaseMessage>(
    'artifact-browser/openAnalysisShowcase',
    isArtifactBrowserAnalysisActionPayload,
  );

const isArtifactBrowserShareAnalysisShowcaseMessageEnvelope =
  createExactArtifactBrowserMessageGuard<ArtifactBrowserShareAnalysisShowcaseMessage>(
    'artifact-browser/shareAnalysisShowcase',
    isArtifactBrowserAnalysisActionPayload,
  );

const isArtifactBrowserOpenAnalysisReportMessageEnvelope =
  createExactArtifactBrowserMessageGuard<ArtifactBrowserOpenAnalysisReportMessage>(
    'artifact-browser/openAnalysisReport',
    isArtifactBrowserAnalysisActionPayload,
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

const isArtifactBrowserMoveGreetingItemMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserMoveGreetingItemMessage>(
    'artifact-browser/moveGreetingItem',
    isArtifactBrowserMoveGreetingItemPayload,
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

export function isArtifactBrowserCreateArtifactMessage(
  message: unknown,
): message is ArtifactBrowserCreateArtifactMessage {
  return isArtifactBrowserCreateArtifactMessageEnvelope(message);
}

export function isArtifactBrowserImportArtifactMessage(
  message: unknown,
): message is ArtifactBrowserImportArtifactMessage {
  return isArtifactBrowserImportArtifactMessageEnvelope(message);
}

export function isArtifactBrowserImportArtifactChunkMessage(
  message: unknown,
): message is ArtifactBrowserImportArtifactChunkMessage {
  return isArtifactBrowserImportArtifactChunkMessageEnvelope(message);
}

export function isArtifactBrowserPackArtifactMessage(
  message: unknown,
): message is ArtifactBrowserPackArtifactMessage {
  return isArtifactBrowserPackArtifactMessageEnvelope(message);
}

export function isArtifactBrowserOpenPackedOutputMessage(
  message: unknown,
): message is ArtifactBrowserOpenPackedOutputMessage {
  return isArtifactBrowserOpenPackedOutputMessageEnvelope(message);
}

export function isArtifactBrowserHmrStartBroadcastMessage(
  message: unknown,
): message is ArtifactBrowserHmrStartBroadcastMessage {
  return isArtifactBrowserHmrStartBroadcastMessageEnvelope(message);
}

export function isArtifactBrowserHmrStopBroadcastMessage(
  message: unknown,
): message is ArtifactBrowserHmrStopBroadcastMessage {
  return isArtifactBrowserHmrStopBroadcastMessageEnvelope(message);
}

export function isArtifactBrowserHmrSavePluginMessage(
  message: unknown,
): message is ArtifactBrowserHmrSavePluginMessage {
  return isArtifactBrowserHmrSavePluginMessageEnvelope(message);
}

export function isArtifactBrowserHmrOpenSavedPluginMessage(
  message: unknown,
): message is ArtifactBrowserHmrOpenSavedPluginMessage {
  return isArtifactBrowserHmrOpenSavedPluginMessageEnvelope(message);
}

export function isArtifactBrowserAnalyzeArtifactMessage(
  message: unknown,
): message is ArtifactBrowserAnalyzeArtifactMessage {
  return isArtifactBrowserAnalyzeArtifactMessageEnvelope(message);
}

export function isArtifactBrowserOpenAssetManagerMessage(
  message: unknown,
): message is ArtifactBrowserOpenAssetManagerMessage {
  return isArtifactBrowserOpenAssetManagerMessageEnvelope(message);
}

export function isArtifactBrowserOpenCreateWizardMessage(
  message: unknown,
): message is ArtifactBrowserOpenCreateWizardMessage {
  return isArtifactBrowserOpenCreateWizardMessageEnvelope(message);
}

export function isArtifactBrowserCloseCreateWizardMessage(
  message: unknown,
): message is ArtifactBrowserCloseCreateWizardMessage {
  return isArtifactBrowserCloseCreateWizardMessageEnvelope(message);
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

export function isArtifactBrowserMoveGreetingItemMessage(
  message: unknown,
): message is ArtifactBrowserMoveGreetingItemMessage {
  return isArtifactBrowserMoveGreetingItemMessageEnvelope(message);
}

export function isArtifactBrowserCreateSectionEntryMessage(
  message: unknown,
): message is ArtifactBrowserCreateSectionEntryMessage {
  return isArtifactBrowserCreateSectionEntryMessageEnvelope(message);
}

export function isArtifactBrowserOpenMarkerEditorMessage(
  message: unknown,
): message is ArtifactBrowserOpenMarkerEditorMessage {
  return isArtifactBrowserOpenMarkerEditorMessageEnvelope(message);
}

export function isArtifactBrowserOpenPluginViewerMessage(
  message: unknown,
): message is ArtifactBrowserOpenPluginViewerMessage {
  return isArtifactBrowserOpenPluginViewerMessageEnvelope(message);
}

export function isArtifactBrowserOpenAnalysisShowcaseMessage(
  message: unknown,
): message is ArtifactBrowserOpenAnalysisShowcaseMessage {
  return isArtifactBrowserOpenAnalysisShowcaseMessageEnvelope(message);
}

export function isArtifactBrowserShareAnalysisShowcaseMessage(
  message: unknown,
): message is ArtifactBrowserShareAnalysisShowcaseMessage {
  return isArtifactBrowserShareAnalysisShowcaseMessageEnvelope(message);
}

export function isArtifactBrowserOpenAnalysisReportMessage(
  message: unknown,
): message is ArtifactBrowserOpenAnalysisReportMessage {
  return isArtifactBrowserOpenAnalysisReportMessageEnvelope(message);
}

function isCreatableSectionKind(value: unknown): value is ArtifactBrowserCreateSectionEntryPayload['sectionKind'] {
  return value === 'lorebooks' || value === 'regexRules' || value === 'lua' || value === 'character';
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

type ArtifactBrowserExtensionResponse =
  | ArtifactBrowserCardsMessage
  | ArtifactBrowserDetailMessage
  | ArtifactBrowserPackCompletedMessage
  | ArtifactBrowserHmrStatusMessage
  | ArtifactBrowserHmrSaveCompletedMessage;

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

/**
 * createArtifactBrowserPackCompletedMessage 함수.
 * Pack(export) 작업 결과를 versioned extension-host 메시지로 감쌈.
 *
 * @param payload - pack 작업 성공 여부와 결과 경로/에러 메시지
 * @returns Artifact Browser pack completed message
 */
export function createArtifactBrowserPackCompletedMessage(
  payload: ArtifactBrowserPackCompletedPayload,
): ArtifactBrowserPackCompletedMessage {
  return createArtifactBrowserExtensionMessage('artifact-browser/packCompleted', payload);
}

export function createArtifactBrowserHmrStatusMessage(
  payload: ArtifactBrowserHmrStatusPayload,
): ArtifactBrowserHmrStatusMessage {
  return createArtifactBrowserExtensionMessage('artifact-browser/hmrStatus', payload);
}

export function createArtifactBrowserHmrSaveCompletedMessage(
  payload: ArtifactBrowserHmrSaveCompletedPayload,
): ArtifactBrowserHmrSaveCompletedMessage {
  return createArtifactBrowserExtensionMessage('artifact-browser/hmrSaveCompleted', payload);
}
