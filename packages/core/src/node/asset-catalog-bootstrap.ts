/**
 * Legacy manifest.json → asset-catalog.json bootstrap helpers.
 * @file packages/core/src/node/asset-catalog-bootstrap.ts
 */

import path from 'node:path';
import {
  createDefaultAssetCatalog,
  type AssetCatalog,
  type AssetSlotId,
  type AssetSlotValues,
} from '../domain/asset/catalog';
import { parseJoinTemplate } from '../domain/asset/naming';
import { loadAssetCatalogFromAssetsDir } from './asset-manifest';
import { readJsonIfExists } from './fs-helpers';

interface LegacyManifestAssetEntry {
  readonly extracted_path?: unknown;
  readonly name?: unknown;
  readonly status?: unknown;
}

interface LegacyAssetManifest {
  readonly assets: readonly unknown[];
}

export type AssetCatalogBootstrapMode = 'full' | 'missing';

export interface AssetCatalogBootstrapEntry {
  readonly path: string;
  readonly name: string;
}

export interface AssetCatalogBootstrapGroupOverride {
  readonly firstToken: string;
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}

export interface AssetCatalogBootstrapSplitOptions {
  readonly separator?: string;
  readonly slotTokenCounts?: Partial<Record<AssetSlotId, number>>;
  readonly groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[];
}

export interface AssetCatalogBootstrapOptions {
  readonly mode: AssetCatalogBootstrapMode;
  readonly split?: AssetCatalogBootstrapSplitOptions;
}

export interface AssetCatalogBootstrapPreviewEntry extends AssetCatalogBootstrapEntry {
  readonly slots: AssetSlotValues | null;
}

export function bootstrapAssetCatalogFromManifest(options: {
  readonly rootDir: string;
  readonly split?: AssetCatalogBootstrapSplitOptions;
}): AssetCatalog {
  const assetsDir = path.join(options.rootDir, 'assets');
  const currentCatalog = loadAssetCatalogFromAssetsDir(assetsDir) ?? createDefaultAssetCatalog();
  const namedEntries = collectAssetCatalogBootstrapEntriesFromManifest(options.rootDir);
  if (namedEntries.length === 0) return currentCatalog;

  return bootstrapAssetCatalogFromEntries(currentCatalog, namedEntries, { mode: 'full', split: options.split });
}

export function collectAssetCatalogBootstrapEntriesFromManifest(rootDir: string): readonly AssetCatalogBootstrapEntry[] {
  const manifest = readLegacyAssetManifest(path.join(rootDir, 'assets', 'manifest.json'));
  if (manifest === null) return [];
  return manifest.assets
    .filter(isLegacyManifestAssetEntry)
    .filter((entry) => entry.status === undefined || entry.status === 'extracted')
    .map((entry) => ({ path: entry.extracted_path, name: entry.name }))
    .filter((entry): entry is { readonly path: string; readonly name: string } =>
      typeof entry.path === 'string' && typeof entry.name === 'string' && entry.path.length > 0 && entry.name.length > 0,
    );
}

