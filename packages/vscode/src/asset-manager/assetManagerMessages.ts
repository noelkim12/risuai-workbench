/**
 * Asset Manager 메시지 guard/creator.
 * @file packages/vscode/src/asset-manager/assetManagerMessages.ts
 */

import { isPlainRecord, isProtocolEnvelope } from '../shared/protocolEnvelope';
import {
  ASSET_MANAGER_PROTOCOL,
  ASSET_MANAGER_PROTOCOL_VERSION,
  type AssetManagerExtensionMessage,
  type AssetManagerWebviewMessage,
} from './assetManagerTypes';

type PayloadValidator = (payload: unknown) => boolean;

const ASSET_OUTPUT_KINDS: readonly string[] = ['promptBlock', 'whitelistRegex', 'missingReport'];
const ASSET_SLOT_IDS: readonly string[] = ['s1', 's2', 's3'];
const CATALOG_BOOTSTRAP_SOURCES: readonly string[] = ['manifest', 'filename'];
const CATALOG_BOOTSTRAP_MODES: readonly string[] = ['full', 'missing'];
const MAX_WRITE_ASSET_FILES = 200;
const WRITEABLE_ASSET_SUBDIRS: readonly string[] = ['additional', 'emotions', 'other'];
const SUPPORTED_ASSET_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp3', 'ogg', 'wav', 'mp4', 'webm'];
const RESERVED_ASSET_BASENAMES: readonly string[] = ['asset-catalog.json', 'manifest.json'];
const ASSET_EXTENSION_RESIDUE = /(\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm))+$/i;

function hasStableId(payload: unknown): payload is Record<string, unknown> & { readonly stableId: string } {
  return isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;
}

function isAssetOutputKind(value: unknown): boolean {
  return typeof value === 'string' && ASSET_OUTPUT_KINDS.includes(value);
}

function isCatalogBootstrapSource(value: unknown): boolean {
  return typeof value === 'string' && CATALOG_BOOTSTRAP_SOURCES.includes(value);
}

function isCatalogBootstrapMode(value: unknown): boolean {
  return typeof value === 'string' && CATALOG_BOOTSTRAP_MODES.includes(value);
}

function isSlotTokenCountsRecord(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([key, count]) => ASSET_SLOT_IDS.includes(key) && typeof count === 'number' && Number.isInteger(count) && count > 0,
    )
  );
}

function isVocabAdditionsRecord(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([key, list]) => ASSET_SLOT_IDS.includes(key) && Array.isArray(list) && list.every((entry) => typeof entry === 'string'),
    )
  );
}

function isCatalogBootstrapGroupOverride(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.firstToken === 'string' &&
    value.firstToken.length > 0 &&
    isSlotTokenCountsRecord(value.slotTokenCounts)
  );
}

function isCatalogBootstrapSplitOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isPlainRecord(value)) return false;
  return (
    (value.separator === undefined || typeof value.separator === 'string') &&
    (value.slotTokenCounts === undefined || isSlotTokenCountsRecord(value.slotTokenCounts)) &&
    (value.groupOverrides === undefined ||
      (Array.isArray(value.groupOverrides) && value.groupOverrides.every(isCatalogBootstrapGroupOverride)))
  );
}

function isCatalogBootstrapPayload(payload: unknown): boolean {
  return (
    hasStableId(payload) &&
    isCatalogBootstrapSource(payload.source) &&
    isCatalogBootstrapMode(payload.mode) &&
    isCatalogBootstrapSplitOptions(payload.split) &&
    (payload.schema === undefined || isPlainRecord(payload.schema))
  );
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:\//.test(value) &&
    !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

function assetPathBasename(value: string): string {
  const segments = value.split('/');
  return segments[segments.length - 1] ?? '';
}

function assetPathExtension(value: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(assetPathBasename(value));
  return match?.[1].toLowerCase() ?? '';
}

function assetPathStrippedStem(value: string): string {
  return assetPathBasename(value).replace(/\.[A-Za-z0-9]+$/, '').replace(ASSET_EXTENSION_RESIDUE, '');
}

function isWriteableAssetPath(value: string): boolean {
  const firstSegment = value.split('/')[0];
  return (
    isSafeRelativePath(value) &&
    firstSegment !== undefined &&
    WRITEABLE_ASSET_SUBDIRS.includes(firstSegment) &&
    SUPPORTED_ASSET_EXTENSIONS.includes(assetPathExtension(value)) &&
    !RESERVED_ASSET_BASENAMES.includes(assetPathBasename(value).toLowerCase())
  );
}

function isValidBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length > 0;
}

