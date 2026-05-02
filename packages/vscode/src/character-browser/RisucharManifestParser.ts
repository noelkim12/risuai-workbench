/**
 * `.risuchar` manifest parsing, validation, and normalization helpers.
 * @file packages/vscode/src/character-browser/RisucharManifestParser.ts
 */

import { createHash } from 'node:crypto';
import type {
  CharacterSourceFormat,
  ManifestParseWarning,
  RisucharManifestNormalized,
  RisucharManifestRaw,
} from './characterBrowserTypes';

const REQUIRED_FIELDS = [
  'kind',
  'schemaVersion',
  'id',
  'name',
  'creator',
  'characterVersion',
  'createdAt',
  'modifiedAt',
  'sourceFormat',
  'flags',
] as const;

const KNOWN_FIELDS = new Set<string>([
  '$schema',
  ...REQUIRED_FIELDS,
  'image',
  'tags',
]);

const SOURCE_FORMATS = new Set<CharacterSourceFormat>(['charx', 'png', 'json', 'scaffold']);

export interface ParseManifestInput {
  text: string;
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel: string;
  stableHashSeed: string;
}

/**
 * RisucharManifestParser 클래스.
 * Raw `.risuchar` JSON을 sidebar용 normalized manifest model로 변환함.
 */
export class RisucharManifestParser {
  /**
   * parse 함수.
   * JSON manifest를 파싱하고 schema-lite validation warning을 수집함.
   *
   * @param input - manifest text와 경로 label/hash seed 정보
   * @returns normalized manifest와 structured parse warnings
   */
  parse(input: ParseManifestInput): RisucharManifestNormalized {
    const warnings: ManifestParseWarning[] = [];
    const parsed = parseJsonRecord(input.text, warnings);

    if (!parsed) {
      return this.createInvalidManifest(input, warnings);
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        warnings.push({
          code: 'missingRequiredField',
          field,
          message: `${field} is required by risuchar.schema.json.`,
        });
      }
    }

    const raw = parsed as RisucharManifestRaw;
    const name = readString(raw.name, 'Unnamed character', 'name', warnings);
    const creator = readString(raw.creator, 'Unknown creator', 'creator', warnings);
    const characterVersion = readString(raw.characterVersion, 'unknown', 'characterVersion', warnings);
    const manifestId = normalizeManifestId(raw.id, warnings);
    const stableId = manifestId.trim() || createStableId(input.rootPathLabel, name, input.stableHashSeed, warnings);
    const sourceFormat = normalizeSourceFormat(raw.sourceFormat, warnings);
    const flags = normalizeFlags(raw.flags, warnings);
    const createdAt = normalizeTimestamp(raw.createdAt, 'createdAt', warnings);
    const modifiedAt = normalizeTimestamp(raw.modifiedAt, 'modifiedAt', warnings);
    const tags = normalizeTags(raw.tags, warnings);
    const imagePath = normalizeImagePath(raw.image, warnings);

    if (raw.kind !== 'risu.character') {
      warnings.push({
        code: 'invalidKind',
        field: 'kind',
        message: 'kind must be "risu.character".',
      });
    }

    if (raw.schemaVersion !== 1) {
      warnings.push({
        code: 'unknownSchemaVersion',
        field: 'schemaVersion',
        message: 'schemaVersion must be 1.',
      });
    }

    const valid =
      hasRequiredFields(parsed) &&
      raw.kind === 'risu.character' &&
      raw.schemaVersion === 1 &&
      typeof raw.id === 'string' &&
      typeof raw.name === 'string' &&
      typeof raw.creator === 'string' &&
      typeof raw.characterVersion === 'string' &&
      Boolean(sourceFormat !== 'unknown') &&
      flags.valid;

    return {
      stableId,
      manifestId,
      name,
      creator,
      characterVersion,
      createdAt,
      modifiedAt,
      sourceFormat,
      imagePath,
      tags,
      flags: flags.value,
      markerUri: input.markerUri,
      rootUri: input.rootUri,
      rootPathLabel: input.rootPathLabel,
      markerPathLabel: input.markerPathLabel,
      parseWarnings: warnings,
      extra: collectExtra(parsed),
      valid,
    };
  }

  private createInvalidManifest(
    input: ParseManifestInput,
    warnings: ManifestParseWarning[],
  ): RisucharManifestNormalized {
    return {
      stableId: createStableId(input.rootPathLabel, 'invalid', input.stableHashSeed, warnings),
      manifestId: '',
      name: 'Invalid .risuchar manifest',
      creator: 'Unknown creator',
      characterVersion: 'unknown',
      createdAt: null,
      modifiedAt: null,
      sourceFormat: 'unknown',
      imagePath: null,
      tags: [],
      flags: { utilityBot: false, lowLevelAccess: false },
      markerUri: input.markerUri,
      rootUri: input.rootUri,
      rootPathLabel: input.rootPathLabel,
      markerPathLabel: input.markerPathLabel,
      parseWarnings: warnings,
      extra: {},
      valid: false,
    };
  }
}

/**
 * createManifestReadErrorModel 함수.
 * 파일 read 단계에서 실패한 marker도 sidebar invalid card로 노출함.
 *
 * @param input - marker/root path metadata
 * @param error - read 실패 원인
 * @returns invalid normalized manifest
 */
