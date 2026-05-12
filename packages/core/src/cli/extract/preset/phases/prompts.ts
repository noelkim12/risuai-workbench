/**
 * 프리셋 core prompt artifact 추출 phase.
 * @file packages/core/src/cli/extract/preset/phases/prompts.ts
 */

import path from 'node:path';
import { writeText } from '@/node';
import { isRecord } from './shared';
import type { ParsedPreset } from './types';

export function phase2_extractPrompts(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  📝 Phase 2: 프롬프트 추출');

  const data = preset.raw;
  const promptsDir = path.join(outputDir, 'prompts');
  let count = 0;

  const textFields: Record<string, unknown> = {
    'main.txt': data.mainPrompt,
    'jailbreak.txt': data.jailbreak,
    'global_note.txt': data.globalNote,
  };

  if (preset.presetType === 'nai') {
    console.log('     (NAI 프리셋 — 프롬프트 필드 없음)');
    return 0;
  }

  if (preset.presetType === 'sillytavern' && Array.isArray(data.prompts)) {
    for (const prompt of data.prompts) {
      if (!isRecord(prompt)) continue;
      const identifier = typeof prompt.identifier === 'string' ? prompt.identifier : '';
      const content = typeof prompt.content === 'string' ? prompt.content : '';

      if (identifier === 'main' && content) {
        textFields['main.txt'] = content;
      } else if ((identifier === 'jailbreak' || identifier === 'nsfw') && content) {
        textFields['jailbreak.txt'] = content;
      }
    }
  }

  for (const [filename, content] of Object.entries(textFields)) {
    if (typeof content === 'string' && content.length > 0) {
      writeText(path.join(promptsDir, filename), content);
      count += 1;
      console.log(`     ✅ ${filename} (${content.length} chars)`);
    }
  }

  if (count === 0) {
    console.log('     (프롬프트 없음)');
  }

  return count;
}
