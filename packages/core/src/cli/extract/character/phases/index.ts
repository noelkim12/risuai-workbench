/**
 * 캐릭터 추출 phase 구현을 관심사별 모듈에서 모아 노출하는 barrel.
 * @file packages/core/src/cli/extract/character/phases/index.ts
 */

export type { ExtractedAssetManifest, ExtractedAssetManifestEntry, ParsedCharacterResult } from './types';
export { phase1_parseCharx, phase1_parseCharxAsync } from './parse';
export { phase2_extractLorebooks } from './lorebooks';
export { phase3_extractRegex } from './regex';
export { phase4_extractTriggerLua } from './lua';
export { phase5_extractAssets, phase5_extractAssetsAsync } from './assets';
export {
  phase6_extractBackgroundHTML,
  phase7_extractVariables,
  phase8_extractCharacterFields,
} from './character-fields';
