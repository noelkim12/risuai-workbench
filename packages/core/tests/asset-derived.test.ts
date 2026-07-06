import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../src/domain/asset/catalog';
import { DEFAULT_ASSET_OUTPUTS, parseAssetCatalog } from '../src/domain/asset/catalog';
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
    outputs: {
      tagFormat: { prefix: '<img src="', suffix: '">' },
      fallbackTemplate: '{s1}_default',
      outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">',
    },
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
  it('builds a positive whitelist matching valid combos and name-only', () => {
    const result = generateWhitelistRegex(catalog());
    expect(result).not.toBeNull();
    if (result === null) return;
    const { inPattern, outPattern } = result;

    expect(inPattern).toContain('Char\\(Adult\\)');
    expect(outPattern).toBe('<img src="{{raw::$1$2}}" alt="$1$2">');

    const regex = new RegExp(inPattern);
    // joinTemplate is '{s1}_{s2}', separator '_'
    expect(regex.test('<img src="Elsie_angry">')).toBe(true); // valid full combo
    expect(regex.test('<img src="Elsie">')).toBe(true); // name-only
    expect(regex.test('<img src="Elsie_nervous pouting">')).toBe(true); // multi-word s2
    expect(regex.test('<img src="Elsie_invalidmood">')).toBe(false); // invalid emotion
    expect(regex.test('<img src="Unknown_angry">')).toBe(false); // unknown name
    // Per-name suffix restriction is NOT enforced: spec §4.1 unions valid
    // suffixes across all s1 values into one shared tail group. 'nervous' is
    // valid for Elsie, so it is accepted after any name.
    expect(regex.test('<img src="Char(Adult)_angry">')).toBe(true);
    expect(regex.test('<img src="Char(Adult)_nervous">')).toBe(true);
    // The shared whitelist still rejects a globally-invalid emotion after any name.
    expect(regex.test('<img src="Char(Adult)_invalidmood">')).toBe(false);
  });

  it('reconstructs the asset name via $1$2 backreferences', () => {
    const result = generateWhitelistRegex(catalog());
    if (result === null) throw new Error('expected non-null');
    const full = '<img src="Elsie_angry">'.replace(new RegExp(result.inPattern), result.outPattern);
    expect(full).toBe('<img src="{{raw::Elsie_angry}}" alt="Elsie_angry">');
    const nameOnly = '<img src="Elsie">'.replace(new RegExp(result.inPattern), result.outPattern);
    expect(nameOnly).toBe('<img src="{{raw::Elsie}}" alt="Elsie">');
  });

  it('honors a custom outputTemplate', () => {
    const custom = catalog();
    const result = generateWhitelistRegex({
      ...custom,
      outputs: { ...(custom.outputs ?? DEFAULT_ASSET_OUTPUTS), outputTemplate: '{{img::{name}}}' },
    });
    expect(result?.outPattern).toBe('{{img::$1$2}}');
  });

  it('matches all valid prefixes in a 3-slot schema', () => {
    const three = {
      ...catalog(),
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
          { id: 's3' as const, label: 'variant' },
        ],
        joinTemplate: '{s1}_{s2}_{s3}',
      },
      vocab: { s1: ['Elsie'], s2: ['angry'], s3: ['a', 'b'] },
      expected: {},
    };
    const result = generateWhitelistRegex(three);
    if (result === null) throw new Error('expected non-null');
    const regex = new RegExp(result.inPattern);
    expect(regex.test('<img src="Elsie">')).toBe(true); // s1 only
    expect(regex.test('<img src="Elsie_angry">')).toBe(true); // s1+s2 partial
    expect(regex.test('<img src="Elsie_angry_a">')).toBe(true); // full
    expect(regex.test('<img src="Elsie_angry_z">')).toBe(false); // invalid s3
  });

  it('returns null when s1 vocab is empty', () => {
    const empty = catalog();
    empty.vocab.s1 = [];
    expect(generateWhitelistRegex(empty)).toBeNull();
  });

  it('emits an empty tail group when there are no valid suffixes (>=2 slots)', () => {
    const noSuffix = {
      ...catalog(),
      vocab: { s1: ['Elsie'], s2: [] },
      expected: {},
      assignments: {},
    };
    const result = generateWhitelistRegex(noSuffix);
    if (result === null) throw new Error('expected non-null');
    // No suffixes -> tail collapses to an empty capture group '()', keeping $2 valid.
    expect(result.inPattern).toBe('<img src="(Elsie)()">');
    const regex = new RegExp(result.inPattern);
    expect(regex.test('<img src="Elsie">')).toBe(true); // name-only still matches
    expect(regex.test('<img src="Elsie_angry">')).toBe(false); // nothing after the name is allowed
    // $1$2 reconstruction still yields just the name (empty $2).
    expect('<img src="Elsie">'.replace(regex, result.outPattern)).toBe('<img src="{{raw::Elsie}}" alt="Elsie">');
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

describe('outputs.outputTemplate', () => {
  it('exposes the default outputTemplate', () => {
    expect(DEFAULT_ASSET_OUTPUTS.outputTemplate).toBe('<img src="{{raw::{name}}}" alt="{name}">');
  });

  it('defaults outputTemplate when a catalog omits it', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: { slots: [{ id: 's1', label: 'character' }], joinTemplate: '{s1}' },
      vocab: { s1: ['Elsie'] },
      expected: {},
      assignments: {},
      outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.outputs?.outputTemplate).toBe('<img src="{{raw::{name}}}" alt="{name}">');
  });

  it('preserves a custom outputTemplate', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: { slots: [{ id: 's1', label: 'character' }], joinTemplate: '{s1}' },
      vocab: { s1: ['Elsie'] },
      expected: {},
      assignments: {},
      outputs: {
        tagFormat: { prefix: '<img src="', suffix: '">' },
        fallbackTemplate: '{s1}_default',
        outputTemplate: '{{img::{name}}}',
      },
    });
    expect(parsed?.outputs?.outputTemplate).toBe('{{img::{name}}}');
  });
});
