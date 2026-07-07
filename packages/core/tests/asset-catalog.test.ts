import { describe, expect, it } from 'vitest';
import {
  ASSET_CATALOG_FILENAME,
  createDefaultAssetCatalog,
  parseAssetCatalog,
  serializeAssetCatalog,
} from '../src/domain/asset/catalog';

describe('asset catalog', () => {
  it('creates a 2-slot default catalog (character/emotion)', () => {
    const catalog = createDefaultAssetCatalog();
    expect(catalog.version).toBe(1);
    expect(catalog.schema.slots).toEqual([
      { id: 's1', label: 'character' },
      { id: 's2', label: 'emotion' },
    ]);
    expect(catalog.schema.joinTemplate).toBe('{s1}_{s2}');
    expect(catalog.vocab).toEqual({ s1: [], s2: [] });
    expect(catalog.expected).toEqual({});
    expect(catalog.assignments).toEqual({});
  });

  it('round-trips through serialize/parse', () => {
    const catalog = createDefaultAssetCatalog();
    catalog.vocab.s1 = ['Elsie'];
    catalog.assignments['additional/elsie_angry.webp'] = { s1: 'Elsie', s2: 'angry' };
    const parsed = parseAssetCatalog(JSON.parse(serializeAssetCatalog(catalog)));
    expect(parsed).toEqual(catalog);
  });

  it('round-trips bootstrap config through serialize/parse', () => {
    const catalog = {
      ...createDefaultAssetCatalog(),
      bootstrap: {
        separator: '_',
        slotTokenCounts: { s1: 2 },
        groupOverrides: [{ firstToken: 'mel', slotTokenCounts: { s1: 1 } }],
      },
    };
    const parsed = parseAssetCatalog(JSON.parse(serializeAssetCatalog(catalog)));
    expect(parsed).toEqual(catalog);
  });

  it('accepts bootstrap config without groupOverrides', () => {
    const parsed = parseAssetCatalog({
      ...JSON.parse(serializeAssetCatalog(createDefaultAssetCatalog())),
      bootstrap: { separator: '-', slotTokenCounts: {} },
    });
    expect(parsed?.bootstrap).toEqual({ separator: '-', slotTokenCounts: {} });
  });

  it('keeps parsing catalogs without bootstrap section (backward compat)', () => {
    const parsed = parseAssetCatalog(JSON.parse(serializeAssetCatalog(createDefaultAssetCatalog())));
    expect(parsed).not.toBeNull();
    expect(parsed?.bootstrap).toBeUndefined();
  });

  it('accepts a valid 3-slot catalog with expected/outputs', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: {
        slots: [
          { id: 's1', label: 'character' },
          { id: 's2', label: 'attire' },
          { id: 's3', label: 'emotion' },
        ],
        joinTemplate: '{s1}_{s2}_{s3}',
      },
      vocab: { s1: ['Elsie'], s2: ['Dress'], s3: ['angry'] },
      expected: { Elsie: { s2: ['Dress'], s3: null } },
      assignments: { 'additional/a.webp': { s1: 'Elsie', s2: 'Dress', s3: 'angry' } },
      outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.schema.slots).toHaveLength(3);
    expect(parsed?.outputs?.fallbackTemplate).toBe('{s1}_default');
  });

  it('rejects malformed catalogs', () => {
    expect(parseAssetCatalog(null)).toBeNull();
    expect(parseAssetCatalog({ version: 2 })).toBeNull();
    expect(parseAssetCatalog({ version: 1, schema: { slots: [], joinTemplate: 'x' } })).toBeNull();
    expect(
      parseAssetCatalog({
        version: 1,
        schema: { slots: [{ id: 's9', label: 'bad' }], joinTemplate: '{s9}' },
        vocab: {},
        expected: {},
        assignments: {},
      }),
    ).toBeNull();
    expect(
      parseAssetCatalog({
        version: 1,
        schema: {
          slots: [
            { id: 's1', label: 'a' },
            { id: 's2', label: 'b' },
            { id: 's3', label: 'c' },
            { id: 's1', label: 'd' },
          ],
          joinTemplate: '{s1}',
        },
        vocab: {},
        expected: {},
        assignments: {},
      }),
    ).toBeNull();
  });

  it('rejects malformed bootstrap sections', () => {
    const base = JSON.parse(serializeAssetCatalog(createDefaultAssetCatalog()));
    expect(parseAssetCatalog({ ...base, bootstrap: 'nope' })).toBeNull();
    expect(parseAssetCatalog({ ...base, bootstrap: { separator: 1, slotTokenCounts: {} } })).toBeNull();
    expect(parseAssetCatalog({ ...base, bootstrap: { separator: '_', slotTokenCounts: { s1: 0 } } })).toBeNull();
    expect(parseAssetCatalog({ ...base, bootstrap: { separator: '_', slotTokenCounts: { s9: 1 } } })).toBeNull();
    expect(
      parseAssetCatalog({
        ...base,
        bootstrap: { separator: '_', slotTokenCounts: {}, groupOverrides: [{ firstToken: '', slotTokenCounts: {} }] },
      }),
    ).toBeNull();
  });

  it('exposes the canonical filename constant', () => {
    expect(ASSET_CATALOG_FILENAME).toBe('asset-catalog.json');
  });
});
