import { diffLines } from 'diff';

import { PRESERVED_CHARACTER_KEYS } from './merge';
import { HMR_ASSET_PLACEHOLDER_PREFIX, type HmrAssetEntry } from './protocol';

export const MAX_DIFF_LINES = 400;
export const MAX_DIFF_CHARS = 50_000;
export const ASSET_MASK = '⟨asset⟩';

type JsonLikeRecord = Record<string, unknown>;

export interface LineDiffSegment {
  readonly kind: 'added' | 'removed' | 'same';
  readonly text: string;
}

export interface LineDiffResult {
  readonly segments: readonly LineDiffSegment[];
  readonly addedLines: number;
  readonly removedLines: number;
  readonly beforeLineCount: number;
  readonly afterLineCount: number;
  readonly truncated: boolean;
}

export interface EntryFieldDiff {
  readonly key: string;
  readonly lines: LineDiffResult;
}

export interface EntryDiff {
  readonly label: string;
  readonly kind: 'added' | 'removed' | 'modified';
  readonly fields: readonly EntryFieldDiff[];
}

export interface EntrySummary {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
}

export interface FieldDiff {
  readonly key: string;
  readonly kind: 'added' | 'removed' | 'modified';
  readonly preservedByMerge: boolean;
  readonly entries?: readonly EntryDiff[];
  readonly entrySummary?: EntrySummary;
  readonly lines?: LineDiffResult;
}

export interface ConfirmDiff {
  readonly status: 'identical' | 'different';
  readonly fields: readonly FieldDiff[];
  readonly unchangedKeys: readonly string[];
  readonly assetSummary: { readonly count: number; readonly totalBytes: number };
}

const MATCH_KEY_CANDIDATES = ['id', 'key', 'name', 'comment'] as const;
const LABEL_KEY_CANDIDATES = ['name', 'comment', 'key'] as const;
const MODULE_PRESERVED_KEYS = ['id'] as const;

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

function isTooBig(text: string): boolean {
  return text.length > MAX_DIFF_CHARS || countLines(text) > MAX_DIFF_LINES;
}

function isPlainRecord(value: unknown): value is JsonLikeRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAssetPlaceholder(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(HMR_ASSET_PLACEHOLDER_PREFIX);
}

function maskIncomingOnly(value: unknown): unknown {
  if (isAssetPlaceholder(value)) {
    return ASSET_MASK;
  }

  if (Array.isArray(value)) {
    return value.map(maskIncomingOnly);
  }

  if (isPlainRecord(value)) {
    const output: JsonLikeRecord = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = maskIncomingOnly(item);
    }
    return output;
  }

  return value;
}

export function buildLineDiff(before: string, after: string): LineDiffResult {
  const beforeLineCount = countLines(before);
  const afterLineCount = countLines(after);

  if (isTooBig(before) || isTooBig(after)) {
    return { segments: [], addedLines: 0, removedLines: 0, beforeLineCount, afterLineCount, truncated: true };
  }

  let addedLines = 0;
  let removedLines = 0;
  const segments: LineDiffSegment[] = diffLines(before, after).map((change) => {
    const lines = change.count ?? countLines(change.value);
    if (change.added === true) {
      addedLines += lines;
      return { kind: 'added', text: change.value };
    }

    if (change.removed === true) {
      removedLines += lines;
      return { kind: 'removed', text: change.value };
    }

    return { kind: 'same', text: change.value };
  });

  return { segments, addedLines, removedLines, beforeLineCount, afterLineCount, truncated: false };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }

  if (isPlainRecord(a) && isPlainRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => key in b && deepEqual(a[key], b[key]));
  }

  return false;
}

