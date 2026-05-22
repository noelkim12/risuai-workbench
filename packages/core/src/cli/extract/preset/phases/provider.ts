/**
 * 프리셋 provider settings artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/provider.ts
 */

import path from 'node:path';
import { writeJson } from '@/node';
import { isRecord } from './shared';
import type { ParsedPreset } from './types';

export function phase6_extractProviderSettings(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🔌 Phase 6: 프로바이더 설정 추출');

  const data = preset.raw;
  const providerDir = path.join(outputDir, 'provider');
  let count = 0;

  if (preset.presetType === 'nai' && isRecord(data.parameters)) {
    writeJson(path.join(providerDir, 'nai.json'), data.parameters);
    count += 1;
    console.log(`     ✅ nai.json (NAI 프리셋 전체 파라미터)`);
  }

  if (preset.presetType === 'risuai') {
    if (isRecord(data.ooba)) {
      writeJson(path.join(providerDir, 'ooba.json'), data.ooba);
      count += 1;
      console.log('     ✅ ooba.json');
    }

    if (isRecord(data.NAISettings)) {
      writeJson(path.join(providerDir, 'nai.json'), data.NAISettings);
      count += 1;
      console.log('     ✅ nai.json');
    }

    if (isRecord(data.ainconfig)) {
      writeJson(path.join(providerDir, 'ain.json'), data.ainconfig);
      count += 1;
      console.log('     ✅ ain.json');
    }

    if (isRecord(data.reverseProxyOobaArgs)) {
      writeJson(path.join(providerDir, 'reverse_proxy_ooba.json'), data.reverseProxyOobaArgs);
      count += 1;
      console.log('     ✅ reverse_proxy_ooba.json');
    }
  }

  if (count === 0) {
    console.log('     (프로바이더 설정 없음)');
  }

  return count;
}
