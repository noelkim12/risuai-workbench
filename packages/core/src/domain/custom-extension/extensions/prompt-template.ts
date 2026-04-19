import { sanitizeFilename } from '../../../utils/filenames';
import type { CustomExtensionTarget } from '../contracts';

const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['preset'];
const SECTION_NAMES = ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'] as const;
const PLAIN_TYPES = ['plain', 'jailbreak', 'cot'] as const;
const TYPED_TYPES = ['persona', 'description', 'lorebook', 'postEverything', 'memory'] as const;
const PROMPT_TYPES = [
  ...PLAIN_TYPES,
  'chatML',
  ...TYPED_TYPES,
  'authornote',
  'chat',
  'cache',
] as const;
const PLAIN_TYPE2_VALUES = ['normal', 'globalNote', 'main'] as const;
const PLAIN_ROLE_VALUES = ['user', 'bot', 'system'] as const;
const CACHE_ROLE_VALUES = ['user', 'assistant', 'system', 'all'] as const;

type PromptSectionName = (typeof SECTION_NAMES)[number];
type PromptPlainType = (typeof PLAIN_TYPES)[number];
type PromptTypedType = (typeof TYPED_TYPES)[number];
type PromptType = (typeof PROMPT_TYPES)[number];
type PromptPlainType2 = (typeof PLAIN_TYPE2_VALUES)[number];
type PromptPlainRole = (typeof PLAIN_ROLE_VALUES)[number];
type PromptCacheRole = (typeof CACHE_ROLE_VALUES)[number];

/** Canonical plain/jailbreak/cot prompt item. */
export interface PromptItemPlain {
  type: PromptPlainType;
  type2: PromptPlainType2;
  role: PromptPlainRole;
  text: string;
  name?: string;
}

/** Canonical chatML prompt item. */
export interface PromptItemChatML {
  type: 'chatML';
  text: string;
  name?: string;
}

/** Canonical typed prompt item. */
export interface PromptItemTyped {
  type: PromptTypedType;
  innerFormat?: string;
  name?: string;
}

/** Canonical author note prompt item. */
export interface PromptItemAuthorNote {
  type: 'authornote';
  innerFormat?: string;
  defaultText?: string;
  name?: string;
}

/** Canonical chat range prompt item. */
export interface PromptItemChat {
  type: 'chat';
  rangeStart: number;
  rangeEnd: number | 'end';
  chatAsOriginalOnSystem?: boolean;
  name?: string;
}

/** Canonical cache prompt item. */
export interface PromptItemCache {
  type: 'cache';
  name: string;
  depth: number;
  role: PromptCacheRole;
}

/** Canonical prompt-template item union. */
export type PromptTemplateContent =
  | PromptItemPlain
  | PromptItemChatML
  | PromptItemTyped
  | PromptItemAuthorNote
  | PromptItemChat
  | PromptItemCache;

/** Upstream prompt-template item shape after whitelist normalization. */
export type UpstreamPromptTemplateItem = PromptTemplateContent;

/** Parsed prompt-template file paired with its canonical filename. */
export interface PromptTemplateNamedEntry {
  fileName: string;
  content: PromptTemplateContent;
}

/** Serialized canonical prompt-template file. */
export interface SerializedPromptTemplateFile {
  fileName: string;
  path: string;
  rawContent: string;
}

/** Serialized canonical prompt-template bundle plus `_order.json` entries. */
export interface SerializedPromptTemplateBundle {
  files: SerializedPromptTemplateFile[];
  order: string[];
}

/** Error thrown when .risuprompt parsing or mapping fails. */
export class PromptTemplateAdapterError extends Error {
  constructor(message: string) {
    super(`[risuprompt] ${message}`);
    this.name = 'PromptTemplateAdapterError';
  }
}

/** parsePromptTemplateContent parses one canonical .risuprompt file. */
export function parsePromptTemplateContent(rawContent: string): PromptTemplateContent {
  const { frontmatter, body } = splitFrontmatter(rawContent);
  const metadata = parseRawFrontmatter(frontmatter);
  const sections = parsePromptSections(body);
  return parsePromptTemplateFromCanonical(metadata, sections);
}

