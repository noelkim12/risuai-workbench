/**
 * 모듈 추출 phase 사이에서 공유하는 타입 모음.
 * @file packages/core/src/cli/extract/module/phases/types.ts
 */

export interface ParsedModuleResult {
  module: any;
  assetBuffers: Buffer[];
  sourceFormat: 'risum' | 'json';
}

export type ModuleAssetManifest = {
  version: number;
  source_format: 'risum' | 'json';
  total: number;
  extracted: number;
  skipped: number;
  assets: Array<{
    index: number;
    name: string | null;
    uri: string | null;
    type: string | null;
    extracted_path: string | null;
    status: 'extracted' | 'missing_buffer';
    size_bytes: number | null;
  }>;
};
