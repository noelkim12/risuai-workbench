import fs from 'node:fs';
import { createDecipheriv, createHash } from 'node:crypto';
import path from 'node:path';
import { decode as decodeMsgpack } from 'msgpackr';
import { decompressSync } from 'fflate';

import { writeJson, writeText } from '@/node';
import {
  extractPromptTemplateFromPreset,
  serializePromptTemplateBundle,
  serializePromptTemplateOrder,
} from '@/domain/custom-extension/extensions/prompt-template';
import {
  buildRegexPath,
  extractRegexFromPreset,
  serializeRegexContent,
} from '@/domain/custom-extension/extensions/regex';
import {
  buildTogglePath,
  extractToggleFromPreset,
  serializeToggleContent,
} from '@/domain/custom-extension/extensions/toggle';
import { decodeRPackData, initRPack } from '../parsers';

// ─── Preset Type Detection ───────────────────────────────────────────────────

export type PresetType = 'risuai' | 'nai' | 'sillytavern' | 'unknown';

export interface ParsedPreset {
  raw: Record<string, unknown>;
  presetType: PresetType;
  sourceFormat: string;
  name: string;
  importFormat: 'native' | 'encrypted-container';
}

function detectPresetType(data: Record<string, unknown>): PresetType {
  // NAI preset: presetVersion >= 3
  if (
    typeof data.presetVersion === 'number' &&
    data.presetVersion >= 3 &&
    data.parameters &&
    typeof data.parameters === 'object'
  ) {
    return 'nai';
  }

  // SillyTavern preset: has prompt_order array with order sub-array + prompts array
  if (
    Array.isArray(data.prompt_order) &&
    data.prompt_order.length > 0 &&
    Array.isArray((data.prompt_order[0] as any)?.order) &&
    Array.isArray(data.prompts)
  ) {
    return 'sillytavern';
  }

  // RisuAI native: has mainPrompt or formatingOrder
  if (
    typeof data.mainPrompt === 'string' ||
    Array.isArray(data.formatingOrder) ||
    typeof data.temperature === 'number'
  ) {
    return 'risuai';
  }

  return 'unknown';
}

// ─── Phase 1: Parse Preset ───────────────────────────────────────────────────

