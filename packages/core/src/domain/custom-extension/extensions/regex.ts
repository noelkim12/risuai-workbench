import { sanitizeFilename } from '../../../utils/filenames';
import type { CustomExtensionTarget } from '../contracts';

/** Accepted canonical regex types. */
export const REGEX_TYPES = [
  'editinput',
  'editoutput',
  'editdisplay',
  'editprocess',
  'disabled',
] as const;

/** Canonical regex type. */
export type RegexType = (typeof REGEX_TYPES)[number];

/** Canonical .risuregex entry. */
export interface RegexContent {
  /** Human-facing regex name/comment. */
  comment: string;
  /** Upstream regex type discriminator. */
  type: RegexType;
  /** Raw regex flag string, preserved exactly when present. */
  flag?: string;
  /** Raw ableFlag boolean, preserved exactly when present. */
  ableFlag?: boolean;
  /** `@@@ IN` section body. */
  in: string;
  /** `@@@ OUT` section body. */
  out: string;
}

/** Upstream regex/customscript shape. */
export interface UpstreamRegexEntry {
  comment: string;
  type: string;
  flag?: string;
  ableFlag?: boolean;
  in: string;
  out: string;
}

const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['charx', 'module', 'preset'];

/** Error thrown when .risuregex parsing or mapping fails. */
export class RegexAdapterError extends Error {
  constructor(message: string) {
    super(`[risuregex] ${message}`);
    this.name = 'RegexAdapterError';
  }
}

/** parseRegexContent parses one canonical .risuregex file. */
export function parseRegexContent(rawContent: string): RegexContent {
  const { frontmatter, body } = splitFrontmatter(rawContent);
  const metadata = parseFrontmatter(frontmatter);
  const sections = parseRegexSections(body);

  return {
    comment: metadata.comment,
    type: metadata.type,
    ...(metadata.ableFlag !== undefined ? { ableFlag: metadata.ableFlag } : {}),
    ...(metadata.flag !== undefined ? { flag: metadata.flag } : {}),
    in: sections.in,
    out: sections.out,
  };
}

/** serializeRegexContent serializes one canonical .risuregex file deterministically. */
export function serializeRegexContent(content: RegexContent): string {
  const normalized = normalizeRegexEntry(content, 'canonical regex content');
  const headerLines = [
    '---',
    `comment: ${formatFrontmatterString(normalized.comment)}`,
    `type: ${normalized.type}`,
    ...(normalized.ableFlag !== undefined ? [`ableFlag: ${String(normalized.ableFlag)}`] : []),
    ...(normalized.flag !== undefined ? [`flag: ${formatFrontmatterString(normalized.flag)}`] : []),
    '---',
    '@@@ IN',
    normalized.in,
    '@@@ OUT',
    normalized.out,
    '',
  ];

  return headerLines.join('\n');
}

/** extractRegexFromCharx reads regex entries from charx upstream shape. */
export function extractRegexFromCharx(
  upstream: { data?: { extensions?: { risuai?: { customScripts?: unknown } } } },
  target: CustomExtensionTarget,
): RegexContent[] | null {
  assertExpectedTarget(target, 'charx');
  return normalizeRegexCollection(
    upstream.data?.extensions?.risuai?.customScripts,
    'charx extensions.risuai.customScripts',
  );
}

/** extractRegexFromModule reads regex entries from module upstream shape. */
export function extractRegexFromModule(
  upstream: { regex?: unknown },
  target: CustomExtensionTarget,
): RegexContent[] | null {
  assertExpectedTarget(target, 'module');
  return normalizeRegexCollection(upstream.regex, 'module regex');
}

/** extractRegexFromPreset reads regex entries from preset upstream shape. */
export function extractRegexFromPreset(
  upstream: { presetRegex?: unknown },
  target: CustomExtensionTarget,
): RegexContent[] | null {
  assertExpectedTarget(target, 'preset');
  return normalizeRegexCollection(upstream.presetRegex, 'preset presetRegex');
}

