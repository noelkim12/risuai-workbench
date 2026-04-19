import fs from 'node:fs';
import path from 'node:path';
import {
  ELEMENT_TYPES,
  extractCBSVarOps,
  getPresetPromptTemplateItemsFromPreset,
  getPresetPromptTextsFromPreset,
  type ElementCBSData,
  type GenericRecord,
} from '@/domain';
import { parsePromptTemplateContent } from '@/domain/custom-extension/extensions/prompt-template';
import { parseRegexContent } from '@/domain/regex';
import { dirExists, readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { listJsonFilesRecursive, resolveOrderedFiles } from '@/node/json-listing';
import type { PresetCollectResult, PromptSource } from './types';

type PromptTextCarrier = unknown;

/** 추출된 preset 디렉토리에서 모든 분석 소스를 수집한다. */
export function collectPresetSources(outputDir: string): PresetCollectResult {
  const metadataJson = readJsonIfExists(path.join(outputDir, 'metadata.json'));
  const presetJson = readJsonIfExists(path.join(outputDir, 'preset.json'));
  const prompts = collectPrompts(outputDir, presetJson);
  const promptTemplates = collectPromptTemplates(outputDir, presetJson);
  const regexCBS = collectRegex(outputDir);
  const metadata = isRecord(metadataJson) ? metadataJson : isRecord(presetJson) ? presetJson : {};
  const model = asRecordOrNull(readJsonIfExists(path.join(outputDir, 'model.json')));
  const parameters = asRecordOrNull(readJsonIfExists(path.join(outputDir, 'parameters.json')));

  return { prompts, promptTemplates, regexCBS, metadata, model, parameters };
}

function collectPrompts(outputDir: string, presetJson: unknown): PromptSource[] {
  const promptsDir = path.join(outputDir, 'prompts');
  if (dirExists(promptsDir)) {
    const promptNames = ['main.txt', 'jailbreak.txt', 'global_note.txt'];
    return promptNames
      .map((fileName, index) => {
        const text = readTextIfExists(path.join(promptsDir, fileName));
        if (!text) return null;
        return buildPromptSource(fileName.replace(/\.txt$/u, ''), text, {
          chainType: fileName.replace(/\.txt$/u, ''),
          sourcePath: `prompts/${fileName}`,
          order: index,
        });
      })
      .filter((source): source is PromptSource => source != null);
  }

  return getPresetPromptTextsFromPreset(presetJson).map((entry, index) =>
    buildPromptSource(entry.name, entry.text, {
      chainType: entry.name,
      sourcePath: `prompts/${entry.name}.txt`,
      order: index,
    }),
  );
}

function collectPromptTemplates(outputDir: string, presetJson: unknown): PromptSource[] {
  const templateDir = path.join(outputDir, 'prompt_template');
  if (dirExists(templateDir)) {
    const canonicalFiles = listFilesWithSuffix(templateDir, '.risuprompt');
    if (canonicalFiles.length > 0) {
      const files = resolveOrderedFiles(templateDir, canonicalFiles);
      return files.map((filePath, index) => {
        const parsed = parsePromptTemplateContent(readTextIfExists(filePath));
        const fallbackName = path.basename(filePath, '.risuprompt');
        const name = typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : fallbackName;
        const text = readTemplateRuntimeText(parsed);
        return buildPromptSource(name, text, {
          chainType: typeof parsed.type === 'string' && parsed.type.length > 0 ? parsed.type : 'template',
          sourcePath: `prompt_template/${path.basename(filePath)}`,
          order: index,
        });
      });
    }

    const files = resolveOrderedFiles(templateDir, listJsonFilesRecursive(templateDir));
    return files.map((filePath, index) => {
      const raw = readJsonIfExists(filePath);
      const record = isRecord(raw) ? raw : {};
      const fallbackName = path.basename(filePath, '.json');
      const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : fallbackName;
      const text = readTemplateRuntimeText(record);
      return buildPromptSource(name, text, {
        chainType: typeof record.type === 'string' && record.type.length > 0 ? record.type : 'template',
        sourcePath: `prompt_template/${path.basename(filePath)}`,
        order: index,
      });
    });
  }

  return getPresetPromptTemplateItemsFromPreset(presetJson).map((item, index) => {
    const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : `template_${index + 1}`;
    return buildPromptSource(name, readTemplateRuntimeText(item), {
      chainType: typeof item.type === 'string' && item.type.length > 0 ? item.type : 'template',
      sourcePath: `prompt_template/${name}.json`,
      order: index,
    });
  });
}

function collectRegex(outputDir: string): ElementCBSData[] {
  const regexDir = path.join(outputDir, 'regex');
  if (!dirExists(regexDir)) return [];

  const canonicalFiles = resolveOrderedFiles(regexDir, listFilesWithSuffix(regexDir, '.risuregex'));
  if (canonicalFiles.length > 0) {
    return canonicalFiles.flatMap((filePath, index) => {
      const raw = parseRegexContent(readTextIfExists(filePath));
      const inOps = extractCBSVarOps(raw.in);
      const outOps = extractCBSVarOps(raw.out);
      const flagOps = extractCBSVarOps(typeof raw.flag === 'string' ? raw.flag : '');
      const reads = new Set<string>([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
      const writes = new Set<string>([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

      if (reads.size === 0 && writes.size === 0) return [];

      return [
        {
          elementType: ELEMENT_TYPES.REGEX,
          elementName: `[preset]/regex/${path.basename(filePath, '.risuregex')}`,
          reads,
          writes,
          executionOrder: canonicalFiles.length - index,
        },
      ];
    });
  }

  const files = resolveOrderedFiles(regexDir, listJsonFilesRecursive(regexDir));
  return files.flatMap((filePath, index) => {
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
          executionOrder:
            typeof raw.order === 'number' && Number.isFinite(raw.order)
              ? raw.order
              : files.length - index,
        },
      ];
    });
}

function buildPromptSource(
  name: string,
  text: string,
  meta: { chainType: string; sourcePath?: string; order: number },
): PromptSource {
  const ops = extractCBSVarOps(text);
  return {
    name,
    text,
    reads: ops.reads,
    writes: ops.writes,
    chainType: meta.chainType,
    sourcePath: meta.sourcePath,
    order: meta.order,
  };
}

function readTemplateRuntimeText(record: PromptTextCarrier): string {
  if (typeof record !== 'object' || record === null) {
    return '';
  }

  const carrier = record as Record<string, unknown>;
  const preferredKeys = ['text', 'content', 'prompt', 'innerFormat', 'defaultText'];
  for (const key of preferredKeys) {
    const value = carrier[key];
    if (typeof value === 'string') {
      return value;
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

function listFilesWithSuffix(dir: string, suffix: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(suffix))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}