/** serializePromptTemplateContent serializes one canonical .risuprompt item deterministically. */
export function serializePromptTemplateContent(content: PromptTemplateContent): string {
  const normalized = normalizePromptTemplateEntry(content, 'canonical prompt content');
  const frontmatterLines = serializeFrontmatter(normalized);
  const bodyLines = serializeSections(normalized);
  const lines = ['---', ...frontmatterLines, '---', ...bodyLines];
  return `${lines.join('\n')}\n`;
}

/** parsePromptTemplateOrder parses canonical `_order.json` for prompt templates. */
export function parsePromptTemplateOrder(rawContent: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new PromptTemplateAdapterError('Invalid prompt_template/_order.json. Expected valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new PromptTemplateAdapterError('Invalid prompt_template/_order.json. Expected an array of filenames.');
  }

  const seen = new Set<string>();
  return parsed.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new PromptTemplateAdapterError(
        `Invalid prompt_template/_order.json entry at index ${index}. Expected a string filename.`,
      );
    }
    if (!entry.endsWith('.risuprompt')) {
      throw new PromptTemplateAdapterError(
        `Invalid prompt_template/_order.json entry "${entry}". Expected a .risuprompt filename.`,
      );
    }
    if (entry.includes('/') || entry.includes('\\')) {
      throw new PromptTemplateAdapterError(
        `Invalid prompt_template/_order.json entry "${entry}". Expected a basename, not a path.`,
      );
    }
    if (seen.has(entry)) {
      throw new PromptTemplateAdapterError(
        `Duplicate prompt_template/_order.json entry "${entry}" is not allowed.`,
      );
    }
    seen.add(entry);
    return entry;
  });
}

/** serializePromptTemplateOrder serializes canonical `_order.json` for prompt templates. */
export function serializePromptTemplateOrder(order: readonly string[]): string {
  const normalizedOrder = parsePromptTemplateOrder(JSON.stringify([...order]));
  return `${JSON.stringify(normalizedOrder, null, 2)}\n`;
}

/** serializePromptTemplateBundle serializes preset prompt items into canonical files plus `_order.json`. */
export function serializePromptTemplateBundle(
  content: readonly PromptTemplateContent[],
  target: CustomExtensionTarget,
): SerializedPromptTemplateBundle {
  assertSupportedTarget(target);

  const usedStems = new Map<string, number>();
  const files = content.map((entry, index) => {
    const normalized = normalizePromptTemplateEntry(entry, `preset promptTemplate[${index}]`);
    const baseStem = getPromptTemplateStem(normalized);
    const occurrence = usedStems.get(baseStem) ?? 0;
    usedStems.set(baseStem, occurrence + 1);
    const stem = occurrence === 0 ? baseStem : `${baseStem}_${occurrence}`;
    const path = buildPromptTemplatePath(target, stem);
    const fileName = path.slice('prompt_template/'.length);

    return {
      fileName,
      path,
      rawContent: serializePromptTemplateContent(normalized),
    } satisfies SerializedPromptTemplateFile;
  });

  return {
    files,
    order: files.map((file) => file.fileName),
  };
}

/** rebuildPromptTemplatesInCanonicalOrder reorders parsed files strictly by `_order.json`. */
export function rebuildPromptTemplatesInCanonicalOrder(
  order: readonly string[],
  files: readonly PromptTemplateNamedEntry[],
): PromptTemplateContent[] {
  const normalizedOrder = parsePromptTemplateOrder(JSON.stringify([...order]));
  const fileMap = new Map<string, PromptTemplateContent>();

  for (const file of files) {
    if (fileMap.has(file.fileName)) {
      throw new PromptTemplateAdapterError(
        `Duplicate prompt template file "${file.fileName}" is not allowed.`,
      );
    }
    fileMap.set(file.fileName, normalizePromptTemplateEntry(file.content, file.fileName));
  }

  for (const entry of normalizedOrder) {
    if (!fileMap.has(entry)) {
      throw new PromptTemplateAdapterError(
        `prompt_template/_order.json references missing file "${entry}".`,
      );
    }
  }

  for (const fileName of fileMap.keys()) {
    if (!normalizedOrder.includes(fileName)) {
      throw new PromptTemplateAdapterError(
        `Prompt template file "${fileName}" is missing from prompt_template/_order.json.`,
      );
    }
  }

  return normalizedOrder.map((fileName) => fileMap.get(fileName)!);
}

