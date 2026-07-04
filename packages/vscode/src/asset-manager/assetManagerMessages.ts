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

function hasStableId(payload: unknown): payload is Record<string, unknown> & { readonly stableId: string } {
  return isPlainRecord(payload) && typeof payload.stableId === 'string' && payload.stableId.length > 0;
}

function isAssetOutputKind(value: unknown): boolean {
  return typeof value === 'string' && ASSET_OUTPUT_KINDS.includes(value);
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
