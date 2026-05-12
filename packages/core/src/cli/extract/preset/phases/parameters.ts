/**
 * 프리셋 parameter artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/parameters.ts
 */

import path from 'node:path';
import { writeJson } from '@/node';
import { isRecord, pickDefined } from './shared';
import type { ParsedPreset } from './types';

export function phase4_extractParameters(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🎛️  Phase 4: 파라미터 추출');

  const data = preset.raw;

  let params: Record<string, unknown>;

  if (preset.presetType === 'nai') {
    const naiParams = isRecord(data.parameters) ? data.parameters : {};
    params = {
      temperature: typeof naiParams.temperature === 'number' ? naiParams.temperature * 100 : null,
      max_length: naiParams.max_length ?? null,
      top_k: naiParams.top_k ?? null,
      top_p: naiParams.top_p ?? null,
      top_a: naiParams.top_a ?? null,
      typical_p: naiParams.typical_p ?? null,
      tail_free_sampling: naiParams.tail_free_sampling ?? null,
      repetition_penalty: naiParams.repetition_penalty ?? null,
      repetition_penalty_range: naiParams.repetition_penalty_range ?? null,
      repetition_penalty_slope: naiParams.repetition_penalty_slope ?? null,
      repetition_penalty_frequency: naiParams.repetition_penalty_frequency ?? null,
      repetition_penalty_presence: naiParams.repetition_penalty_presence ?? null,
      cfg_scale: naiParams.cfg_scale ?? null,
      mirostat_lr: naiParams.mirostat_lr ?? null,
      mirostat_tau: naiParams.mirostat_tau ?? null,
    };
  } else if (preset.presetType === 'sillytavern') {
    params = {
      temperature: typeof data.temperature === 'number' ? data.temperature * 100 : null,
      frequency_penalty:
        typeof data.frequency_penalty === 'number' ? data.frequency_penalty * 100 : null,
      presence_penalty:
        typeof data.presence_penalty === 'number' ? data.presence_penalty * 100 : null,
      top_p: data.top_p ?? null,
    };
  } else {
    params = pickDefined(data, [
      'temperature',
      'maxContext',
      'maxResponse',
      'frequencyPenalty',
      'PresensePenalty',
      'top_p',
      'top_k',
      'min_p',
      'top_a',
      'repetition_penalty',
      'reasonEffort',
      'thinkingTokens',
      'thinkingType',
      'adaptiveThinkingEffort',
      'verbosity',
    ]);
  }

  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));

  if (Object.keys(cleaned).length === 0) {
    console.log('     (파라미터 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, 'parameters.json');
  writeJson(outPath, cleaned);
  console.log(`     ✅ ${Object.keys(cleaned).length}개 파라미터 → ${path.relative('.', outPath)}`);

  return Object.keys(cleaned).length;
}
