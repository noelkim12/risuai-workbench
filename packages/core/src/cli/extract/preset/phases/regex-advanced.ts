/**
 * 프리셋 regex와 advanced settings artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/regex-advanced.ts
 */

import path from 'node:path';
import { writeJson, writeText } from '@/node';
import {
  buildRegexPath,
  extractRegexFromPreset,
  serializeRegexContent,
} from '@/domain/regex';
import { pickDefined } from './shared';
import type { ParsedPreset } from './types';

export function phase8_extractRegexAndAdvanced(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🔧 Phase 8: Regex & 고급 설정 추출');

  const data = preset.raw;
  let count = 0;

  const regex = extractRegexFromPreset(
    { presetRegex: data.presetRegex ?? data.regex },
    'preset',
  );
  if (Array.isArray(regex) && regex.length > 0) {
    const regexDir = path.join(outputDir, 'regex');
    const orderList: string[] = [];
    const usedNames = new Set<string>();

    for (let i = 0; i < regex.length; i += 1) {
      const script = regex[i];
      const stem =
        typeof script?.comment === 'string' && script.comment.length > 0 ? script.comment : `regex_${i}`;
      const basePath = buildRegexPath('preset', stem);
      const baseName = path.basename(basePath, '.risuregex');
      let nextName = `${baseName}.risuregex`;
      let suffix = 1;

      while (usedNames.has(nextName)) {
        nextName = `${baseName}_${suffix}.risuregex`;
        suffix += 1;
      }

      usedNames.add(nextName);
      writeText(path.join(regexDir, nextName), serializeRegexContent(script));
      orderList.push(nextName);
    }

    if (orderList.length > 0) {
      writeJson(path.join(regexDir, '_order.json'), orderList);
    }

    console.log(`     ✅ ${regex.length}개 regex → ${path.relative('.', regexDir)}/`);
    count += regex.length;
  }

  const advanced: Record<string, unknown> = {};

  if (data.seperateParametersEnabled) {
    advanced.seperateParametersEnabled = data.seperateParametersEnabled;
  }
  if (data.seperateParameters && typeof data.seperateParameters === 'object') {
    advanced.seperateParameters = data.seperateParameters;
  }
  if (data.enableCustomFlags) {
    advanced.enableCustomFlags = data.enableCustomFlags;
  }
  if (Array.isArray(data.customFlags) && data.customFlags.length > 0) {
    advanced.customFlags = data.customFlags;
  }
  if (Array.isArray(data.bias) && data.bias.length > 0) {
    advanced.bias = data.bias;
  }
  if (Array.isArray(data.localStopStrings) && data.localStopStrings.length > 0) {
    advanced.localStopStrings = data.localStopStrings;
  }
  if (Array.isArray(data.modelTools) && data.modelTools.length > 0) {
    advanced.modelTools = data.modelTools;
  }
  if (data.fallbackModels && typeof data.fallbackModels === 'object') {
    advanced.fallbackModels = data.fallbackModels;
  }
  if (data.fallbackWhenBlankResponse) {
    advanced.fallbackWhenBlankResponse = data.fallbackWhenBlankResponse;
  }
  if (data.seperateModelsForAxModels) {
    advanced.seperateModelsForAxModels = data.seperateModelsForAxModels;
  }
  if (data.seperateModels && typeof data.seperateModels === 'object') {
    advanced.seperateModels = data.seperateModels;
  }
  if (data.outputImageModal) {
    advanced.outputImageModal = data.outputImageModal;
  }
  if (data.dynamicOutput && typeof data.dynamicOutput === 'object') {
    advanced.dynamicOutput = data.dynamicOutput;
  }

  const autoSuggest = pickDefined(data, [
    'autoSuggestPrompt',
    'autoSuggestPrefix',
    'autoSuggestClean',
  ]);
  if (Object.keys(autoSuggest).length > 0) {
    advanced.autoSuggest = autoSuggest;
  }

  if (Object.keys(advanced).length > 0) {
    const outPath = path.join(outputDir, 'advanced.json');
    writeJson(outPath, advanced);
    count += 1;
    console.log(`     ✅ advanced.json (${Object.keys(advanced).length}개 섹션)`);
  }

  if (count === 0) {
    console.log('     (regex/고급 설정 없음)');
  }

  return count;
}