/** injectRegexIntoCharx writes canonical regex entries into charx upstream shape. */
export function injectRegexIntoCharx(
  upstream: { data?: { extensions?: { risuai?: { customScripts?: UpstreamRegexEntry[] } } } },
  content: RegexContent[] | null,
  target: CustomExtensionTarget,
): void {
  assertExpectedTarget(target, 'charx');

  if (content === null) {
    upstream.data?.extensions?.risuai && delete upstream.data.extensions.risuai.customScripts;
    return;
  }

  if (!upstream.data) {
    upstream.data = {};
  }
  if (!upstream.data.extensions) {
    upstream.data.extensions = {};
  }
  if (!upstream.data.extensions.risuai) {
    upstream.data.extensions.risuai = {};
  }

  upstream.data.extensions.risuai.customScripts = content.map((entry, index) =>
    toUpstreamRegexEntry(entry, `charx regex[${index}]`),
  );
}

/** injectRegexIntoModule writes canonical regex entries into module upstream shape. */
export function injectRegexIntoModule(
  upstream: { regex?: UpstreamRegexEntry[] },
  content: RegexContent[] | null,
  target: CustomExtensionTarget,
): void {
  assertExpectedTarget(target, 'module');

  if (content === null) {
    delete upstream.regex;
    return;
  }

  upstream.regex = content.map((entry, index) => toUpstreamRegexEntry(entry, `module regex[${index}]`));
}

/** injectRegexIntoPreset writes canonical regex entries into preset upstream shape. */
export function injectRegexIntoPreset(
  upstream: { presetRegex?: UpstreamRegexEntry[] },
  content: RegexContent[] | null,
  target: CustomExtensionTarget,
): void {
  assertExpectedTarget(target, 'preset');

  if (content === null) {
    delete upstream.presetRegex;
    return;
  }

  upstream.presetRegex = content.map((entry, index) =>
    toUpstreamRegexEntry(entry, `preset regex[${index}]`),
  );
}

/** buildRegexPath builds the canonical file path for one regex entry. */
export function buildRegexPath(target: CustomExtensionTarget, stem?: string): string {
  assertSupportedTarget(target);
  return `regex/${sanitizeFilename(stem, 'regex')}.risuregex`;
}

function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new RegexAdapterError(
      `Target "${target}" does not support .risuregex. Only charx, module, and preset are supported.`,
    );
  }
}

function assertExpectedTarget(
  target: CustomExtensionTarget,
  expected: CustomExtensionTarget,
): void {
  assertSupportedTarget(target);
  if (target !== expected) {
    throw new RegexAdapterError(`Expected target "${expected}", got "${target}"`);
  }
}

