/**
 * 모듈 추출 phase 구현을 관심사별 모듈에서 모아 노출하는 barrel.
 * @file packages/core/src/cli/extract/module/phases/index.ts
 */

export type { ModuleAssetManifest, ParsedModuleResult } from './types';
export { phase1_parseModule } from './parse';
export { phase2_extractLorebooks } from './lorebooks';
export { phase3_extractRegex } from './regex';
export { phase4_extractLua, phase4_extractTriggerLua } from './lua';
export { phase5_extractAssets, phase5_extractAssetsAsync } from './assets';
export { phase6_extractBackgroundEmbedding } from './background-embedding';
export { phase7_extractVariables } from './variables';
export { phase7_extractModuleIdentity, phase8_extractModuleIdentity } from './identity';
export { phase8_extractModuleToggle, phase9_extractModuleToggle } from './toggle';
