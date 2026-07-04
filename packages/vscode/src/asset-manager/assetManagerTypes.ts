/**
 * Asset Manager webview 프로토콜 계약.
 * 스펙 §6.2. webview 측 미러: packages/webview/src/lib/types/assetManager.ts
 * @file packages/vscode/src/asset-manager/assetManagerTypes.ts
 */

import type {
  AssetCatalog,
  AssetCatalogOutputsConfig,
  AssetCatalogSchema,
  AssetExpectedMap,
  AssetSlotValues,
  DuplicateNameGroup,
  LorebookNameCandidate,
  MissingCombo,
} from 'risu-workbench-core';
import type { ImageMeta } from 'risu-workbench-core/node';

export const ASSET_MANAGER_PROTOCOL = 'risu-workbench.asset-manager';
export const ASSET_MANAGER_PROTOCOL_VERSION = 1;
export const ASSET_MANAGER_VIEW_NAME = 'asset-manager';

export interface AssetManagerEnvelope<TType extends string, TPayload> {
  readonly protocol: typeof ASSET_MANAGER_PROTOCOL;
  readonly version: typeof ASSET_MANAGER_PROTOCOL_VERSION;
  readonly type: TType;
  readonly payload: TPayload;
}

export type AssetOutputKind = 'promptBlock' | 'whitelistRegex' | 'missingReport';

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

export type AssetManagerReadyPayload = Record<string, never>;

export interface AssetManagerStableIdPayload {
  readonly stableId: string;
}

export interface AssetManagerUpdateAssignmentsPayload extends AssetManagerStableIdPayload {
  readonly changes: readonly AssetManagerAssignmentChange[];
}

export interface AssetManagerUpdateVocabPayload extends AssetManagerStableIdPayload {
  readonly vocab: AssetCatalog['vocab'];
}

export interface AssetManagerUpdateSchemaPayload extends AssetManagerStableIdPayload {
  readonly schema: AssetCatalogSchema;
  readonly outputs?: AssetCatalogOutputsConfig;
}

export interface AssetManagerUpdateExpectedPayload extends AssetManagerStableIdPayload {
  readonly expected: AssetExpectedMap;
}

export interface AssetManagerReadImageMetaPayload extends AssetManagerStableIdPayload {
  readonly path: string;
}

export interface AssetManagerGenerateOutputsPayload extends AssetManagerStableIdPayload {
  readonly kinds: readonly AssetOutputKind[];
}

export interface AssetManagerSaveOutputPayload extends AssetManagerStableIdPayload {
  readonly kind: AssetOutputKind;
  readonly targetPath: string;
  readonly content: string;
}

export type AssetManagerReadyMessage = AssetManagerEnvelope<'asset-manager/ready', AssetManagerReadyPayload>;
export type AssetManagerRefreshAssetsMessage = AssetManagerEnvelope<'asset-manager/refreshAssets', AssetManagerStableIdPayload>;
export type AssetManagerUpdateAssignmentsMessage = AssetManagerEnvelope<
  'asset-manager/updateAssignments',
  AssetManagerUpdateAssignmentsPayload
>;
export type AssetManagerUpdateVocabMessage = AssetManagerEnvelope<'asset-manager/updateVocab', AssetManagerUpdateVocabPayload>;
export type AssetManagerUpdateSchemaMessage = AssetManagerEnvelope<'asset-manager/updateSchema', AssetManagerUpdateSchemaPayload>;
export type AssetManagerUpdateExpectedMessage = AssetManagerEnvelope<'asset-manager/updateExpected', AssetManagerUpdateExpectedPayload>;
export type AssetManagerAnalyzeLorebookNamesMessage = AssetManagerEnvelope<'asset-manager/analyzeLorebookNames', AssetManagerStableIdPayload>;
export type AssetManagerBootstrapMessage = AssetManagerEnvelope<'asset-manager/bootstrapFromFilenames', AssetManagerStableIdPayload>;
export type AssetManagerReadImageMetaMessage = AssetManagerEnvelope<'asset-manager/readImageMeta', AssetManagerReadImageMetaPayload>;
export type AssetManagerGenerateOutputsMessage = AssetManagerEnvelope<'asset-manager/generateOutputs', AssetManagerGenerateOutputsPayload>;
export type AssetManagerSaveOutputMessage = AssetManagerEnvelope<'asset-manager/saveOutput', AssetManagerSaveOutputPayload>;
export type AssetManagerBuildManifestMessage = AssetManagerEnvelope<'asset-manager/buildManifest', AssetManagerStableIdPayload>;

