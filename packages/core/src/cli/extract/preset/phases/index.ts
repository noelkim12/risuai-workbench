/**
 * 프리셋 추출 phase 구현을 관심사별 모듈에서 모아 노출하는 barrel.
 * @file packages/core/src/cli/extract/preset/phases/index.ts
 */

export type { ParsedPreset, PresetType } from './types';
export { phase1_parsePreset } from './parse';
export { phase2_extractPrompts } from './prompts';
export { phase3_extractPromptTemplate } from './prompt-template';
export { phase4_extractParameters } from './parameters';
export { phase5_extractModelConfig } from './model-config';
export { phase6_extractProviderSettings } from './provider';
export { phase7_extractPromptSettings } from './prompt-settings';
export { phase8_extractRegexAndAdvanced } from './regex-advanced';