export function maskAssetPair(incoming: unknown, existing: unknown): { readonly incoming: unknown; readonly existing: unknown } {
  if (isAssetPlaceholder(incoming)) {
    return { incoming: ASSET_MASK, existing: typeof existing === 'string' ? ASSET_MASK : existing };
  }

  if (Array.isArray(incoming) && Array.isArray(existing)) {
    const nextIncoming: unknown[] = [];
    const nextExisting: unknown[] = [];
    const length = Math.max(incoming.length, existing.length);
    for (let index = 0; index < length; index += 1) {
      const pair = maskAssetPair(incoming[index], existing[index]);
      if (index < incoming.length) {
        nextIncoming.push(pair.incoming);
      }
      if (index < existing.length) {
        nextExisting.push(pair.existing);
      }
    }
    return { incoming: nextIncoming, existing: nextExisting };
  }

  if (isPlainRecord(incoming) && isPlainRecord(existing)) {
    const nextIncoming: JsonLikeRecord = {};
    const nextExisting: JsonLikeRecord = {};
    for (const key of new Set([...Object.keys(incoming), ...Object.keys(existing)])) {
      const pair = maskAssetPair(incoming[key], existing[key]);
      if (key in incoming) {
        nextIncoming[key] = pair.incoming;
      }
      if (key in existing) {
        nextExisting[key] = pair.existing;
      }
    }
    return { incoming: nextIncoming, existing: nextExisting };
  }

  return { incoming: maskIncomingOnly(incoming), existing };
}

export function toDiffText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return '';
  }

  return JSON.stringify(value, null, 2) ?? '';
}

export function isRecordArrayPair(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }

  if (a.length === 0 && b.length === 0) {
    return false;
  }

  return a.every(isPlainRecord) && b.every(isPlainRecord);
}

function hasUniqueStringKey(records: readonly JsonLikeRecord[], key: string): boolean {
  const values = records.map((record) => record[key]);
  return values.every((value) => typeof value === 'string') && new Set(values).size === values.length;
}

function pickMatchKey(existing: readonly JsonLikeRecord[], incoming: readonly JsonLikeRecord[]): string | null {
  for (const key of MATCH_KEY_CANDIDATES) {
    if (hasUniqueStringKey(existing, key) && hasUniqueStringKey(incoming, key)) {
      return key;
    }
  }

  return null;
}

function entryLabel(record: JsonLikeRecord, index: number): string {
  for (const key of LABEL_KEY_CANDIDATES) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return `#${index + 1}`;
}

function diffMatchedEntry(existing: JsonLikeRecord, incoming: JsonLikeRecord, label: string): EntryDiff | null {
  const masked = maskAssetPair(incoming, existing);
  const maskedIncoming = masked.incoming as JsonLikeRecord;
  const maskedExisting = masked.existing as JsonLikeRecord;
  if (deepEqual(maskedIncoming, maskedExisting)) {
    return null;
  }

  const fields: EntryFieldDiff[] = [];
  for (const key of new Set([...Object.keys(maskedExisting), ...Object.keys(maskedIncoming)])) {
    if (deepEqual(maskedExisting[key], maskedIncoming[key])) {
      continue;
    }

    fields.push({ key, lines: buildLineDiff(toDiffText(maskedExisting[key]), toDiffText(maskedIncoming[key])) });
  }

  return { label, kind: 'modified', fields };
}

function countSummary(entries: readonly EntryDiff[]): EntrySummary {
  return {
    added: entries.filter((entry) => entry.kind === 'added').length,
    modified: entries.filter((entry) => entry.kind === 'modified').length,
    removed: entries.filter((entry) => entry.kind === 'removed').length,
  };
}

function diffRecordArrayByIndex(existing: readonly JsonLikeRecord[], incoming: readonly JsonLikeRecord[]): EntryDiff[] {
  const entries: EntryDiff[] = [];
  const length = Math.max(existing.length, incoming.length);

  for (let index = 0; index < length; index += 1) {
    const before = existing[index];
    const after = incoming[index];
    if (before === undefined && after !== undefined) {
      entries.push({ label: entryLabel(after, index), kind: 'added', fields: [] });
      continue;
    }

    if (after === undefined && before !== undefined) {
      entries.push({ label: entryLabel(before, index), kind: 'removed', fields: [] });
      continue;
    }

    if (before !== undefined && after !== undefined) {
      const modified = diffMatchedEntry(before, after, entryLabel(after, index));
      if (modified !== null) {
        entries.push(modified);
      }
    }
  }

  return entries;
}