export type AssetManagerWebviewMessage =
  | AssetManagerReadyMessage
  | AssetManagerRefreshAssetsMessage
  | AssetManagerUpdateAssignmentsMessage
  | AssetManagerUpdateVocabMessage
  | AssetManagerUpdateSchemaMessage
  | AssetManagerUpdateExpectedMessage
  | AssetManagerAnalyzeLorebookNamesMessage
  | AssetManagerBootstrapMessage
  | AssetManagerReadImageMetaMessage
  | AssetManagerGenerateOutputsMessage
  | AssetManagerSaveOutputMessage
  | AssetManagerBuildManifestMessage;

export interface AssetManagerScanSnapshot {
  readonly entries: readonly AssetManagerAssetEntry[];
  readonly catalog: AssetCatalog;
  readonly catalogExists: boolean;
  readonly orphanPaths: readonly string[];
  readonly duplicateNames: readonly string[];
}

export interface AssetManagerAssetsLoadedPayload extends AssetManagerScanSnapshot {
  readonly stableId: string;
  readonly artifactName: string;
  readonly assetsRootWebviewUri: string;
}

export interface AssetManagerCatalogSavedPayload extends AssetManagerScanSnapshot {
  readonly stableId: string;
}

export interface AssetManagerLorebookNamesResultPayload extends AssetManagerStableIdPayload {
  readonly candidates: readonly LorebookNameCandidate[];
}

export interface AssetManagerTokenizeResultPayload extends AssetManagerStableIdPayload {
  readonly proposals: readonly AssetManagerTokenizeProposal[];
  readonly prefixes: readonly { readonly value: string; readonly count: number }[];
  readonly suffixes: readonly { readonly value: string; readonly count: number }[];
}

export interface AssetManagerImageMetaResultPayload extends AssetManagerStableIdPayload {
  readonly path: string;
  readonly meta: ImageMeta;
}

export interface AssetManagerOutputsResultPayload extends AssetManagerStableIdPayload {
  readonly promptBlock?: string;
  readonly whitelistRegex?: { readonly inPattern: string; readonly outPattern: string } | null;
  readonly missingReport?: string;
  readonly missingCombos?: readonly MissingCombo[];
}

export interface AssetManagerOutputSavedPayload extends AssetManagerStableIdPayload {
  readonly kind: AssetOutputKind;
  readonly savedPath: string;
}

export interface AssetManagerManifestBuiltPayload extends AssetManagerStableIdPayload {
  readonly total: number;
  readonly named: number;
  readonly unassigned: number;
  readonly duplicates: readonly DuplicateNameGroup[];
  readonly orphanPaths: readonly string[];
}

export interface AssetManagerErrorPayload {
  readonly stableId: string;
  readonly context: string;
  readonly message: string;
}

export type AssetManagerAssetsLoadedMessage = AssetManagerEnvelope<'asset-manager/assetsLoaded', AssetManagerAssetsLoadedPayload>;
export type AssetManagerCatalogSavedMessage = AssetManagerEnvelope<'asset-manager/catalogSaved', AssetManagerCatalogSavedPayload>;
export type AssetManagerLorebookNamesResultMessage = AssetManagerEnvelope<
  'asset-manager/lorebookNamesResult',
  AssetManagerLorebookNamesResultPayload
>;
export type AssetManagerTokenizeResultMessage = AssetManagerEnvelope<'asset-manager/tokenizeResult', AssetManagerTokenizeResultPayload>;
export type AssetManagerImageMetaResultMessage = AssetManagerEnvelope<'asset-manager/imageMetaResult', AssetManagerImageMetaResultPayload>;
export type AssetManagerOutputsResultMessage = AssetManagerEnvelope<'asset-manager/outputsResult', AssetManagerOutputsResultPayload>;
export type AssetManagerOutputSavedMessage = AssetManagerEnvelope<'asset-manager/outputSaved', AssetManagerOutputSavedPayload>;
export type AssetManagerManifestBuiltMessage = AssetManagerEnvelope<'asset-manager/manifestBuilt', AssetManagerManifestBuiltPayload>;
export type AssetManagerErrorMessage = AssetManagerEnvelope<'asset-manager/error', AssetManagerErrorPayload>;

export type AssetManagerExtensionMessage =
  | AssetManagerAssetsLoadedMessage
  | AssetManagerCatalogSavedMessage
  | AssetManagerLorebookNamesResultMessage
  | AssetManagerTokenizeResultMessage
  | AssetManagerImageMetaResultMessage
  | AssetManagerOutputsResultMessage
  | AssetManagerOutputSavedMessage
  | AssetManagerManifestBuiltMessage
  | AssetManagerErrorMessage;
