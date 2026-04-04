import path from 'node:path';
import {
  ELEMENT_TYPES,
  extractCBSVarOps,
  getPresetPromptTemplateItemsFromPreset,
  getPresetPromptTextsFromPreset,
  type ElementCBSData,
  type GenericRecord,
} from '@/domain';
import { dirExists, readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { listJsonFilesRecursive, resolveOrderedFiles } from '@/node/json-listing';
import type { PresetCollectResult, PromptSource } from './types';

/** 추출된 preset 디렉토리에서 모든 분석 소스를 수집한다. */
export function collectPresetSources(outputDir: string): PresetCollectResult {
  const presetJson = readJsonIfExists(path.join(outputDir, 'preset.json'));
  const prompts = collectPrompts(outputDir, presetJson);
  const promptTemplates = collectPromptTemplates(outputDir, presetJson);
  const regexCBS = collectRegex(outputDir);
  const metadata = isRecord(presetJson) ? presetJson : {};
  const model = asRecordOrNull(readJsonIfExists(path.join(outputDir, 'model.json')));
  const parameters = asRecordOrNull(readJsonIfExists(path.join(outputDir, 'parameters.json')));

  return { prompts, promptTemplates, regexCBS, metadata, model, parameters };
}

function collectPrompts(outputDir: string, presetJson: unknown): PromptSource[] {
  const promptsDir = path.join(outputDir, 'prompts');
  if (dirExists(promptsDir)) {
    const promptNames = ['main.txt', 'jailbreak.txt', 'global_note.txt'];
    return promptNames
      .map((fileName) => {
        const text = readTextIfExists(path.join(promptsDir, fileName));
        if (!text) return null;
        return buildPromptSource(fileName.replace(/\.txt$/u, ''), text);
      })
      .filter((source): source is PromptSource => source != null);
  }

  return getPresetPromptTextsFromPreset(presetJson).map((entry) =>
    buildPromptSource(entry.name, entry.text),
  );
}

function collectPromptTemplates(outputDir: string, presetJson: unknown): PromptSource[] {
  const templateDir = path.join(outputDir, 'prompt_template');
  if (dirExists(templateDir)) {
    const files = resolveOrderedFiles(templateDir, listJsonFilesRecursive(templateDir));
    return files.map((filePath) => {
      const raw = readJsonIfExists(filePath);
      const record = isRecord(raw) ? raw : {};
      const fallbackName = path.basename(filePath, '.json');
      const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : fallbackName;
      const text = readTemplateRuntimeText(record);
      return buildPromptSource(name, text);
    });
  }

  return getPresetPromptTemplateItemsFromPreset(presetJson).map((item, index) => {
    const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : `template_${index + 1}`;
    return buildPromptSource(name, readTemplateRuntimeText(item));
  });
}

function collectRegex(outputDir: string): ElementCBSData[] {
  const regexDir = path.join(outputDir, 'regex');
  if (!dirExists(regexDir)) return [];

  const files = resolveOrderedFiles(regexDir, listJsonFilesRecursive(regexDir));
  return files.flatMap((filePath) => {
    const raw = readJsonIfExists(filePath);
    if (!isRecord(raw)) return [];

    const inOps = extractCBSVarOps(readStringField(raw, 'in'));
    const outOps = extractCBSVarOps(readStringField(raw, 'out'));
    const flagOps = extractCBSVarOps(readStringField(raw, 'flag'));

    let reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
    let writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

    if (reads.size === 0 && writes.size === 0) {
      const altText = readStringField(raw, 'script') || readStringField(raw, 'content');
      const altOps = extractCBSVarOps(altText);
      reads = altOps.reads;
      writes = altOps.writes;
    }

    if (reads.size === 0 && writes.size === 0) return [];

    return [
      {
        elementType: ELEMENT_TYPES.REGEX,
        elementName: `[preset]/regex/${path.basename(filePath, '.json')}`,
        reads,
        writes,
      },
    ];
  });
}

function buildPromptSource(name: string, text: string): PromptSource {
  const ops = extractCBSVarOps(text);
  return { name, text, reads: ops.reads, writes: ops.writes };
}

function readTemplateRuntimeText(record: GenericRecord): string {
  const preferredKeys = ['text', 'content', 'prompt'];
  for (const key of preferredKeys) {
    if (typeof record[key] === 'string') {
      return record[key] as string;
    }
  }
  return '';
}

function readStringField(record: GenericRecord, key: string): string {
  const direct = record[key];
  if (typeof direct === 'string') return direct;

  const nested = record.data;
  if (isRecord(nested) && typeof nested[key] === 'string') {
    return nested[key] as string;
  }
  return '';
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
