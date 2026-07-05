/**
 * vocab/할당에서 파생되는 출력 3종 생성기.
 * 프롬프트 Image Command List 블록, Negative Lookahead 화이트리스트 정규식, missing 리포트.
 * 에셋찐빠 가이드의 수작업(특수문자 escape, prefix 경계)을 코드가 책임짐.
 * @file packages/core/src/domain/asset/derived.ts
 */

import { DEFAULT_ASSET_OUTPUTS, type AssetCatalog, type AssetCatalogOutputsConfig } from './catalog';
import { parseJoinTemplate } from './naming';
import { expectedListFor, listMissingCombos } from './missing';

export type MissingReportFormat = 'markdown' | 'json';

export interface WhitelistRegexPatterns {
  readonly inPattern: string;
  readonly outPattern: string;
}

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function outputsOf(catalog: AssetCatalog): AssetCatalogOutputsConfig {
  return catalog.outputs ?? DEFAULT_ASSET_OUTPUTS;
}

function labelJoinTemplate(catalog: AssetCatalog): string {
  return catalog.schema.joinTemplate.replace(/\{(s[123])\}/g, (placeholder, slotId: string) => {
    const slot = catalog.schema.slots.find((entry) => entry.id === slotId);
    return slot === undefined ? placeholder : `{${slot.label}}`;
  });
}

export function generatePromptBlock(catalog: AssetCatalog): string {
  const { tagFormat } = outputsOf(catalog);
  const lines: string[] = [
    '## Image Command Instructions',
    '',
    `- Format: ${tagFormat.prefix}${labelJoinTemplate(catalog)}${tagFormat.suffix}`,
    '',
    '### Command Lists',
    '',
  ];

  for (const slot of catalog.schema.slots) {
    lines.push(`- ${slot.label}: ${(catalog.vocab[slot.id] ?? []).join('; ')}`);
  }

  const firstSlot = catalog.schema.slots[0];
  const secondSlot = catalog.schema.slots[1];
  if (firstSlot !== undefined && secondSlot !== undefined && secondSlot.id !== 's1') {
    const overrides = (catalog.vocab.s1 ?? []).filter((s1Value) => catalog.expected[s1Value] !== undefined);
    if (overrides.length > 0) {
      lines.push('', `### Per-${firstSlot.label} ${secondSlot.label}`, '');
      for (const s1Value of overrides) {
        lines.push(`- ${s1Value}: ${expectedListFor(catalog, s1Value, secondSlot.id).join('; ')}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function collectValidSuffixes(catalog: AssetCatalog): string[] {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  if (parsed === null || parsed.slotOrder.length < 2) return [];

  const suffixes = new Set<string>();
  for (const s1Value of catalog.vocab.s1 ?? []) {
    const s2List = expectedListFor(catalog, s1Value, 's2');
    for (const s2Value of s2List) {
      suffixes.add(s2Value);
      if (parsed.slotOrder.length >= 3) {
        const innerSeparator = parsed.separators[1] ?? '';
        for (const s3Value of expectedListFor(catalog, s1Value, 's3')) {
          suffixes.add(`${s2Value}${innerSeparator}${s3Value}`);
        }
      }
    }
  }

  return [...suffixes].sort((left, right) => right.length - left.length || left.localeCompare(right));
}

export function generateWhitelistRegex(catalog: AssetCatalog): WhitelistRegexPatterns | null {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  const s1Vocab = catalog.vocab.s1 ?? [];
  if (parsed === null || s1Vocab.length === 0) return null;

  const { tagFormat, outputTemplate } = outputsOf(catalog);
  const names = s1Vocab.map(escapeRegexLiteral).join('|');
  const prefixEscaped = escapeRegexLiteral(tagFormat.prefix);
  const closeEscaped = escapeRegexLiteral(tagFormat.suffix);

  let tail = '';
  let nameBackref = '$1';
  if (parsed.slotOrder.length >= 2) {
    const separator = escapeRegexLiteral(parsed.separators[0] ?? '');
    const suffixAlt = collectValidSuffixes(catalog).map(escapeRegexLiteral).join('|');
    // Tail carries its own leading separator so name-only yields an empty $2.
    tail = suffixAlt.length > 0 ? `((?:${separator}(?:${suffixAlt}))?)` : '()';
    nameBackref = '$1$2';
  }

  const inPattern = `${prefixEscaped}(${names})${tail}${closeEscaped}`;
  const outPattern = outputTemplate.replace(/\{name\}/g, () => nameBackref);
  return { inPattern, outPattern };
}

export function generateMissingReport(catalog: AssetCatalog, format: MissingReportFormat): string {
  const missing = listMissingCombos(catalog);
  if (format === 'json') return `${JSON.stringify({ total: missing.length, missing }, null, 2)}\n`;

  const lines: string[] = ['# Missing Assets Report', '', `총 ${missing.length}건`, ''];
  const byS1 = new Map<string, string[]>();
  for (const combo of missing) {
    const s1Value = combo.slots.s1 ?? '(unknown)';
    const names = byS1.get(s1Value) ?? [];
    names.push(combo.name ?? JSON.stringify(combo.slots));
    byS1.set(s1Value, names);
  }

  for (const [s1Value, names] of byS1) {
    lines.push(`## ${s1Value}`, '');
    for (const name of names) lines.push(`- ${name}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
