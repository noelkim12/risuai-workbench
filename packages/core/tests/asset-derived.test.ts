import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../src/domain/asset/catalog';
import {
  escapeRegexLiteral,
  generateMissingReport,
  generatePromptBlock,
  generateWhitelistRegex,
} from '../src/domain/asset/derived';

interface MissingReportJson {
  readonly missing: readonly { readonly name: string | null }[];
}

function isMissingReportJson(value: unknown): value is MissingReportJson {
  return (
    typeof value === 'object'
    && value !== null
    && 'missing' in value
    && Array.isArray(value.missing)
    && value.missing.every((combo) => (
      typeof combo === 'object'
      && combo !== null
      && 'name' in combo
      && (typeof combo.name === 'string' || combo.name === null)
    ))
  );
}

function catalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}',
    },
    vocab: { s1: ['Elsie', 'Char(Adult)'], s2: ['angry', 'nervous', 'nervous pouting'] },
    expected: { 'Char(Adult)': { s2: ['angry'] } },
    assignments: { 'additional/elsie_angry.webp': { s1: 'Elsie', s2: 'angry' } },
    outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
  };
}

describe('escapeRegexLiteral', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegexLiteral('Char(Adult)')).toBe('Char\\(Adult\\)');
    expect(escapeRegexLiteral('a.b*c')).toBe('a\\.b\\*c');
  });
});

describe('generatePromptBlock', () => {
  it('renders format line, slot lists and per-character expected overrides', () => {
    const block = generatePromptBlock(catalog());
    expect(block).toContain('<img src="{character}_{emotion}">');
    expect(block).toContain('- character: Elsie; Char(Adult)');
    expect(block).toContain('- emotion: angry; nervous; nervous pouting');
    expect(block).toContain('Char(Adult): angry');
  });
});

describe('generateWhitelistRegex', () => {
  it('builds negative-lookahead whitelist with escaping and close boundary', () => {
    const result = generateWhitelistRegex(catalog());
    expect(result).not.toBeNull();
    if (result === null) return;
    const { inPattern, outPattern } = result;
    expect(inPattern).toContain('Char\\(Adult\\)');
    expect(inPattern).toContain('(?=">)');
    expect(outPattern).toBe('<img src="$1_default">');

    const regex = new RegExp(inPattern);
    expect(regex.test('<img src="Elsie_invalidmood">')).toBe(true);
    expect(regex.test('<img src="Elsie_angry">')).toBe(false);
    expect(regex.test('<img src="Elsie_nervous">')).toBe(false);
    expect(regex.test('<img src="Elsie_nervous pouting">')).toBe(false);
    expect(regex.test('<img src="Elsie">')).toBe(true);
    expect(regex.test('<img src="Unknown_angry">')).toBe(false);
  });

  it('returns null when s1 vocab is empty', () => {
    const empty = catalog();
    empty.vocab.s1 = [];
    expect(generateWhitelistRegex(empty)).toBeNull();
  });
});

describe('generateMissingReport', () => {
  it('renders markdown grouped by s1', () => {
    const report = generateMissingReport(catalog(), 'markdown');
    expect(report).toContain('## Elsie');
    expect(report).toContain('Elsie_nervous');
    expect(report).not.toContain('Elsie_angry');
    expect(report).toContain('## Char(Adult)');
    expect(report).toContain('Char(Adult)_angry');
  });

  it('renders json with combos', () => {
    const parsed: unknown = JSON.parse(generateMissingReport(catalog(), 'json'));
    expect(isMissingReportJson(parsed)).toBe(true);
    if (!isMissingReportJson(parsed)) return;
    expect(parsed.missing.some((combo) => combo.name === 'Elsie_nervous')).toBe(true);
  });
});
