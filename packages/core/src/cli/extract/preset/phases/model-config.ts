/**
 * 프리셋 model configuration artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/model-config.ts
 */

import path from 'node:path';
import { writeJson } from '@/node';
import { pickNonEmpty } from './shared';
import type { ParsedPreset } from './types';

export function phase5_extractModelConfig(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🤖 Phase 5: 모델 설정 추출');

  const data = preset.raw;

  if (preset.presetType === 'nai') {
    const config = {
      apiType: 'novelai',
      name: data.name ?? 'Imported NAI Preset',
    };
    const outPath = path.join(outputDir, 'model.json');
    writeJson(outPath, config);
    console.log(`     ✅ NAI 프리셋 모델 설정 → ${path.relative('.', outPath)}`);
    return 1;
  }

  if (preset.presetType === 'sillytavern') {
    const config = {
      note: 'SillyTavern presets do not include model configuration',
    };
    const outPath = path.join(outputDir, 'model.json');
    writeJson(outPath, config);
    console.log(`     ✅ ST 프리셋 (모델 설정 없음) → ${path.relative('.', outPath)}`);
    return 1;
  }

  const config = pickNonEmpty(data, [
    'apiType',
    'aiModel',
    'subModel',
    'forceReplaceUrl',
    'forceReplaceUrl2',
    'textgenWebUIStreamURL',
    'textgenWebUIBlockingURL',
    'koboldURL',
    'openrouterRequestModel',
    'proxyRequestModel',
    'customProxyRequestModel',
    'customAPIFormat',
    'systemContentReplacement',
    'systemRoleReplacement',
    'currentPluginProvider',
    'moduleIntergration',
    'groupTemplate',
    'groupOtherBotRole',
  ]);

  if (data.openrouterProvider && typeof data.openrouterProvider === 'object') {
    config.openrouterProvider = data.openrouterProvider;
  }

  if (Object.keys(config).length === 0) {
    console.log('     (모델 설정 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, 'model.json');
  writeJson(outPath, config);
  console.log(`     ✅ ${Object.keys(config).length}개 필드 → ${path.relative('.', outPath)}`);

  return Object.keys(config).length;
}