export function phase1_parsePreset(inputPath: string): ParsedPreset {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  ⚙️  Phase 1: 프리셋 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.json' || ext === '.preset') {
    console.log(`     포맷: JSON (${ext})`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(buf.toString('utf-8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JSON 파싱 실패: ${message}`);
    }

    const presetType = detectPresetType(data);
    const name =
      (typeof data.name === 'string' && data.name) ||
      path.basename(inputPath, ext) ||
      'Unnamed Preset';

    console.log(`     프리셋 타입: ${presetType}`);
    console.log(`     이름: ${name}`);

    return {
      raw: data,
      presetType,
      sourceFormat: ext.replace('.', ''),
      name,
      importFormat: 'native',
    };
  }

  if (ext === '.risupreset' || ext === '.risup') {
    console.log(`     포맷: Binary (${ext})`);

    const containerData = ext === '.risup' ? decodeBinaryRPack(buf, inputPath) : buf;
    const outerDecoded = decodePresetContainer(containerData, inputPath);
    const normalized = normalizeDecodedPreset(outerDecoded);
    const presetType = detectPresetType(normalized);
    const name =
      (typeof normalized.name === 'string' && normalized.name) ||
      path.basename(inputPath, ext) ||
      'Unnamed Preset';
    const importFormat =
      (typeof outerDecoded.type === 'string' && outerDecoded.type === 'preset') ||
      outerDecoded.preset !== undefined ||
      outerDecoded.pres !== undefined
        ? 'encrypted-container'
        : 'native';

    console.log(`     프리셋 타입: ${presetType}`);
    console.log(`     이름: ${name}`);

    return {
      raw: normalized,
      presetType,
      sourceFormat: ext.replace('.', ''),
      name,
      importFormat,
    };
  }

  throw new Error(`지원하지 않는 프리셋 포맷: ${ext} (지원: .json, .preset, .risupreset, .risup)`);
}

function decodeBinaryRPack(buf: Buffer, inputPath: string): Buffer {
  if (!initRPack()) {
    throw new Error(
      `rpack_map.bin을 찾을 수 없어 ${path.basename(inputPath)} 디코딩에 실패했습니다.`,
    );
  }
  return decodeRPackData(buf);
}

function decodePresetContainer(buf: Buffer, inputPath: string): Record<string, unknown> {
  let decompressed: Uint8Array;
  try {
    decompressed = decompressSync(new Uint8Array(buf));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(inputPath)} 압축 해제 실패: ${message}`);
  }

  const decoded = decodeMsgpack(Buffer.from(decompressed));
  if (!isRecord(decoded)) {
    throw new Error(`${path.basename(inputPath)} 프리셋 컨테이너가 객체가 아닙니다.`);
  }
  return decoded;
}

function normalizeDecodedPreset(container: Record<string, unknown>): Record<string, unknown> {
  const version = container.presetVersion;
  const type = container.type;
  if ((version === 0 || version === 2) && type === 'preset') {
    const encrypted = toBufferLike(container.preset ?? container.pres);
    if (!encrypted) {
      throw new Error('암호화된 프리셋 payload가 없습니다.');
    }

    const decrypted = decryptAesGcmZeroIv(encrypted, 'risupreset');
    const decoded = decodeMsgpack(decrypted);
    if (!isRecord(decoded)) {
      throw new Error('복호화된 프리셋 데이터가 객체가 아닙니다.');
    }
    return decoded;
  }

  return container;
}

function decryptAesGcmZeroIv(data: Buffer, keyText: string): Buffer {
  if (data.length < 17) {
    throw new Error('AES-GCM payload가 너무 짧습니다.');
  }

  const key = createHash('sha256').update(keyText, 'utf-8').digest();
  const iv = Buffer.alloc(12, 0);
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function toBufferLike(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Phase 2: Extract Core Prompts ───────────────────────────────────────────

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

  // NAI presets don't have these fields directly
  if (preset.presetType === 'nai') {
    console.log('     (NAI 프리셋 — 프롬프트 필드 없음)');
    return 0;
  }

  // ST presets: extract from prompts array
  if (preset.presetType === 'sillytavern') {
    const prompts = data.prompts as any[];
    for (const prompt of prompts) {
      if (!prompt || typeof prompt !== 'object') continue;
      const identifier = prompt.identifier as string;
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

// ─── Phase 3: Extract Prompt Template ────────────────────────────────────────

export function phase3_extractPromptTemplate(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🧩 Phase 3: 프롬프트 템플릿 추출');

  const data = preset.raw;
  let promptTemplate = extractPromptTemplateFromPreset(data, 'preset') ?? undefined;

  // ST preset: build promptTemplate from prompt_order
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
function buildSTPromptTemplate(data: Record<string, unknown>): any[] {
  const promptOrder = data.prompt_order as any[];
  const prompts = data.prompts as any[];
  if (!Array.isArray(promptOrder?.[0]?.order) || !Array.isArray(prompts)) return [];

  const template: any[] = [];
  const findPrompt = (identifier: string) => prompts.find((p: any) => p.identifier === identifier);

  for (const orderItem of promptOrder[0].order) {
    if (!orderItem?.enabled) continue;
    const p = findPrompt(orderItem.identifier ?? '');
    if (!p) continue;

    switch (p.identifier) {
      case 'main':
        template.push({
          type: 'plain',
          type2: 'main',
          text: p.content ?? '',
          role: p.role ?? 'system',
        });
        break;
      case 'jailbreak':
      case 'nsfw':
        template.push({
          type: 'jailbreak',
          type2: 'normal',
          text: p.content ?? '',
          role: p.role ?? 'system',
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
        break; // ignored by risuai
      default:
        template.push({
          type: 'plain',
          type2: 'normal',
          text: p.content ?? '',
          role: p.role ?? 'system',
        });
    }
  }

  // ST assistant prefill
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

// ─── Phase 4: Extract Parameters ─────────────────────────────────────────────

export function phase4_extractParameters(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🎛️  Phase 4: 파라미터 추출');

  const data = preset.raw;

  let params: Record<string, unknown>;

  if (preset.presetType === 'nai') {
    // NAI preset: extract from parameters object
    const naiParams = data.parameters as Record<string, unknown>;
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
    // RisuAI native
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

// ─── Phase 5: Extract Model Config ───────────────────────────────────────────

export function phase5_extractModelConfig(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🤖 Phase 5: 모델 설정 추출');

  const data = preset.raw;

  if (preset.presetType === 'nai') {
    // NAI presets map to a specific apiType
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

  // RisuAI native
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

// ─── Phase 6: Extract Provider Settings ──────────────────────────────────────

export function phase6_extractProviderSettings(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🔌 Phase 6: 프로바이더 설정 추출');

  const data = preset.raw;
  const providerDir = path.join(outputDir, 'provider');
  let count = 0;

  // NAI preset: extract full parameters as NAI settings
  if (preset.presetType === 'nai') {
    const naiParams = data.parameters as Record<string, unknown>;
    if (naiParams && typeof naiParams === 'object') {
      writeJson(path.join(providerDir, 'nai.json'), naiParams);
      count += 1;
      console.log(`     ✅ nai.json (NAI 프리셋 전체 파라미터)`);
    }
  }

  // RisuAI native: extract sub-configs
  if (preset.presetType === 'risuai') {
    if (data.ooba && typeof data.ooba === 'object') {
      writeJson(path.join(providerDir, 'ooba.json'), data.ooba);
      count += 1;
      console.log('     ✅ ooba.json');
    }

    if (data.NAISettings && typeof data.NAISettings === 'object') {
      writeJson(path.join(providerDir, 'nai.json'), data.NAISettings);
      count += 1;
      console.log('     ✅ nai.json');
    }

    if (data.ainconfig && typeof data.ainconfig === 'object') {
      writeJson(path.join(providerDir, 'ain.json'), data.ainconfig);
      count += 1;
      console.log('     ✅ ain.json');
    }

    if (data.reverseProxyOobaArgs && typeof data.reverseProxyOobaArgs === 'object') {
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

// ─── Phase 7: Extract Prompt Settings & Formatting ───────────────────────────

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
    { customPromptTemplateToggle: data.customPromptTemplateToggle as string | undefined },
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

// ─── Phase 8: Extract Regex & Advanced ───────────────────────────────────────

export function phase8_extractRegexAndAdvanced(preset: ParsedPreset, outputDir: string): number {
  console.log('\n  🔧 Phase 8: Regex & 고급 설정 추출');

  const data = preset.raw;
  let count = 0;

  const regex = extractRegexFromPreset(
    { presetRegex: (data.presetRegex as unknown) ?? (data.regex as unknown) },
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

// ─── Utility ─────────────────────────────────────────────────────────────────

function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;
}

function pickNonEmpty(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const val = source[key];
    if (val === undefined || val === null || val === '') continue;
    result[key] = val;
  }
  return result;
}