function splitFrontmatter(rawContent: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(rawContent);
  if (!match) {
    throw new RegexAdapterError('Expected a leading YAML frontmatter header delimited by --- lines.');
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function parseFrontmatter(frontmatter: string): Pick<RegexContent, 'comment' | 'type' | 'flag' | 'ableFlag'> {
  const parsed: Partial<Pick<RegexContent, 'comment' | 'type' | 'flag' | 'ableFlag'>> = {};
  const seenKeys = new Set<string>();

  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new RegexAdapterError(`Invalid frontmatter line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trimStart();
    if (seenKeys.has(key)) {
      throw new RegexAdapterError(`Duplicate frontmatter field "${key}".`);
    }
    seenKeys.add(key);

    switch (key) {
      case 'comment':
        parsed.comment = parseFrontmatterString(rawValue);
        break;
      case 'type':
        parsed.type = parseRegexType(parseFrontmatterString(rawValue));
        break;
      case 'flag':
        parsed.flag = parseFrontmatterString(rawValue);
        break;
      case 'ableFlag':
        parsed.ableFlag = parseFrontmatterBoolean(rawValue);
        break;
      default:
        throw new RegexAdapterError(`Unsupported frontmatter field "${key}".`);
    }
  }

  if (parsed.comment === undefined) {
    throw new RegexAdapterError('Frontmatter must include required field "comment".');
  }
  if (parsed.type === undefined) {
    throw new RegexAdapterError('Frontmatter must include required field "type".');
  }

  return parsed as Pick<RegexContent, 'comment' | 'type' | 'flag' | 'ableFlag'>;
}

function parseRegexSections(body: string): Pick<RegexContent, 'in' | 'out'> {
  const inMatch = /^@@@ IN(?:\r?\n|$)/.exec(body);
  if (!inMatch) {
    throw new RegexAdapterError('Expected body to begin with an @@@ IN section.');
  }

  const afterIn = body.slice(inMatch[0].length);
  const outMatch = /(?:^|\r?\n)@@@ OUT(?:\r?\n|$)/.exec(afterIn);
  if (!outMatch) {
    throw new RegexAdapterError('Expected both @@@ IN and @@@ OUT sections.');
  }

  return {
    in: afterIn.slice(0, outMatch.index),
    out: stripStructuralTrailingLineEnding(afterIn.slice(outMatch.index + outMatch[0].length)),
  };
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

function parseFrontmatterString(rawValue: string): string {
  if (rawValue.length === 0) {
    return '';
  }

  if (rawValue.startsWith('"') !== rawValue.endsWith('"')) {
    throw new RegexAdapterError(`Invalid quoted string value ${rawValue}`);
  }

  if (rawValue.startsWith("'") !== rawValue.endsWith("'")) {
    throw new RegexAdapterError(`Invalid quoted string value ${rawValue}`);
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (typeof parsed !== 'string') {
        throw new Error('not a string');
      }
      return parsed;
    } catch {
      throw new RegexAdapterError(`Invalid quoted string value ${rawValue}`);
    }
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replace(/''/g, "'");
  }

  return rawValue;
}

function parseFrontmatterBoolean(rawValue: string): boolean {
  const value = parseFrontmatterString(rawValue);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new RegexAdapterError(`Invalid ableFlag value "${value}". Expected true or false.`);
}

function formatFrontmatterString(value: string): string {
  if (value === '') {
    return '""';
  }

  if (/\s|:|"/.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}

function parseRegexType(value: string): RegexType {
  if (!REGEX_TYPES.includes(value as RegexType)) {
    throw new RegexAdapterError(
      `Unsupported regex type "${value}". Expected one of: ${REGEX_TYPES.join(', ')}.`,
    );
  }
  return value as RegexType;
}

function normalizeRegexCollection(collection: unknown, context: string): RegexContent[] | null {
  if (collection === undefined || collection === null) {
    return null;
  }

  if (!Array.isArray(collection)) {
    throw new RegexAdapterError(`Expected ${context} to be an array.`);
  }

  return collection.map((entry, index) => normalizeRegexEntry(entry, `${context}[${index}]`));
}

function normalizeRegexEntry(entry: unknown, context: string): RegexContent {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new RegexAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  const comment = requireString(record.comment, `${context}.comment`);
  const type = parseRegexType(requireString(record.type, `${context}.type`));
  const input = requireString(record.in, `${context}.in`);
  const output = requireString(record.out, `${context}.out`);

  const normalized: RegexContent = {
    comment,
    type,
    in: input,
    out: output,
  };

  if (record.flag !== undefined) {
    normalized.flag = requireString(record.flag, `${context}.flag`);
  }

  if (record.ableFlag !== undefined) {
    normalized.ableFlag = requireBoolean(record.ableFlag, `${context}.ableFlag`);
  }

  return normalized;
}

function toUpstreamRegexEntry(entry: RegexContent, context: string): UpstreamRegexEntry {
  const normalized = normalizeRegexEntry(entry, context);
  return {
    comment: normalized.comment,
    type: normalized.type,
    ...(normalized.flag !== undefined ? { flag: normalized.flag } : {}),
    ...(normalized.ableFlag !== undefined ? { ableFlag: normalized.ableFlag } : {}),
    in: normalized.in,
    out: normalized.out,
  };
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new RegexAdapterError(`Expected ${context} to be a string.`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RegexAdapterError(`Expected ${context} to be a boolean.`);
  }
  return value;
}