function diffRecordArrayByKey(
  existing: readonly JsonLikeRecord[],
  incoming: readonly JsonLikeRecord[],
  matchKey: string,
): EntryDiff[] {
  const entries: EntryDiff[] = [];
  const existingByKey = new Map(existing.map((record) => [record[matchKey] as string, record]));
  const seen = new Set<string>();

  incoming.forEach((after, index) => {
    const keyValue = after[matchKey] as string;
    const before = existingByKey.get(keyValue);
    if (before === undefined) {
      entries.push({ label: entryLabel(after, index), kind: 'added', fields: [] });
      return;
    }

    seen.add(keyValue);
    const modified = diffMatchedEntry(before, after, entryLabel(after, index));
    if (modified !== null) {
      entries.push(modified);
    }
  });

  existing.forEach((before, index) => {
    if (!seen.has(before[matchKey] as string)) {
      entries.push({ label: entryLabel(before, index), kind: 'removed', fields: [] });
    }
  });

  return entries;
}

export function diffRecordArray(
  existing: readonly JsonLikeRecord[],
  incoming: readonly JsonLikeRecord[],
): { entries: EntryDiff[]; summary: EntrySummary } {
  const matchKey = pickMatchKey(existing, incoming);
  const entries = matchKey === null ? diffRecordArrayByIndex(existing, incoming) : diffRecordArrayByKey(existing, incoming, matchKey);

  return { entries, summary: countSummary(entries) };
}

export function buildDefinitionDiff(input: {
  readonly kind: 'character' | 'module';
  readonly incoming: Record<string, unknown>;
  readonly existing: Record<string, unknown>;
  readonly assets: readonly HmrAssetEntry[];
}): ConfirmDiff {
  const excluded: readonly string[] = input.kind === 'character' ? PRESERVED_CHARACTER_KEYS : MODULE_PRESERVED_KEYS;
  const incomingKeys = Object.keys(input.incoming).filter((key) => !excluded.includes(key));
  const existingOnlyKeys = Object.keys(input.existing).filter((key) => !excluded.includes(key) && !(key in input.incoming));

  const fields: FieldDiff[] = [];
  const unchangedKeys: string[] = [];

  for (const key of incomingKeys) {
    if (!(key in input.existing)) {
      fields.push({ key, kind: 'added', preservedByMerge: false });
      continue;
    }

    const masked = maskAssetPair(input.incoming[key], input.existing[key]);
    if (deepEqual(masked.incoming, masked.existing)) {
      unchangedKeys.push(key);
      continue;
    }

    if (isRecordArrayPair(masked.existing, masked.incoming)) {
      const { entries, summary } = diffRecordArray(masked.existing as JsonLikeRecord[], masked.incoming as JsonLikeRecord[]);
      fields.push({ key, kind: 'modified', preservedByMerge: false, entries, entrySummary: summary });
      continue;
    }

    fields.push({
      key,
      kind: 'modified',
      preservedByMerge: false,
      lines: buildLineDiff(toDiffText(masked.existing), toDiffText(masked.incoming)),
    });
  }

  for (const key of existingOnlyKeys) {
    fields.push({ key, kind: 'removed', preservedByMerge: input.kind === 'character' });
  }

  return {
    status: fields.length === 0 ? 'identical' : 'different',
    fields,
    unchangedKeys,
    assetSummary: {
      count: input.assets.length,
      totalBytes: input.assets.reduce((total, asset) => total + asset.size, 0),
    },
  };
}