/** extractPromptTemplateFromPreset reads promptTemplate items from preset upstream shape. */
export function extractPromptTemplateFromPreset(
  upstream: { promptTemplate?: unknown },
  target: CustomExtensionTarget,
): UpstreamPromptTemplateItem[] | null {
  assertExpectedTarget(target, 'preset');

  const promptTemplate = upstream.promptTemplate;
  if (promptTemplate === undefined || promptTemplate === null) {
    return null;
  }
  if (!Array.isArray(promptTemplate)) {
    throw new PromptTemplateAdapterError('Expected preset promptTemplate to be an array.');
  }

  return promptTemplate.map((entry, index) =>
    normalizePromptTemplateEntry(entry, `preset promptTemplate[${index}]`),
  );
}

/** injectPromptTemplateIntoPreset writes sanitized promptTemplate items into preset upstream shape. */
export function injectPromptTemplateIntoPreset(
  upstream: { promptTemplate?: UpstreamPromptTemplateItem[] },
  content: readonly PromptTemplateContent[] | null,
  target: CustomExtensionTarget,
): void {
  assertExpectedTarget(target, 'preset');

  if (content === null) {
    delete upstream.promptTemplate;
    return;
  }

  upstream.promptTemplate = content.map((entry, index) =>
    toUpstreamPromptTemplateItem(entry, `preset promptTemplate[${index}]`),
  );
}

/** buildPromptTemplatePath builds one canonical .risuprompt path. */
export function buildPromptTemplatePath(target: CustomExtensionTarget, stem?: string): string {
  assertSupportedTarget(target);
  return `prompt_template/${sanitizeFilename(stem, 'prompt')}.risuprompt`;
}

function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new PromptTemplateAdapterError(
      `Target "${target}" does not support .risuprompt. Only preset is supported.`,
    );
  }
}

function assertExpectedTarget(target: CustomExtensionTarget, expected: CustomExtensionTarget): void {
  assertSupportedTarget(target);
  if (target !== expected) {
    throw new PromptTemplateAdapterError(`Expected target "${expected}", got "${target}"`);
  }
}