function isValidDeletePath(targetPath: string, deletePath: unknown): boolean {
  if (deletePath === undefined) return true;
  return (
    typeof deletePath === 'string' &&
    isWriteableAssetPath(deletePath) &&
    deletePath !== targetPath &&
    assetPathStrippedStem(deletePath) === assetPathStrippedStem(targetPath)
  );
}

function isWriteAssetFile(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.targetPath === 'string' &&
    isWriteableAssetPath(value.targetPath) &&
    typeof value.bytesBase64 === 'string' &&
    isValidBase64(value.bytesBase64) &&
    isValidDeletePath(value.targetPath, value.deletePath)
  );
}

function isWriteAssetsPayload(payload: unknown): boolean {
  return (
    hasStableId(payload) &&
    Array.isArray(payload.files) &&
    payload.files.length > 0 &&
    payload.files.length <= MAX_WRITE_ASSET_FILES &&
    payload.files.every(isWriteAssetFile)
  );
}

function isSlotValuesRecord(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(([key, entry]) => ASSET_SLOT_IDS.includes(key) && typeof entry === 'string')
  );
}

function isAssignmentChange(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.path === 'string' &&
    isSafeRelativePath(value.path) &&
    (value.slots === null || isSlotValuesRecord(value.slots))
  );
}

const WEBVIEW_MESSAGE_VALIDATORS: Record<AssetManagerWebviewMessage['type'], PayloadValidator> = {
  'asset-manager/ready': (payload) => isPlainRecord(payload),
  'asset-manager/refreshAssets': hasStableId,
  'asset-manager/updateAssignments': (payload) =>
    hasStableId(payload) && Array.isArray(payload.changes) && payload.changes.every(isAssignmentChange),
  'asset-manager/updateVocab': (payload) => hasStableId(payload) && isPlainRecord(payload.vocab),
  'asset-manager/updateSchema': (payload) => hasStableId(payload) && isPlainRecord(payload.schema),
  'asset-manager/updateExpected': (payload) => hasStableId(payload) && isPlainRecord(payload.expected),
  'asset-manager/analyzeLorebookNames': hasStableId,
  'asset-manager/bootstrapFromFilenames': hasStableId,
  'asset-manager/bootstrapFromManifest': hasStableId,
  'asset-manager/bootstrapCatalog': isCatalogBootstrapPayload,
  'asset-manager/previewCatalogBootstrap': isCatalogBootstrapPayload,
  'asset-manager/readImageMeta': (payload) =>
    hasStableId(payload) && typeof payload.path === 'string' && isSafeRelativePath(payload.path),
  'asset-manager/generateOutputs': (payload) =>
    hasStableId(payload) && Array.isArray(payload.kinds) && payload.kinds.every(isAssetOutputKind),
  'asset-manager/saveOutput': (payload) =>
    hasStableId(payload) &&
    isAssetOutputKind(payload.kind) &&
    typeof payload.targetPath === 'string' &&
    isSafeRelativePath(payload.targetPath) &&
    typeof payload.content === 'string',
  'asset-manager/buildManifest': hasStableId,
  'asset-manager/undoAutoAssign': (payload) =>
    hasStableId(payload) &&
    Array.isArray(payload.assignedPaths) &&
    payload.assignedPaths.every((entry) => typeof entry === 'string' && isSafeRelativePath(entry)) &&
    isVocabAdditionsRecord(payload.addedVocab),
  'asset-manager/writeAssets': isWriteAssetsPayload,
  'asset-manager/replaceAssetFile': (payload) =>
    hasStableId(payload) && typeof payload.path === 'string' && isSafeRelativePath(payload.path),
  'asset-manager/pickAssetFiles': hasStableId,
};

/**
 * isAssetManagerWebviewMessage 함수.
 * envelope + type별 payload를 검증함.
 */
export function isAssetManagerWebviewMessage(message: unknown): message is AssetManagerWebviewMessage {
  for (const [type, validate] of Object.entries(WEBVIEW_MESSAGE_VALIDATORS)) {
    if (
      isProtocolEnvelope(message, ASSET_MANAGER_PROTOCOL, ASSET_MANAGER_PROTOCOL_VERSION, type) &&
      validate(message.payload)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * createAssetManagerExtensionMessage 함수.
 * ext→webview 응답 메시지 envelope을 생성함.
 */
export function createAssetManagerExtensionMessage<TType extends AssetManagerExtensionMessage['type']>(
  type: TType,
  payload: Extract<AssetManagerExtensionMessage, { readonly type: TType }>['payload'],
): Extract<AssetManagerExtensionMessage, { readonly type: TType }> {
  return {
    protocol: ASSET_MANAGER_PROTOCOL,
    version: ASSET_MANAGER_PROTOCOL_VERSION,
    type,
    payload,
  } as Extract<AssetManagerExtensionMessage, { readonly type: TType }>;
}