export function createManifestReadErrorModel(
  input: Omit<ParseManifestInput, 'text'>,
  error: unknown,
): RisucharManifestNormalized {
  const message = error instanceof Error ? error.message : String(error);
  return {
    stableId: createStableId(input.rootPathLabel, 'read-error', input.stableHashSeed, []),
    manifestId: '',
    name: 'Unreadable .risuchar manifest',
    creator: 'Unknown creator',
    characterVersion: 'unknown',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'unknown',
    imagePath: null,
    tags: [],
    flags: { utilityBot: false, lowLevelAccess: false },
    markerUri: input.markerUri,
    rootUri: input.rootUri,
    rootPathLabel: input.rootPathLabel,
    markerPathLabel: input.markerPathLabel,
    parseWarnings: [{ code: 'readError', message: `Could not read .risuchar: ${message}` }],
    extra: {},
    valid: false,
  };
}

function parseJsonRecord(text: string, warnings: ManifestParseWarning[]): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed)) return parsed;
    warnings.push({ code: 'invalidJson', message: '.risuchar must contain a JSON object.' });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push({ code: 'invalidJson', message: `Invalid JSON: ${message}` });
    return null;
  }
}

function hasRequiredFields(record: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.every((field) => field in record);
}

function readString(
  value: unknown,
  fallback: string,
  field: string,
  warnings: ManifestParseWarning[],
): string {
  if (typeof value === 'string') return value;
  warnings.push({ code: 'missingRequiredField', field, message: `${field} must be a string.` });
  return fallback;
}

function normalizeManifestId(value: unknown, warnings: ManifestParseWarning[]): string {
  if (typeof value === 'string') return value;
  warnings.push({ code: 'missingRequiredField', field: 'id', message: 'id must be a string.' });
  return '';
}

function normalizeSourceFormat(value: unknown, warnings: ManifestParseWarning[]): CharacterSourceFormat | 'unknown' {
  if (typeof value === 'string' && SOURCE_FORMATS.has(value as CharacterSourceFormat)) {
    return value as CharacterSourceFormat;
  }
  warnings.push({
    code: 'invalidSourceFormat',
    field: 'sourceFormat',
    message: 'sourceFormat must be one of charx, png, json, or scaffold.',
  });
  return 'unknown';
}

function normalizeFlags(
  value: unknown,
  warnings: ManifestParseWarning[],
): { value: { utilityBot: boolean; lowLevelAccess: boolean }; valid: boolean } {
  if (!isRecord(value)) {
    warnings.push({ code: 'invalidFlagType', field: 'flags', message: 'flags must be an object.' });
    return { value: { utilityBot: false, lowLevelAccess: false }, valid: false };
  }

  const utilityBot = value.utilityBot;
  const lowLevelAccess = value.lowLevelAccess;
  const valid = typeof utilityBot === 'boolean' && typeof lowLevelAccess === 'boolean';

  if (typeof utilityBot !== 'boolean') {
    warnings.push({ code: 'invalidFlagType', field: 'flags.utilityBot', message: 'flags.utilityBot must be boolean.' });
  }
  if (typeof lowLevelAccess !== 'boolean') {
    warnings.push({
      code: 'invalidFlagType',
      field: 'flags.lowLevelAccess',
      message: 'flags.lowLevelAccess must be boolean.',
    });
  }

  return {
    value: {
      utilityBot: utilityBot === true,
      lowLevelAccess: lowLevelAccess === true,
    },
    valid,
  };
}

function normalizeTimestamp(
  value: unknown,
  field: 'createdAt' | 'modifiedAt',
  warnings: ManifestParseWarning[],
): string | null {
  if (value === null) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return value;
    warnings.push({ code: 'invalidDateTime', field, message: `${field} must be an ISO date-time string or null.` });
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value >= 1_000_000_000_000 ? value : value >= 1_000_000_000 ? value * 1000 : NaN;
    if (Number.isFinite(millis)) {
      warnings.push({
        code: 'legacyNumericTimestamp',
        field,
        message: `${field} is numeric but schema expects an ISO date-time string or null.`,
      });
      return new Date(millis).toISOString();
    }
  }
  warnings.push({ code: 'invalidDateTime', field, message: `${field} could not be normalized.` });
  return null;
}

function normalizeTags(value: unknown, warnings: ManifestParseWarning[]): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string');
  warnings.push({ code: 'missingOptionalField', field: 'tags', message: 'tags must be an array of strings when present.' });
  return [];
}

function normalizeImagePath(value: unknown, warnings: ManifestParseWarning[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  warnings.push({ code: 'missingOptionalField', field: 'image', message: 'image must be a string or null when present.' });
  return null;
}

function createStableId(
  rootPathLabel: string,
  name: string,
  seed: string,
  warnings: ManifestParseWarning[],
): string {
  if (!warnings.some((warning) => warning.code === 'emptyManifestId')) {
    warnings.push({ code: 'emptyManifestId', field: 'id', message: 'manifest.id is empty; using a stable path hash fallback.' });
  }
  const slug = slugify(name || rootPathLabel) || 'character';
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 10);
  return `${slug}-${hash}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function collectExtra(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !KNOWN_FIELDS.has(key)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