function splitFrontmatter(rawContent: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(rawContent);
  if (!match) {
    throw new PromptTemplateAdapterError(
      'Expected a leading YAML frontmatter header delimited by --- lines.',
    );
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function parseRawFrontmatter(frontmatter: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const seenKeys = new Set<string>();

  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new PromptTemplateAdapterError(`Invalid frontmatter line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trimStart();
    if (seenKeys.has(key)) {
      throw new PromptTemplateAdapterError(`Duplicate frontmatter field "${key}".`);
    }
    seenKeys.add(key);
    parsed[key] = rawValue;
  }

  return parsed;
}

function parsePromptSections(body: string): Partial<Record<PromptSectionName, string>> {
  if (body.length === 0) {
    return {};
  }

  const sectionRegex = /^@@@ ([A-Z_]+)(?:\r?\n|$)/gm;
  const matches = [...body.matchAll(sectionRegex)];
  if (matches.length === 0) {
    throw new PromptTemplateAdapterError('Unexpected body content. Expected @@@ section markers only.');
  }
  if (matches[0].index !== 0) {
    throw new PromptTemplateAdapterError('Unexpected text before the first @@@ section marker.');
  }

  const sections: Partial<Record<PromptSectionName, string>> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = match[1] as PromptSectionName;
    if (!SECTION_NAMES.includes(name)) {
      throw new PromptTemplateAdapterError(`Unsupported body section "${match[1]}".`);
    }
    if (Object.prototype.hasOwnProperty.call(sections, name)) {
      throw new PromptTemplateAdapterError(`Duplicate body section "${name}".`);
    }

    const contentStart = match.index! + match[0].length;
    const contentEnd = index + 1 < matches.length ? matches[index + 1].index! : body.length;
    sections[name] = stripStructuralTrailingLineEnding(body.slice(contentStart, contentEnd));
  }

  return sections;
}

function stripStructuralTrailingLineEnding(content: string): string {
  if (content.endsWith('\r\n')) {
    return content.slice(0, -2);
  }
  if (content.endsWith('\n')) {
    return content.slice(0, -1);
  }
  return content;
}

function parsePromptTemplateFromCanonical(
  metadata: Record<string, string>,
  sections: Partial<Record<PromptSectionName, string>>,
): PromptTemplateContent {
  const type = parsePromptType(requireFrontmatter(metadata, 'type'));

  switch (type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      ensureAllowedFrontmatterFields(metadata, ['type', 'type2', 'role', 'name']);
      ensureAllowedSections(sections, ['TEXT']);
      return {
        type,
        type2: parsePlainType2(requireFrontmatter(metadata, 'type2')),
        role: parsePlainRole(requireFrontmatter(metadata, 'role')),
        ...(hasFrontmatter(metadata, 'name') ? { name: parseFrontmatterString(metadata.name) } : {}),
        text: readRequiredTextSection(sections, 'TEXT'),
      };
    case 'chatML':
      ensureAllowedFrontmatterFields(metadata, ['type', 'name']);
      ensureAllowedSections(sections, ['TEXT']);
      return {
        type,
        ...(hasFrontmatter(metadata, 'name') ? { name: parseFrontmatterString(metadata.name) } : {}),
        text: readRequiredTextSection(sections, 'TEXT'),
      };
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      ensureAllowedFrontmatterFields(metadata, ['type', 'name']);
      ensureAllowedSections(sections, ['INNER_FORMAT']);
      return {
        type,
        ...(hasFrontmatter(metadata, 'name') ? { name: parseFrontmatterString(metadata.name) } : {}),
        ...(hasSection(sections, 'INNER_FORMAT') ? { innerFormat: sections.INNER_FORMAT } : {}),
      };
    case 'authornote':
      ensureAllowedFrontmatterFields(metadata, ['type', 'name']);
      ensureAllowedSections(sections, ['INNER_FORMAT', 'DEFAULT_TEXT']);
      return {
        type,
        ...(hasFrontmatter(metadata, 'name') ? { name: parseFrontmatterString(metadata.name) } : {}),
        ...(hasSection(sections, 'INNER_FORMAT') ? { innerFormat: sections.INNER_FORMAT } : {}),
        ...(hasSection(sections, 'DEFAULT_TEXT') ? { defaultText: sections.DEFAULT_TEXT } : {}),
      };
    case 'chat':
      ensureAllowedFrontmatterFields(metadata, [
        'type',
        'name',
        'range_start',
        'range_end',
        'chat_as_original_on_system',
      ]);
      ensureAllowedSections(sections, []);
      return {
        type,
        ...(hasFrontmatter(metadata, 'name') ? { name: parseFrontmatterString(metadata.name) } : {}),
        rangeStart: parseIntegerFrontmatter(requireFrontmatter(metadata, 'range_start'), 'range_start'),
        rangeEnd: parseRangeEndFrontmatter(requireFrontmatter(metadata, 'range_end')),
        ...(hasFrontmatter(metadata, 'chat_as_original_on_system')
          ? {
              chatAsOriginalOnSystem: parseBooleanFrontmatter(
                metadata.chat_as_original_on_system,
                'chat_as_original_on_system',
              ),
            }
          : {}),
      };
    case 'cache':
      ensureAllowedFrontmatterFields(metadata, ['type', 'name', 'depth', 'cache_role']);
      ensureAllowedSections(sections, []);
      return {
        type,
        name: parseFrontmatterString(requireFrontmatter(metadata, 'name')),
        depth: parseIntegerFrontmatter(requireFrontmatter(metadata, 'depth'), 'depth'),
        role: parseCacheRole(requireFrontmatter(metadata, 'cache_role')),
      };
  }
}

function serializeFrontmatter(content: PromptTemplateContent): string[] {
  switch (content.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      return [
        `type: ${content.type}`,
        `type2: ${content.type2}`,
        `role: ${content.role}`,
        ...(content.name !== undefined ? [`name: ${formatFrontmatterString(content.name)}`] : []),
      ];
    case 'chatML':
      return ['type: chatML', ...(content.name !== undefined ? [`name: ${formatFrontmatterString(content.name)}`] : [])];
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
    case 'authornote':
      return [`type: ${content.type}`, ...(content.name !== undefined ? [`name: ${formatFrontmatterString(content.name)}`] : [])];
    case 'chat':
      return [
        'type: chat',
        ...(content.name !== undefined ? [`name: ${formatFrontmatterString(content.name)}`] : []),
        `range_start: ${content.rangeStart}`,
        `range_end: ${content.rangeEnd === 'end' ? 'end' : String(content.rangeEnd)}`,
        ...(content.chatAsOriginalOnSystem !== undefined
          ? [`chat_as_original_on_system: ${String(content.chatAsOriginalOnSystem)}`]
          : []),
      ];
    case 'cache':
      return [
        'type: cache',
        `name: ${formatFrontmatterString(content.name)}`,
        `depth: ${content.depth}`,
        `cache_role: ${content.role}`,
      ];
  }
}

function serializeSections(content: PromptTemplateContent): string[] {
  switch (content.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
    case 'chatML':
      return ['@@@ TEXT', content.text];
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return content.innerFormat !== undefined ? ['@@@ INNER_FORMAT', content.innerFormat] : [];
    case 'authornote': {
      const lines: string[] = [];
      if (content.innerFormat !== undefined) {
        lines.push('@@@ INNER_FORMAT', content.innerFormat);
      }
      if (content.defaultText !== undefined) {
        lines.push('@@@ DEFAULT_TEXT', content.defaultText);
      }
      return lines;
    }
    case 'chat':
    case 'cache':
      return [];
  }
}

function normalizePromptTemplateEntry(entry: unknown, context: string): PromptTemplateContent {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new PromptTemplateAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  const type = parsePromptType(requireString(record.type, `${context}.type`));

  switch (type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      return {
        type,
        type2: parsePlainType2(requireString(record.type2, `${context}.type2`)),
        role: parsePlainRole(requireString(record.role, `${context}.role`)),
        text: requireString(record.text, `${context}.text`),
        ...(record.name !== undefined ? { name: requireString(record.name, `${context}.name`) } : {}),
      };
    case 'chatML':
      return {
        type,
        text: requireString(record.text, `${context}.text`),
        ...(record.name !== undefined ? { name: requireString(record.name, `${context}.name`) } : {}),
      };
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return {
        type,
        ...(record.innerFormat !== undefined
          ? { innerFormat: requireString(record.innerFormat, `${context}.innerFormat`) }
          : {}),
        ...(record.name !== undefined ? { name: requireString(record.name, `${context}.name`) } : {}),
      };
    case 'authornote':
      return {
        type,
        ...(record.innerFormat !== undefined
          ? { innerFormat: requireString(record.innerFormat, `${context}.innerFormat`) }
          : {}),
        ...(record.defaultText !== undefined
          ? { defaultText: requireString(record.defaultText, `${context}.defaultText`) }
          : {}),
        ...(record.name !== undefined ? { name: requireString(record.name, `${context}.name`) } : {}),
      };
    case 'chat':
      return {
        type,
        rangeStart: requireInteger(record.rangeStart, `${context}.rangeStart`),
        rangeEnd: requireRangeEnd(record.rangeEnd, `${context}.rangeEnd`),
        ...(record.chatAsOriginalOnSystem !== undefined
          ? {
              chatAsOriginalOnSystem: requireBoolean(
                record.chatAsOriginalOnSystem,
                `${context}.chatAsOriginalOnSystem`,
              ),
            }
          : {}),
        ...(record.name !== undefined ? { name: requireString(record.name, `${context}.name`) } : {}),
      };
    case 'cache':
      return {
        type,
        name: requireString(record.name, `${context}.name`),
        depth: requireInteger(record.depth, `${context}.depth`),
        role: parseCacheRole(requireString(record.role, `${context}.role`)),
      };
  }
}

function toUpstreamPromptTemplateItem(entry: unknown, context: string): UpstreamPromptTemplateItem {
  const normalized = normalizePromptTemplateEntry(entry, context);

  switch (normalized.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      return {
        type: normalized.type,
        type2: normalized.type2,
        role: normalized.role,
        text: normalized.text,
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      };
    case 'chatML':
      return {
        type: 'chatML',
        text: normalized.text,
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      };
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return {
        type: normalized.type,
        ...(normalized.innerFormat !== undefined ? { innerFormat: normalized.innerFormat } : {}),
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      };
    case 'authornote':
      return {
        type: 'authornote',
        ...(normalized.innerFormat !== undefined ? { innerFormat: normalized.innerFormat } : {}),
        ...(normalized.defaultText !== undefined ? { defaultText: normalized.defaultText } : {}),
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      };
    case 'chat':
      return {
        type: 'chat',
        rangeStart: normalized.rangeStart,
        rangeEnd: normalized.rangeEnd,
        ...(normalized.chatAsOriginalOnSystem !== undefined
          ? { chatAsOriginalOnSystem: normalized.chatAsOriginalOnSystem }
          : {}),
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      };
    case 'cache':
      return {
        type: 'cache',
        name: normalized.name,
        depth: normalized.depth,
        role: normalized.role,
      };
  }
}

function requireFrontmatter(metadata: Record<string, string>, key: string): string {
  if (!hasFrontmatter(metadata, key)) {
    throw new PromptTemplateAdapterError(`Frontmatter must include required field "${key}".`);
  }
  return metadata[key];
}

function hasFrontmatter(metadata: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, key);
}

function hasSection(sections: Partial<Record<PromptSectionName, string>>, name: PromptSectionName): boolean {
  return Object.prototype.hasOwnProperty.call(sections, name);
}

function readRequiredTextSection(
  sections: Partial<Record<PromptSectionName, string>>,
  name: 'TEXT',
): string {
  return hasSection(sections, name) ? sections[name]! : '';
}

function ensureAllowedFrontmatterFields(metadata: Record<string, string>, allowed: readonly string[]): void {
  for (const key of Object.keys(metadata)) {
    if (!allowed.includes(key)) {
      throw new PromptTemplateAdapterError(`Unsupported frontmatter field "${key}".`);
    }
  }
}

function ensureAllowedSections(
  sections: Partial<Record<PromptSectionName, string>>,
  allowed: readonly PromptSectionName[],
): void {
  for (const key of Object.keys(sections)) {
    if (!allowed.includes(key as PromptSectionName)) {
      throw new PromptTemplateAdapterError(`Unsupported body section "${key}".`);
    }
  }
}

function parsePromptType(value: string): PromptType {
  if (!PROMPT_TYPES.includes(value as PromptType)) {
    throw new PromptTemplateAdapterError(
      `Unsupported prompt template type "${value}". Expected one of: ${PROMPT_TYPES.join(', ')}.`,
    );
  }
  return value as PromptType;
}

function parsePlainType2(rawValue: string): PromptPlainType2 {
  const value = parseFrontmatterString(rawValue);
  if (!PLAIN_TYPE2_VALUES.includes(value as PromptPlainType2)) {
    throw new PromptTemplateAdapterError(
      `Unsupported type2 value "${value}". Expected one of: ${PLAIN_TYPE2_VALUES.join(', ')}.`,
    );
  }
  return value as PromptPlainType2;
}

function parsePlainRole(rawValue: string): PromptPlainRole {
  const value = parseFrontmatterString(rawValue);
  if (!PLAIN_ROLE_VALUES.includes(value as PromptPlainRole)) {
    throw new PromptTemplateAdapterError(
      `Unsupported role value "${value}". Expected one of: ${PLAIN_ROLE_VALUES.join(', ')}.`,
    );
  }
  return value as PromptPlainRole;
}

function parseCacheRole(rawValue: string): PromptCacheRole {
  const value = parseFrontmatterString(rawValue);
  if (!CACHE_ROLE_VALUES.includes(value as PromptCacheRole)) {
    throw new PromptTemplateAdapterError(
      `Unsupported cache_role value "${value}". Expected one of: ${CACHE_ROLE_VALUES.join(', ')}.`,
    );
  }
  return value as PromptCacheRole;
}

function parseIntegerFrontmatter(rawValue: string, fieldName: string): number {
  if (!/^-?\d+$/.test(rawValue)) {
    throw new PromptTemplateAdapterError(
      `Invalid ${fieldName} value "${parseFrontmatterString(rawValue)}". Expected an integer.`,
    );
  }
  return Number(rawValue);
}

function parseRangeEndFrontmatter(rawValue: string): number | 'end' {
  if (/^-?\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  const value = parseFrontmatterString(rawValue);
  if (value === 'end') {
    return 'end';
  }

  throw new PromptTemplateAdapterError(
    `Invalid range_end value "${value}". Expected an integer or literal "end".`,
  );
}

function parseBooleanFrontmatter(rawValue: string, fieldName: string): boolean {
  const value = parseFrontmatterString(rawValue);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new PromptTemplateAdapterError(
    `Invalid ${fieldName} value "${value}". Expected true or false.`,
  );
}

function parseFrontmatterString(rawValue: string): string {
  if (rawValue.length === 0) {
    return '';
  }
  if (rawValue.startsWith('"') !== rawValue.endsWith('"')) {
    throw new PromptTemplateAdapterError(`Invalid quoted string value ${rawValue}`);
  }
  if (rawValue.startsWith("'") !== rawValue.endsWith("'")) {
    throw new PromptTemplateAdapterError(`Invalid quoted string value ${rawValue}`);
  }
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (typeof parsed !== 'string') {
        throw new Error('not a string');
      }
      return parsed;
    } catch {
      throw new PromptTemplateAdapterError(`Invalid quoted string value ${rawValue}`);
    }
  }
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replace(/''/g, "'");
  }
  return rawValue;
}

function formatFrontmatterString(value: string): string {
  if (value === '') {
    return '""';
  }
  if (/[:"]|^\s|\s$|\r|\n/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new PromptTemplateAdapterError(`Expected ${context} to be a string.`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new PromptTemplateAdapterError(`Expected ${context} to be a boolean.`);
  }
  return value;
}

function requireInteger(value: unknown, context: string): number {
  if (!Number.isInteger(value)) {
    throw new PromptTemplateAdapterError(`Expected ${context} to be an integer.`);
  }
  return value as number;
}

function requireRangeEnd(value: unknown, context: string): number | 'end' {
  if (value === 'end') {
    return 'end';
  }
  if (Number.isInteger(value)) {
    return value as number;
  }
  throw new PromptTemplateAdapterError(`Expected ${context} to be an integer or literal "end".`);
}

function getPromptTemplateStem(content: PromptTemplateContent): string {
  const preferred = 'name' in content && typeof content.name === 'string' && content.name.trim().length > 0
    ? content.name
    : content.type;
  return sanitizeFilename(preferred, content.type);
}
