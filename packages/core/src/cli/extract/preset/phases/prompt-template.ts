/**
 * 프리셋 prompt template artifact 추출 phase와 SillyTavern 변환 헬퍼.
 * @file packages/core/src/cli/extract/preset/phases/prompt-template.ts
 */

import path from 'node:path';
import { writeText } from '@/node';
import {
  extractPromptTemplateFromPreset,
  serializePromptTemplateBundle,
  serializePromptTemplateOrder,
} from '@/domain/custom-extension/extensions/prompt-template';
import type { PromptTemplateContent } from '@/domain/custom-extension/extensions/prompt-template';
import { isRecord } from './shared';
import type { ParsedPreset } from './types';

export function phase3_extractPromptTemplate(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🧩 Phase 3: 프롬프트 템플릿 추출');

  const data = preset.raw;
  let promptTemplate = extractPromptTemplateFromPreset(data, 'preset') ?? undefined;

  if (preset.presetType === 'sillytavern' && !promptTemplate) {
    promptTemplate = buildSTPromptTemplate(data);
  }

  if (!Array.isArray(promptTemplate) || promptTemplate.length === 0) {
    console.log('     (프롬프트 템플릿 없음)');
    return 0;
  }

  const templateDir = path.join(outputDir, 'prompt_template');
  const bundle = serializePromptTemplateBundle(promptTemplate, 'preset');

  for (const file of bundle.files) {
    writeText(path.join(outputDir, file.path), file.rawContent);
  }

  writeText(path.join(templateDir, '_order.json'), serializePromptTemplateOrder(bundle.order));

  console.log(`     ✅ ${promptTemplate.length}개 항목 → ${path.relative('.', templateDir)}/`);

  return promptTemplate.length;
}

/**
 * buildSTPromptTemplate 함수.
 * SillyTavern prompt_order/prompts 배열을 RisuAI prompt template 형태로 변환함.
 *
 * @param data - SillyTavern preset 원본 객체
 * @returns RisuAI prompt template entry 배열
 */
function buildSTPromptTemplate(data: Record<string, unknown>): PromptTemplateContent[] {
  const promptOrder = data.prompt_order;
  const prompts = data.prompts;
  const firstOrder = Array.isArray(promptOrder) ? promptOrder[0] : undefined;
  if (!isRecord(firstOrder) || !Array.isArray(firstOrder.order) || !Array.isArray(prompts)) {
    return [];
  }

  const promptRecords = prompts.filter(isRecord);
  const template: PromptTemplateContent[] = [];
  const findPrompt = (identifier: string) =>
    promptRecords.find((prompt) => prompt.identifier === identifier);

  for (const orderItem of firstOrder.order) {
    if (!isRecord(orderItem) || !orderItem.enabled) continue;
    const identifier = typeof orderItem.identifier === 'string' ? orderItem.identifier : '';
    const prompt = findPrompt(identifier);
    if (!prompt) continue;

    switch (prompt.identifier) {
      case 'main':
        template.push({
          type: 'plain',
          type2: 'main',
          text: readPromptText(prompt),
          role: readPlainRole(prompt.role),
        });
        break;
      case 'jailbreak':
      case 'nsfw':
        template.push({
          type: 'jailbreak',
          type2: 'normal',
          text: readPromptText(prompt),
          role: readPlainRole(prompt.role),
        });
        break;
      case 'chatHistory':
        template.push({ type: 'chat', rangeEnd: 'end', rangeStart: 0 });
        break;
      case 'worldInfoBefore':
        template.push({ type: 'lorebook' });
        break;
      case 'charDescription':
        template.push({ type: 'description' });
        break;
      case 'personaDescription':
        template.push({ type: 'persona' });
        break;
      case 'dialogueExamples':
      case 'charPersonality':
      case 'scenario':
      case 'worldInfoAfter':
        break;
      default:
        template.push({
          type: 'plain',
          type2: 'normal',
          text: readPromptText(prompt),
          role: readPlainRole(prompt.role),
        });
    }
  }

  if (typeof data.assistant_prefill === 'string' && data.assistant_prefill) {
    template.push({ type: 'postEverything' });
    template.push({
      type: 'plain',
      type2: 'main',
      text: `{{#if {{prefill_supported}}}}${data.assistant_prefill}{{/if}}`,
      role: 'bot',
    });
  }

  return template;
}

/**
 * readPromptText 함수.
 * SillyTavern prompt content를 prompt template text 필드로 안전하게 좁힘.
 *
 * @param prompt - content를 읽을 SillyTavern prompt 객체
 * @returns 문자열 content 또는 빈 문자열
 */
function readPromptText(prompt: Record<string, unknown>): string {
  return typeof prompt.content === 'string' ? prompt.content : '';
}

/**
 * readPlainRole 함수.
 * SillyTavern role 값을 canonical plain prompt role로 제한함.
 *
 * @param role - upstream prompt role 후보 값
 * @returns canonical plain prompt role
 */
function readPlainRole(role: unknown): 'user' | 'bot' | 'system' {
  if (role === 'user' || role === 'bot' || role === 'system') {
    return role;
  }
  return 'system';
}
