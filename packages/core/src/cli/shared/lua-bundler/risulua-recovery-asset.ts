import { isStrictPlainRecord } from '../../../shared/guards';

export const RISULUA_RECOVERY_ASSET_TYPE = 'x-risu-recovery' as const;
export const RISULUA_RECOVERY_ASSET_NAME = 'risulua-full-source-v1' as const;
export const RISULUA_RECOVERY_ASSET_EXT = 'rpack' as const;
export const RISULUA_RECOVERY_ASSET_FILENAME = 'risulua-full-source-v1.rpack' as const;

export const RISULUA_RECOVERY_ASSET_CHARX_METADATA = {
  type: RISULUA_RECOVERY_ASSET_TYPE,
  name: RISULUA_RECOVERY_ASSET_NAME,
  ext: RISULUA_RECOVERY_ASSET_EXT,
} as const;

export const RISULUA_RECOVERY_ASSET_RISUM_TUPLE = [
  RISULUA_RECOVERY_ASSET_FILENAME,
  null,
  RISULUA_RECOVERY_ASSET_TYPE,
] as const;

function normalizeRecoveryAssetIdentityPart(value: string): string {
  return value.trim().toLowerCase();
}

export function isRisuLuaRecoveryAssetIdentity(filename: string, type: string): boolean {
  return (
    normalizeRecoveryAssetIdentityPart(filename) === RISULUA_RECOVERY_ASSET_FILENAME &&
    normalizeRecoveryAssetIdentityPart(type) === RISULUA_RECOVERY_ASSET_TYPE
  );
}

export type RisuLuaRecoveryAssetBufferStatus = 'present' | 'missing';

export type RisuLuaRecoveryAssetPair<TMetadata, TBuffer> = {
  readonly index: number;
  readonly metadata: TMetadata;
  readonly buffer: TBuffer | null | undefined;
  readonly bufferStatus: RisuLuaRecoveryAssetBufferStatus;
};

export type RisuLuaRecoveryAssetPairFilterResult<TMetadata, TBuffer> =
  | {
      readonly status: 'no-match';
      readonly firstMatchIndex: null;
      readonly firstMatchBufferStatus: 'not-applicable';
      readonly metadata: readonly TMetadata[];
      readonly buffers: readonly (TBuffer | null | undefined)[];
      readonly removedPairs: readonly RisuLuaRecoveryAssetPair<TMetadata, TBuffer>[];
    }
  | {
      readonly status: 'matched';
      readonly firstMatchIndex: number;
      readonly firstMatchBufferStatus: 'present';
      readonly metadata: readonly TMetadata[];
      readonly buffers: readonly (TBuffer | null | undefined)[];
      readonly removedPairs: readonly RisuLuaRecoveryAssetPair<TMetadata, TBuffer>[];
    }
  | {
      readonly status: 'matched-missing-buffer';
      readonly firstMatchIndex: number;
      readonly firstMatchBufferStatus: 'missing';
      readonly metadata: readonly TMetadata[];
      readonly buffers: readonly (TBuffer | null | undefined)[];
      readonly removedPairs: readonly RisuLuaRecoveryAssetPair<TMetadata, TBuffer>[];
    };

export function isRisuLuaRecoveryCharxAssetMetadata(value: unknown): boolean {
  if (!isStrictPlainRecord(value)) return false;

  const type = value['type'];
  const name = value['name'];
  const ext = value['ext'];
  if (typeof type !== 'string' || typeof name !== 'string' || typeof ext !== 'string') return false;

  return isRisuLuaRecoveryAssetIdentity(`${name}.${ext}`, type);
}

export function isRisuLuaRecoveryRisumAssetTuple(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false;

  const name = value[0];
  const uri = value[1];
  const type = value[2];

  return (
    typeof name === 'string' &&
    (typeof uri === 'string' || uri === null) &&
    typeof type === 'string' &&
    isRisuLuaRecoveryAssetIdentity(name, type)
  );
}

export function findFirstRisuLuaRecoveryAssetIndex<TMetadata>(
  metadata: readonly TMetadata[],
  matchesMetadata: (metadata: TMetadata) => boolean,
): number | null {
  for (const [index, item] of metadata.entries()) {
    if (matchesMetadata(item)) return index;
  }
  return null;
}

export function findFirstRisuLuaRecoveryCharxAssetIndex(
  metadata: readonly unknown[],
): number | null {
  return findFirstRisuLuaRecoveryAssetIndex(metadata, isRisuLuaRecoveryCharxAssetMetadata);
}

export function findFirstRisuLuaRecoveryRisumAssetIndex(
  metadata: readonly unknown[],
): number | null {
  return findFirstRisuLuaRecoveryAssetIndex(metadata, isRisuLuaRecoveryRisumAssetTuple);
}

export function filterRisuLuaRecoveryAssetPairs<TMetadata, TBuffer>(
  metadata: readonly TMetadata[],
  buffers: readonly (TBuffer | null | undefined)[],
  matchesMetadata: (metadata: TMetadata) => boolean,
): RisuLuaRecoveryAssetPairFilterResult<TMetadata, TBuffer> {
  const keptMetadata: TMetadata[] = [];
  const keptBuffers: Array<TBuffer | null | undefined> = [];
  const removedPairs: Array<RisuLuaRecoveryAssetPair<TMetadata, TBuffer>> = [];
  let firstMatchIndex: number | null = null;
  let firstMatchBufferStatus: RisuLuaRecoveryAssetBufferStatus = 'present';

  for (const [index, item] of metadata.entries()) {
    const buffer = buffers[index];
    if (!matchesMetadata(item)) {
      keptMetadata.push(item);
      keptBuffers.push(buffer);
      continue;
    }

    const bufferStatus: RisuLuaRecoveryAssetBufferStatus =
      buffer === null || buffer === undefined ? 'missing' : 'present';
    if (firstMatchIndex === null) {
      firstMatchIndex = index;
      firstMatchBufferStatus = bufferStatus;
    }
    removedPairs.push({ index, metadata: item, buffer, bufferStatus });
  }

  if (firstMatchIndex === null) {
    return {
      status: 'no-match',
      firstMatchIndex,
      firstMatchBufferStatus: 'not-applicable',
      metadata: keptMetadata,
      buffers: keptBuffers,
      removedPairs,
    };
  }

  if (firstMatchBufferStatus === 'present') {
    return {
      status: 'matched',
      firstMatchIndex,
      firstMatchBufferStatus,
      metadata: keptMetadata,
      buffers: keptBuffers,
      removedPairs,
    };
  }

  return {
    status: 'matched-missing-buffer',
    firstMatchIndex,
    firstMatchBufferStatus,
    metadata: keptMetadata,
    buffers: keptBuffers,
    removedPairs,
  };
}
