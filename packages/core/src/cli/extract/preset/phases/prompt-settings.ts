/**
 * 프리셋 prompt settings와 formatting artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/prompt-settings.ts
 */

import path from 'node:path';
import { writeJson, writeText } from '@/node';
import {
  buildTogglePath,
  extractToggleFromPreset,
  serializeToggleContent,
} from '@/domain/custom-extension/extensions/toggle';
import { pickDefined } from './shared';
import type { ParsedPreset } from './types';

export function phase7_extractPromptSettings(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  📐 Phase 7: 프롬프트 세팅 추출');

  const data = preset.raw;
  let count = 0;

  if (Array.isArray(data.formatingOrder) && data.formatingOrder.length > 0) {
    const outPath = path.join(outputDir, 'formatting_order.json');
    writeJson(outPath, data.formatingOrder);
    count += 1;
    console.log(`     ✅ formatting_order.json (${data.formatingOrder.length}개 항목)`);
  }

  if (data.promptSettings && typeof data.promptSettings === 'object') {
    const outPath = path.join(outputDir, 'prompt_settings.json');
    writeJson(outPath, data.promptSettings);
    count += 1;
    console.log('     ✅ prompt_settings.json');
  }

  const instructSettings = pickDefined(data, [
    'useInstructPrompt',
    'instructChatTemplate',
    'JinjaTemplate',
    'templateDefaultVariables',
    'promptPreprocess',
  ]);

  if (Object.keys(instructSettings).length > 0) {
    const outPath = path.join(outputDir, 'instruct_settings.json');
    writeJson(outPath, instructSettings);
    count += 1;
    console.log(`     ✅ instruct_settings.json (${Object.keys(instructSettings).length}개 필드)`);
  }

  const promptTemplateToggle = extractToggleFromPreset(
    typeof data.customPromptTemplateToggle === 'string'
      ? { customPromptTemplateToggle: data.customPromptTemplateToggle }
      : {},
    'preset',
  );
  if (typeof promptTemplateToggle === 'string' && promptTemplateToggle.length > 0) {
    const outPath = path.join(outputDir, buildTogglePath('preset'));
    writeText(outPath, serializeToggleContent(promptTemplateToggle));
    count += 1;
    console.log(`     ✅ ${path.relative('.', outPath)} (${promptTemplateToggle.length} chars)`);
  }

  const schemaSettings = pickDefined(data, [
    'jsonSchemaEnabled',
    'jsonSchema',
    'strictJsonSchema',
    'extractJson',
  ]);

  if (Object.keys(schemaSettings).length > 0) {
    const outPath = path.join(outputDir, 'schema_settings.json');
    writeJson(outPath, schemaSettings);
    count += 1;
    console.log(`     ✅ schema_settings.json`);
  }

  if (count === 0) {
    console.log('     (프롬프트 세팅 없음)');
  }

  return count;
}
