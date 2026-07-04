/**
 * Asset name 조립/분해 로직.
 * joinTemplate 렌더, vocab 최장일치 tokenizer, vocab 부재 시 파일명 클러스터링을 담당함.
 * @file packages/core/src/domain/asset/naming.ts
 */

import type { AssetCatalog, AssetCatalogSchema, AssetSlotId, AssetSlotValues } from './catalog';

export interface ParsedJoinTemplate {
  readonly slotOrder: AssetSlotId[];
  readonly separators: string[];
  readonly prefix: string;
  readonly suffix: string;
}

export interface TokenizeResult {
  readonly slots: AssetSlotValues;
  readonly matched: boolean;
  readonly residue: string;
}

export interface BootstrapCluster {
  readonly value: string;
  readonly count: number;
}

const SLOT_PLACEHOLDER = /\{(s[123])\}/g;
const EXTENSION_RESIDUE = /(\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|mp4|webm))+$/i;
const JOIN_TOKEN_SEPARATOR = /[\s_]+/;

function toAssetSlotId(value: string): AssetSlotId | null {
  if (value === 's1') return 's1';
  if (value === 's2') return 's2';
  if (value === 's3') return 's3';
  return null;
}

export function parseJoinTemplate(template: string): ParsedJoinTemplate | null {
  const slotOrder: AssetSlotId[] = [];
  const literals: string[] = [];
  let lastIndex = 0;

  for (const match of template.matchAll(SLOT_PLACEHOLDER)) {
    const slotId = toAssetSlotId(match[1] ?? '');
    if (slotId === null) return null;

    literals.push(template.slice(lastIndex, match.index));
    slotOrder.push(slotId);
    lastIndex = match.index + match[0].length;
  }

  if (slotOrder.length === 0) return null;

  return {
    slotOrder,
    separators: literals.slice(1),
    prefix: literals[0] ?? '',
    suffix: template.slice(lastIndex),
  };
}

export function renderAssetName(schema: AssetCatalogSchema, slots: AssetSlotValues): string | null {
  for (const slot of schema.slots) {
    const value = slots[slot.id];
    if (value === undefined || value.trim() === '') return null;
  }

  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (placeholder, slotValue) => {
    const slotId = toAssetSlotId(slotValue);
    if (slotId === null) return placeholder;
    return slots[slotId] ?? '';
  });
}

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

export function stripExtensionResidue(stem: string): string {
  return stem.replace(EXTENSION_RESIDUE, '');
}

function splitStem(stem: string): string[] {
  return stripExtensionResidue(stem).split(JOIN_TOKEN_SEPARATOR).filter(Boolean);
}

function countTokenWords(value: string): number {
  return normalizeToken(value).split(' ').filter(Boolean).length;
}

function sortedVocabEntries(entries: readonly string[]): string[] {
  return [...entries].sort((left, right) => countTokenWords(right) - countTokenWords(left));
}

export function tokenizeAssetFilename(
  stem: string,
  schema: AssetCatalogSchema,
  vocab: AssetCatalog['vocab'],
): TokenizeResult {
  const words = splitStem(stem);
  const slots: AssetSlotValues = {};
  let cursor = 0;

  for (const slot of schema.slots) {
    for (const entry of sortedVocabEntries(vocab[slot.id] ?? [])) {
      const span = countTokenWords(entry);
      const window = words.slice(cursor, cursor + span).join(' ');
      if (span > 0 && normalizeToken(window) === normalizeToken(entry)) {
        slots[slot.id] = entry;
        cursor += span;
        break;
      }
    }
  }

  return {
    slots,
    matched: schema.slots.every((slot) => slots[slot.id] !== undefined) && cursor === words.length,
    residue: words.slice(cursor).join(' '),
  };
}

function incrementCount(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function toBootstrapClusters(counts: Map<string, number>): BootstrapCluster[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

export function bootstrapVocabCandidates(stems: readonly string[]): {
  readonly prefixes: BootstrapCluster[];
  readonly suffixes: BootstrapCluster[];
} {
  const prefixCounts = new Map<string, number>();
  const suffixCounts = new Map<string, number>();

  for (const stem of stems) {
    const words = splitStem(stem);
    const first = words[0];
    const last = words[words.length - 1];
    if (words.length >= 2 && first !== undefined && last !== undefined) {
      incrementCount(prefixCounts, first);
      incrementCount(suffixCounts, last);
    }
  }

  return { prefixes: toBootstrapClusters(prefixCounts), suffixes: toBootstrapClusters(suffixCounts) };
}