export function bootstrapAssetCatalogFromEntries(
  catalog: AssetCatalog,
  entries: readonly AssetCatalogBootstrapEntry[],
  options: AssetCatalogBootstrapMode | AssetCatalogBootstrapOptions,
): AssetCatalog {
  const resolved = resolveBootstrapOptions(options);
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  const sourceEntries = resolved.mode === 'missing' ? entries.filter((entry) => catalog.assignments[entry.path] === undefined) : entries;
  const assignments: Record<string, AssetSlotValues> = resolved.mode === 'missing' ? { ...catalog.assignments } : {};
  const vocabSets = new Map<AssetSlotId, Set<string>>();
  for (const slotId of slotIds) vocabSets.set(slotId, new Set(resolved.mode === 'missing' ? (catalog.vocab[slotId] ?? []) : []));

  const preview = previewAssetCatalogBootstrapEntries(catalog, sourceEntries, resolved.split, entries.map((entry) => entry.name));
  for (const entry of preview) {
    const slots = entry.slots;
    if (slots === null) continue;
    assignments[entry.path] = slots;
    for (const [slotId, value] of Object.entries(slots)) {
      if (!isAssetSlotId(slotId) || value === undefined) continue;
      vocabSets.get(slotId)?.add(value);
    }
  }

  const vocab: AssetCatalog['vocab'] = {};
  for (const slotId of slotIds) {
    vocab[slotId] = [...(vocabSets.get(slotId) ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
  }

  return { ...catalog, vocab, assignments };
}

export function previewAssetCatalogBootstrapEntries(
  catalog: AssetCatalog,
  entries: readonly AssetCatalogBootstrapEntry[],
  split?: AssetCatalogBootstrapSplitOptions,
  allNames: readonly string[] = entries.map((entry) => entry.name),
): readonly AssetCatalogBootstrapPreviewEntry[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  return entries.map((entry) => ({
    ...entry,
    slots: inferSlotsFromName(entry.name, slotIds, catalog.schema.joinTemplate, allNames, split),
  }));
}

function resolveBootstrapOptions(options: AssetCatalogBootstrapMode | AssetCatalogBootstrapOptions): AssetCatalogBootstrapOptions {
  return typeof options === 'string' ? { mode: options } : options;
}

function readLegacyAssetManifest(manifestPath: string): LegacyAssetManifest | null {
  const raw = readJsonIfExists(manifestPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const assets = 'assets' in raw ? raw.assets : undefined;
  return Array.isArray(assets) ? { assets } : null;
}

function isLegacyManifestAssetEntry(value: unknown): value is LegacyManifestAssetEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssetSlotId(value: string): value is AssetSlotId {
  return value === 's1' || value === 's2' || value === 's3';
}

function stripKnownExtensionResidue(name: string): string {
  return name.replace(/\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm)+$/i, '');
}

function splitAssetName(name: string, separator: string): string[] {
  const cleaned = stripKnownExtensionResidue(name);
  if (separator === '_' && cleaned.includes('_')) return cleaned.split('_').filter(Boolean);
  if (separator.trim() === '') return cleaned.split(/[\s_]+/).filter(Boolean);
  if (cleaned.includes(separator)) return cleaned.split(separator).map((part) => part.trim()).filter(Boolean);
  // 선택한 구분자가 이름에 없을 때의 폴백. 공백만 나누고 '_'는 건드리지 않는다.
  // (예: 구분자 '.'인데 'EP_005-1'은 '.'이 없다 — 여기서 '_'로 쪼개면 EP/005-1로 오분할된다.)
  return cleaned.split(/\s+/).filter(Boolean);
}

function actualSeparator(preferredSeparator: string, names: readonly string[]): string {
  if (preferredSeparator.trim() === '') return preferredSeparator;
  return names.some((name) => stripKnownExtensionResidue(name).includes(preferredSeparator)) ? preferredSeparator : ' ';
}

function slotValueSeparator(joinSeparator: string): string {
  return joinSeparator.trim() === '' ? ' ' : joinSeparator;
}

function primaryJoinSeparator(joinTemplate: string): string {
  const parsed = parseJoinTemplate(joinTemplate);
  return parsed?.separators[0] ?? '_';
}

function inferSlotsFromName(
  name: string,
  slotIds: readonly AssetSlotId[],
  joinTemplate: string,
  allNames: readonly string[],
  split?: AssetCatalogBootstrapSplitOptions,
): AssetSlotValues | null {
  const separator = actualSeparator(split?.separator ?? primaryJoinSeparator(joinTemplate), [name, ...allNames]);
  const valueSeparator = slotValueSeparator(separator);
  const words = splitAssetName(name, separator);
  const configured = configuredSplit(words, slotIds, effectiveSlotTokenCounts(words[0], split));
  if (configured !== null) return slotsFromParts(slotIds, configured, valueSeparator);
  if (words.length === 1) return { [slotIds[0]]: words[0] };
  if (words.length < slotIds.length) return null;

  const allWords = allNames.map((entry) => splitAssetName(entry, separator));
  const candidates = candidateSplits(words, slotIds.length);
  const positional = positionalSplit(words, slotIds.length);
  if (separator !== ' ' && positional !== null) return slotsFromParts(slotIds, positional, valueSeparator);

  let best: readonly string[] | null = null;
  let bestScore = -1;
  let bestTieBreaker = -1;
  for (const candidate of candidates) {
    const score = candidate.reduce((sum, value, index) => sum + countPartAtIndex(allWords, value, index, slotIds.length), 0);
    const firstSlotWords = splitAssetName(candidate[0] ?? '', separator).length;
    const tieBreaker = separator === ' ' ? firstSlotWords : -firstSlotWords;
    if (score > bestScore || (score === bestScore && tieBreaker > bestTieBreaker)) {
      best = candidate;
      bestScore = score;
      bestTieBreaker = tieBreaker;
    }
  }
  if (best === null) return null;

  return slotsFromParts(slotIds, best, valueSeparator);
}

function configuredSplit(
  words: readonly string[],
  slotIds: readonly AssetSlotId[],
  counts: Partial<Record<AssetSlotId, number>> | undefined,
): readonly string[] | null {
  if (counts === undefined || Object.keys(counts).length === 0) return null;
  const parts: string[] = [];
  let offset = 0;
  for (let index = 0; index < slotIds.length; index += 1) {
    const slotId = slotIds[index];
    const isLast = index === slotIds.length - 1;
    const size = isLast ? words.length - offset : counts[slotId] ?? 1;
    if (isLast) {
      // 마지막 슬롯은 남은 조각 전부(remainder)라 앞 슬롯 조각 수를 정확히 채우면 비어도 유효하다.
      // 단, 마지막 슬롯에 조각 수가 명시된 경우엔 의미 있는 슬롯으로 보아 최소 1조각을 요구한다.
      if (size === 0 && counts[slotId] !== undefined) return null;
    } else if (size <= 0 || offset + size > words.length) {
      return null;
    }
    // 비어 있는 마지막 슬롯은 값을 생략(undefined)해 vocab에 빈 문자열이 섞이지 않게 한다.
    if (!(isLast && size === 0)) parts.push(words.slice(offset, offset + size).join(' '));
    offset += size;
  }
  return offset === words.length ? parts : null;
}

function effectiveSlotTokenCounts(
  firstToken: string | undefined,
  split?: AssetCatalogBootstrapSplitOptions,
): Partial<Record<AssetSlotId, number>> | undefined {
  const override =
    firstToken === undefined ? undefined : split?.groupOverrides?.find((entry) => entry.firstToken === firstToken);
  return override?.slotTokenCounts ?? split?.slotTokenCounts;
}

function slotsFromParts(
  slotIds: readonly AssetSlotId[],
  parts: readonly string[],
  valueSeparator: string,
): AssetSlotValues {
  const slots: AssetSlotValues = {};
  for (let index = 0; index < slotIds.length; index += 1) slots[slotIds[index]] = parts[index]?.split(' ').join(valueSeparator);
  return slots;
}

function positionalSplit(words: readonly string[], slots: number): readonly string[] | null {
  if (words.length < slots) return null;
  if (slots === 1) return [words.join(' ')];
  const head = words.slice(0, slots - 1);
  return [...head, words.slice(slots - 1).join(' ')];
}

function candidateSplits(words: readonly string[], slots: number): readonly (readonly string[])[] {
  if (slots === 1) return [[words.join(' ')]];
  if (slots === 2) {
    return Array.from({ length: words.length - 1 }, (_unused, leftSize) => [
      words.slice(0, leftSize + 1).join(' '),
      words.slice(leftSize + 1).join(' '),
    ]);
  }
  const out: string[][] = [];
  for (let first = 1; first < words.length - 1; first += 1) {
    for (let second = first + 1; second < words.length; second += 1) {
      out.push([words.slice(0, first).join(' '), words.slice(first, second).join(' '), words.slice(second).join(' ')]);
    }
  }
  return out;
}

function countPartAtIndex(
  allWords: readonly (readonly string[])[],
  part: string,
  index: number,
  slots: number,
): number {
  return allWords.filter((words) => candidateSplits(words, slots).some((candidate) => candidate[index] === part)).length;
}

export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';

export interface AssetCatalogBootstrapGroupSummary {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[];
  // insufficient-tokens 경고를 유발한 실제 항목명(가장 조각이 적은 항목). 모달이 오해 없이 원인을 짚어주기 위함.
  readonly insufficientExample?: string;
  // 이 그룹의 슬롯 값 표본(chip에 보이는 값들, 상한 있음). 모달에서 firstToken 외 슬롯 내용으로도 검색 가능하게 한다.
  readonly sampleValues?: readonly string[];
}

const GROUP_SAMPLE_VALUE_CAP = 24;

interface MutableGroupStats {
  readonly tokenCounts: number[];
  readonly firstSlotValues: Set<string>;
  readonly lastSlotTokens: Set<string>;
  readonly sampleValues: Set<string>;
  insufficient: boolean;
  insufficientExample?: string;
  insufficientExampleTokens: number;
}

function minimumConfiguredTokens(slotIds: readonly AssetSlotId[], counts: Partial<Record<AssetSlotId, number>>): number {
  // configuredSplit과 동일한 규칙: 앞 슬롯은 지정 조각 수(미지정 시 1)를 요구하고,
  // 마지막 슬롯은 조각 수가 명시됐을 때만 1조각을 요구한다(미지정=remainder라 비어도 됨).
  let total = 0;
  for (let index = 0; index < slotIds.length; index += 1) {
    const count = counts[slotIds[index]];
    const isLast = index === slotIds.length - 1;
    if (isLast) total += count === undefined ? 0 : 1;
    else total += count ?? 1;
  }
  return total;
}

export function summarizeAssetCatalogBootstrapGroups(
  catalog: AssetCatalog,
  preview: readonly AssetCatalogBootstrapPreviewEntry[],
  split?: AssetCatalogBootstrapSplitOptions,
): readonly AssetCatalogBootstrapGroupSummary[] {
  const slotIds = catalog.schema.slots.map((slot) => slot.id);
  const firstSlotId = slotIds[0];
  const lastSlotId = slotIds[slotIds.length - 1];
  const separator = actualSeparator(
    split?.separator ?? primaryJoinSeparator(catalog.schema.joinTemplate),
    preview.map((entry) => entry.name),
  );

  const stats = new Map<string, MutableGroupStats>();
  for (const entry of preview) {
    const words = splitAssetName(entry.name, separator);
    const firstToken = words[0];
    if (firstToken === undefined) continue;
    const group = stats.get(firstToken) ?? {
      tokenCounts: [],
      firstSlotValues: new Set<string>(),
      lastSlotTokens: new Set<string>(),
      sampleValues: new Set<string>(),
      insufficient: false,
      insufficientExampleTokens: Number.POSITIVE_INFINITY,
    };
    group.tokenCounts.push(words.length);
    // 검색용 슬롯 값 표본 수집(chip에 보이는 값). 상한까지만 담아 payload 팽창 방지.
    if (entry.slots !== null) {
      for (const value of Object.values(entry.slots)) {
        if (typeof value === 'string' && value.length > 0 && group.sampleValues.size < GROUP_SAMPLE_VALUE_CAP) {
          group.sampleValues.add(value);
        }
      }
    }
    const counts = effectiveSlotTokenCounts(firstToken, split);
    if (counts !== undefined && Object.keys(counts).length > 0 && words.length < minimumConfiguredTokens(slotIds, counts)) {
      group.insufficient = true;
      // 가장 조각이 적은(가장 극적인) 위반 항목을 예시로 남긴다.
      if (words.length < group.insufficientExampleTokens) {
        group.insufficientExample = entry.name;
        group.insufficientExampleTokens = words.length;
      }
    }
    const firstSlotValue = entry.slots?.[firstSlotId];
    if (firstSlotValue !== undefined) group.firstSlotValues.add(firstSlotValue);
    const lastSlotValue = entry.slots?.[lastSlotId];
    if (lastSlotValue !== undefined) {
      for (const token of splitAssetName(lastSlotValue, separator)) group.lastSlotTokens.add(token);
    }
    stats.set(firstToken, group);
  }

  const summaries = [...stats.entries()].map(([firstToken, group]) => {
    const anomalies: AssetCatalogBootstrapAnomalyReason[] = [];
    if (group.insufficient) anomalies.push('insufficient-tokens');
    if (group.firstSlotValues.size >= 2 && hasForeignLastTokenOverlap(firstToken, group, stats, separator)) {
      anomalies.push('vocab-overlap');
    }
    return {
      firstToken,
      entryCount: group.tokenCounts.length,
      tokenCountMin: Math.min(...group.tokenCounts),
      tokenCountMax: Math.max(...group.tokenCounts),
      anomalies,
      ...(group.insufficientExample !== undefined && { insufficientExample: group.insufficientExample }),
      ...(group.sampleValues.size > 0 && { sampleValues: [...group.sampleValues] }),
    };
  });

  return summaries.sort((left, right) => {
    if ((left.anomalies.length > 0) !== (right.anomalies.length > 0)) return left.anomalies.length > 0 ? -1 : 1;
    if (left.entryCount !== right.entryCount) return right.entryCount - left.entryCount;
    return left.firstToken.localeCompare(right.firstToken);
  });
}

function hasForeignLastTokenOverlap(
  firstToken: string,
  group: MutableGroupStats,
  stats: ReadonlyMap<string, MutableGroupStats>,
  separator: string,
): boolean {
  const foreignTokens = new Set<string>();
  for (const [otherToken, other] of stats) {
    if (otherToken === firstToken) continue;
    for (const token of other.lastSlotTokens) foreignTokens.add(token);
  }
  if (foreignTokens.size === 0) return false;
  for (const value of group.firstSlotValues) {
    const tokens = splitAssetName(value, separator);
    const lastToken = tokens[tokens.length - 1];
    if (tokens.length >= 2 && lastToken !== undefined && foreignTokens.has(lastToken)) return true;
  }
  return false;
}
