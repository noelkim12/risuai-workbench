/**
 * Asset Manager webview측 프로토콜 미러.
 * vscode측 원본: packages/vscode/src/asset-manager/assetManagerTypes.ts — 두 파일은 항상 함께 수정한다.
 * @file packages/webview/src/lib/types/assetManager.ts
 */

export const ASSET_MANAGER_PROTOCOL = 'risu-workbench.asset-manager';
export const ASSET_MANAGER_PROTOCOL_VERSION = 1;

export type AssetSlotId = 's1' | 's2' | 's3';
export type AssetSlotValues = Partial<Record<AssetSlotId, string>>;

export interface AssetSlotDefinition {
  readonly id: AssetSlotId;
  readonly label: string;
}

export interface AssetCatalogSchemaMirror {
  readonly slots: readonly AssetSlotDefinition[];
  readonly joinTemplate: string;
}

export type AssetExpectedMapMirror = Record<string, Partial<Record<'s2' | 's3', readonly string[] | null>>>;

export interface AssetCatalogOutputsMirror {
  readonly tagFormat: { readonly prefix: string; readonly suffix: string };
  readonly fallbackTemplate: string;
}

export interface AssetCatalogMirror {
  readonly version: 1;
  readonly schema: AssetCatalogSchemaMirror;
  readonly vocab: Partial<Record<AssetSlotId, readonly string[]>>;
  readonly expected: AssetExpectedMapMirror;
  readonly assignments: Record<string, AssetSlotValues>;
  readonly outputs?: AssetCatalogOutputsMirror;
}

export interface AssetManagerAssetEntry {
  readonly path: string;
  readonly subdir: string;
  readonly ext: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly fileStem: string;
  readonly assignment: AssetSlotValues | null;
  readonly generatedName: string | null;
  readonly flags: { readonly unassigned: boolean; readonly duplicate: boolean };
}

export type AssetOutputKind = 'promptBlock' | 'whitelistRegex' | 'missingReport';

export interface AssetManagerAssignmentChange {
  readonly path: string;
  readonly slots: AssetSlotValues | null;
}

export interface AssetManagerTokenizeProposal {
  readonly path: string;
  readonly slots: AssetSlotValues;
  readonly matched: boolean;
  readonly residue: string;
}

export interface LorebookNameCandidateMirror {
  readonly name: string;
  readonly filePath: string;
  readonly folderPath: string;
}

export interface ImageMetaMirror {
  readonly info: { readonly width: number | null; readonly height: number | null; readonly format: string; readonly sizeBytes: number };
  readonly generation: { readonly source: string; readonly fields: Record<string, string> } | null;
}

export interface AssetManagerScanSnapshot {
  readonly entries: readonly AssetManagerAssetEntry[];
  readonly catalog: AssetCatalogMirror;
  readonly catalogExists: boolean;
  readonly orphanPaths: readonly string[];
  readonly duplicateNames: readonly string[];
}

export interface AssetManagerEnvelope<TType extends string, TPayload> {
  readonly protocol: typeof ASSET_MANAGER_PROTOCOL;
  readonly version: typeof ASSET_MANAGER_PROTOCOL_VERSION;
  readonly type: TType;
  readonly payload: TPayload;
}

export interface AssetManagerAssetsLoadedPayload extends AssetManagerScanSnapshot {
  readonly stableId: string;
  readonly artifactName: string;
  readonly assetsRootWebviewUri: string;
}

export interface AssetManagerCatalogSavedPayload extends AssetManagerScanSnapshot {
  readonly stableId: string;
}

export interface AssetManagerWebviewPayloadByType {
  readonly 'asset-manager/ready': Record<string, never>;
  readonly 'asset-manager/refreshAssets': { readonly stableId: string };
  readonly 'asset-manager/updateAssignments': { readonly stableId: string; readonly changes: readonly AssetManagerAssignmentChange[] };
  readonly 'asset-manager/updateVocab': { readonly stableId: string; readonly vocab: AssetCatalogMirror['vocab'] };
  readonly 'asset-manager/updateSchema': {
    readonly stableId: string;
    readonly schema: AssetCatalogSchemaMirror;
    readonly outputs?: AssetCatalogOutputsMirror;
  };
  readonly 'asset-manager/updateExpected': { readonly stableId: string; readonly expected: AssetExpectedMapMirror };
  readonly 'asset-manager/analyzeLorebookNames': { readonly stableId: string };
  readonly 'asset-manager/bootstrapFromFilenames': { readonly stableId: string };
  readonly 'asset-manager/readImageMeta': { readonly stableId: string; readonly path: string };
  readonly 'asset-manager/generateOutputs': { readonly stableId: string; readonly kinds: readonly AssetOutputKind[] };
  readonly 'asset-manager/saveOutput': {
    readonly stableId: string;
    readonly kind: AssetOutputKind;
    readonly targetPath: string;
    readonly content: string;
  };
  readonly 'asset-manager/buildManifest': { readonly stableId: string };
}

