/**
 * 캐릭터 추출 phase 사이에서 공유하는 타입 모음.
 * @file packages/core/src/cli/extract/character/phases/types.ts
 */

export interface ParsedCharacterResult {
  charx: any;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
}

export interface ExtractedAssetManifestEntry {
  index: number;
  original_uri?: string | null;
  extracted_path?: string | null;
  status?: string | null;
  type?: string | null;
  name?: string | null;
  ext?: string | null;
  subdir?: string | null;
  size_bytes?: number | null;
}

export interface ExtractedAssetManifest {
  assets: ExtractedAssetManifestEntry[];
}
