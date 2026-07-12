import type { AssetCatalogBootstrapConfigMirror, AssetManagerAssetEntry, AssetSlotId, AssetSlotValues } from '../types/assetManager';

export const SUPPORTED_ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp3', 'ogg', 'wav', 'mp4', 'webm'] as const;

const EXTENSION_RESIDUE = /(\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm))+$/i;
const RESERVED_BASENAMES = ['asset-catalog.json', 'manifest.json'] as const;
const SUPPORTED_ASSET_EXTENSION_SET: ReadonlySet<string> = new Set(SUPPORTED_ASSET_EXTENSIONS);
const RESERVED_BASENAME_SET: ReadonlySet<string> = new Set(RESERVED_BASENAMES);

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export type StagingKind = 'add' | 'replace';

export interface StagedClassification {
  readonly kind: StagingKind;
  readonly targetPath: string;
  readonly deletePath?: string;
  readonly replaces?: AssetManagerAssetEntry;
  readonly extChange?: { readonly from: string; readonly to: string };
}

/** 드롭된 파일 1개의 모달 세션 상태. editedName만 사용자가 인라인 편집한다. */
export interface StagedItem {
  readonly id: string;
  readonly originalName: string;
  editedName: string;
  readonly bytesBase64: string;
  readonly sizeBytes: number;
  /** 상세 모달 위 drop처럼 교체 대상이 확정된 경우 그 asset의 상대 경로. 파일명 기반 분류를 건너뛴다. */
  readonly replaceTargetPath?: string;
}

export type AssetFilenameValidationReason = 'unsupported-extension' | 'unsafe-path' | 'dot-segment' | 'reserved-basename';

export type AssetFilenameValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: AssetFilenameValidationReason };

export type StagedTargetPathValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly duplicatePaths: readonly string[] };

export function stripAssetExtension(name: string): string {
  return name.replace(EXTENSION_RESIDUE, '');
}

export function assetExtension(name: string): string {
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1];
  return extension?.toLowerCase() ?? '';
}

export function isSupportedAssetFile(name: string): boolean {
  return SUPPORTED_ASSET_EXTENSION_SET.has(assetExtension(name));
}

export function mimeForAssetExtension(ext: string): string {
  return MIME_BY_EXTENSION[ext.toLowerCase()] ?? 'application/octet-stream';
}

export function validateEditedAssetFilename(fileName: string): AssetFilenameValidationResult {
  if (fileName.includes('/') || fileName.includes('\\')) return { valid: false, reason: 'unsafe-path' };
  if (fileName === '.' || fileName === '..' || fileName.includes('..')) return { valid: false, reason: 'dot-segment' };
  if (RESERVED_BASENAME_SET.has(fileName.toLowerCase())) return { valid: false, reason: 'reserved-basename' };
  if (!isSupportedAssetFile(fileName)) return { valid: false, reason: 'unsupported-extension' };
  return { valid: true };
}

export function validateStagedTargetPaths(items: readonly StagedClassification[]): StagedTargetPathValidationResult {
  const seen = new Set<string>();
  const duplicatePaths = new Set<string>();
  for (const item of items) {
    if (seen.has(item.targetPath)) duplicatePaths.add(item.targetPath);
    seen.add(item.targetPath);
  }
  return duplicatePaths.size === 0 ? { valid: true } : { valid: false, duplicatePaths: [...duplicatePaths] };
}

export function classifyDroppedFile(fileName: string, entries: readonly AssetManagerAssetEntry[]): StagedClassification {
  const stem = stripAssetExtension(fileName);
  const ext = assetExtension(fileName);
  const match = entries.find((candidate) => candidate.fileStem === stem);
  if (match === undefined) return { kind: 'add', targetPath: `additional/${fileName}` };

  const matchExt = assetExtension(match.path);
  if (matchExt === ext) return { kind: 'replace', targetPath: match.path, replaces: match };

  const separatorIndex = match.path.lastIndexOf('/');
  const dir = separatorIndex === -1 ? '' : match.path.slice(0, separatorIndex + 1);
  return {
    kind: 'replace',
    targetPath: `${dir}${fileName}`,
    deletePath: match.path,
    replaces: match,
    extChange: { from: matchExt, to: ext },
  };
}

/**
 * 교체 대상이 확정된 drop(상세 모달 위 drop 등)의 분류.
 * 드롭된 파일명과 무관하게 기존 asset의 디렉토리/stem을 유지하고 확장자만 따라간다.
 */
export function classifyReplacementDrop(target: AssetManagerAssetEntry, fileName: string): StagedClassification {
  const ext = assetExtension(fileName);
  const targetExt = assetExtension(target.path);
  if (targetExt === ext) return { kind: 'replace', targetPath: target.path, replaces: target };

  const separatorIndex = target.path.lastIndexOf('/');
  const dir = separatorIndex === -1 ? '' : target.path.slice(0, separatorIndex + 1);
  const stem = stripAssetExtension(target.path.slice(separatorIndex + 1));
  return {
    kind: 'replace',
    targetPath: `${dir}${stem}.${ext}`,
    deletePath: target.path,
    replaces: target,
    extChange: { from: targetExt, to: ext },
  };
}

function splitStem(stem: string, separator: string): readonly string[] {
  if (separator.trim() === '') return stem.split(/[\s_]+/).filter(Boolean);
  if (stem.includes(separator)) return stem.split(separator).map((part) => part.trim()).filter(Boolean);
  return stem.split(/\s+/).filter(Boolean);
}

export function parseNameWithRules(
  stem: string,
  config: AssetCatalogBootstrapConfigMirror,
  slotIds: readonly AssetSlotId[],
): AssetSlotValues | null {
  const words = splitStem(stem, config.separator);
  const firstSlotId = slotIds[0];
  if (words.length === 0 || firstSlotId === undefined) return null;
  if (words.length === 1) return { [firstSlotId]: words[0] };

  const override = config.groupOverrides?.find((candidate) => candidate.firstToken === words[0]);
  const counts = override?.slotTokenCounts ?? config.slotTokenCounts;
  const valueSeparator = config.separator.trim() === '' ? ' ' : config.separator;
  const slots: AssetSlotValues = {};
  let offset = 0;

  for (let index = 0; index < slotIds.length; index += 1) {
    const slotId = slotIds[index];
    if (slotId === undefined) return null;
    const isLast = index === slotIds.length - 1;
    const size = isLast ? words.length - offset : counts[slotId] ?? 1;
    if (size <= 0 || offset + size > words.length) return null;
    slots[slotId] = words.slice(offset, offset + size).join(valueSeparator);
    offset += size;
  }

  return offset === words.length ? slots : null;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < buffer.length; index += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