export type AssetManagerWebviewMessage = {
  readonly [TType in keyof AssetManagerWebviewPayloadByType]: AssetManagerEnvelope<TType, AssetManagerWebviewPayloadByType[TType]>;
}[keyof AssetManagerWebviewPayloadByType];

export type AssetManagerExtensionMessage =
  | AssetManagerEnvelope<'asset-manager/assetsLoaded', AssetManagerAssetsLoadedPayload>
  | AssetManagerEnvelope<'asset-manager/catalogSaved', AssetManagerCatalogSavedPayload>
  | AssetManagerEnvelope<
      'asset-manager/lorebookNamesResult',
      { readonly stableId: string; readonly candidates: readonly LorebookNameCandidateMirror[] }
    >
  | AssetManagerEnvelope<
      'asset-manager/tokenizeResult',
      {
        readonly stableId: string;
        readonly proposals: readonly AssetManagerTokenizeProposal[];
        readonly prefixes: readonly { readonly value: string; readonly count: number }[];
        readonly suffixes: readonly { readonly value: string; readonly count: number }[];
      }
    >
  | AssetManagerEnvelope<'asset-manager/imageMetaResult', { readonly stableId: string; readonly path: string; readonly meta: ImageMetaMirror }>
  | AssetManagerEnvelope<
      'asset-manager/outputsResult',
      {
        readonly stableId: string;
        readonly promptBlock?: string;
        readonly whitelistRegex?: { readonly inPattern: string; readonly outPattern: string } | null;
        readonly missingReport?: string;
        readonly missingCombos?: readonly { readonly slots: AssetSlotValues; readonly name: string | null }[];
      }
    >
  | AssetManagerEnvelope<'asset-manager/outputSaved', { readonly stableId: string; readonly kind: AssetOutputKind; readonly savedPath: string }>
  | AssetManagerEnvelope<
      'asset-manager/manifestBuilt',
      {
        readonly stableId: string;
        readonly total: number;
        readonly named: number;
        readonly unassigned: number;
        readonly duplicates: readonly { readonly name: string; readonly paths: readonly string[] }[];
        readonly orphanPaths: readonly string[];
      }
    >
  | AssetManagerEnvelope<'asset-manager/error', { readonly stableId: string; readonly context: string; readonly message: string }>;

const EXTENSION_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'asset-manager/assetsLoaded',
  'asset-manager/catalogSaved',
  'asset-manager/lorebookNamesResult',
  'asset-manager/tokenizeResult',
  'asset-manager/imageMetaResult',
  'asset-manager/outputsResult',
  'asset-manager/outputSaved',
  'asset-manager/manifestBuilt',
  'asset-manager/error',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function createAssetManagerWebviewMessage<TType extends keyof AssetManagerWebviewPayloadByType>(
  type: TType,
  payload: AssetManagerWebviewPayloadByType[TType],
): AssetManagerEnvelope<TType, AssetManagerWebviewPayloadByType[TType]> {
  return {
    protocol: ASSET_MANAGER_PROTOCOL,
    version: ASSET_MANAGER_PROTOCOL_VERSION,
    type,
    payload,
  };
}

export function isAssetManagerExtensionMessage(message: unknown): message is AssetManagerExtensionMessage {
  return (
    isPlainRecord(message) &&
    message.protocol === ASSET_MANAGER_PROTOCOL &&
    message.version === ASSET_MANAGER_PROTOCOL_VERSION &&
    typeof message.type === 'string' &&
    EXTENSION_MESSAGE_TYPES.has(message.type) &&
    isPlainRecord(message.payload)
  );
}
