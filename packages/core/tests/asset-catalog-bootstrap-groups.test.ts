import { describe, expect, it } from 'vitest';
import { createDefaultAssetCatalog } from '../src/domain/asset/catalog';
import {
  bootstrapAssetCatalogFromEntries,
  previewAssetCatalogBootstrapEntries,
  summarizeAssetCatalogBootstrapGroups,
  type AssetCatalogBootstrapSplitOptions,
} from '../src/node/asset-catalog-bootstrap';

const ENTRIES = [
  { path: 'additional/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
  { path: 'additional/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
  { path: 'additional/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
  { path: 'additional/Rivea_angry.png', name: 'Rivea_angry' },
] as const;

function summarize(entries: readonly { path: string; name: string }[], split: AssetCatalogBootstrapSplitOptions) {
  const catalog = createDefaultAssetCatalog();
  return summarizeAssetCatalogBootstrapGroups(catalog, previewAssetCatalogBootstrapEntries(catalog, entries, split), split);
}

describe('bootstrap split with groupOverrides', () => {
  it('applies group token counts for matching first tokens only', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), ENTRIES, split);
    expect(preview.map((entry) => entry.slots)).toEqual([
      { s1: 'Park_Hye-in', s2: 'acting_coy' },
      { s1: 'Park_Hye-in', s2: 'angry' },
      { s1: 'Rivea', s2: 'acting_coy' },
      { s1: 'Rivea', s2: 'angry' },
    ]);
  });

  it('falls back to global counts when no override matches', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Nobody', slotTokenCounts: { s1: 1 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), [ENTRIES[0]], split);
    expect(preview[0]?.slots).toEqual({ s1: 'Park_Hye-in', s2: 'acting_coy' });
  });

  it('applies overrides through bootstrapAssetCatalogFromEntries and builds clean vocab', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      slotTokenCounts: { s1: 2 },
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const catalog = bootstrapAssetCatalogFromEntries(createDefaultAssetCatalog(), [...ENTRIES], { mode: 'full', split });
    expect(catalog.vocab.s1).toEqual(['Park_Hye-in', 'Rivea']);
    expect(catalog.vocab.s2).toEqual(['acting_coy', 'angry']);
    expect(catalog.assignments['additional/Rivea_acting_coy.png']).toEqual({ s1: 'Rivea', s2: 'acting_coy' });
  });

  it('works when only an override exists without global counts', () => {
    const split: AssetCatalogBootstrapSplitOptions = {
      separator: '_',
      groupOverrides: [{ firstToken: 'Park', slotTokenCounts: { s1: 2 } }],
    };
    const preview = previewAssetCatalogBootstrapEntries(createDefaultAssetCatalog(), [ENTRIES[0]], split);
    expect(preview[0]?.slots).toEqual({ s1: 'Park_Hye-in', s2: 'acting_coy' });
  });
});

describe('summarizeAssetCatalogBootstrapGroups', () => {
  const SPLIT: AssetCatalogBootstrapSplitOptions = { separator: '_', slotTokenCounts: { s1: 2, s2: 1 } };

  it('flags insufficient-tokens when a name cannot satisfy the configured counts', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      SPLIT,
    );
    const rivea = groups.find((group) => group.firstToken === 'Rivea');
    expect(rivea?.anomalies).toContain('insufficient-tokens');
    expect(groups.find((group) => group.firstToken === 'Park')?.anomalies).toEqual([]);
  });

  it('surfaces the shortest offending entry as insufficientExample', () => {
    const groups = summarize(
      [
        // 3조각짜리는 규칙을 만족하지만, 같은 그룹의 1조각짜리가 경고를 유발한다.
        { path: 'a/C003.after_sex.1.png', name: 'C003.after_sex.1' },
        { path: 'a/C003.idle.png', name: 'C003.idle' },
        { path: 'a/C003.png', name: 'C003' },
      ],
      { separator: '.', slotTokenCounts: { s1: 1, s2: 1 } },
    );
    const c003 = groups.find((group) => group.firstToken === 'C003');
    expect(c003?.anomalies).toContain('insufficient-tokens');
    // 정상 예시(C003.after_sex.1)가 아니라 위반 항목(C003)을 짚어야 한다.
    expect(c003?.insufficientExample).toBe('C003');
  });

  it('omits insufficientExample when no entry violates the rule', () => {
    const groups = summarize([{ path: 'a/C003.idle.png', name: 'C003.idle' }], {
      separator: '.',
      slotTokenCounts: { s1: 1, s2: 1 },
    });
    expect(groups.find((group) => group.firstToken === 'C003')?.insufficientExample).toBeUndefined();
  });

  it('flags vocab-overlap when fragmented s1 last tokens appear in other groups s2 tokens', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Park_Hye-in_blushing_shyly.png', name: 'Park_Hye-in_blushing_shyly' },
        { path: 'a/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
        { path: 'a/Rivea_blushing_shyly.png', name: 'Rivea_blushing_shyly' },
      ],
      SPLIT,
    );
    expect(groups.find((group) => group.firstToken === 'Rivea')?.anomalies).toContain('vocab-overlap');
    expect(groups.find((group) => group.firstToken === 'Park')?.anomalies).toEqual([]);
  });

  it('clears anomalies once a correct override is applied', () => {
    const overridden: AssetCatalogBootstrapSplitOptions = {
      ...SPLIT,
      groupOverrides: [{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }],
    };
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Rivea_acting_coy.png', name: 'Rivea_acting_coy' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      overridden,
    );
    expect(groups.find((group) => group.firstToken === 'Rivea')?.anomalies).toEqual([]);
  });

  it('does not flag a group that exactly fills the configured non-last slots (empty last slot)', () => {
    // 3-slot 스키마: s1=2, s2=1 지정 시 s3는 remainder라 비어도 유효해야 한다.
    const catalog = createDefaultAssetCatalog();
    catalog.schema.slots.push({ id: 's3', label: 'variant' });
    catalog.vocab.s3 = [];
    const entries = [
      { path: 'a/Rivea_happy.png', name: 'Rivea_happy' },
      { path: 'a/Kang_do-gyun_happy.png', name: 'Kang_do-gyun_happy' },
      { path: 'a/Kang_do-gyun_angry.png', name: 'Kang_do-gyun_angry' },
    ];
    const preview = previewAssetCatalogBootstrapEntries(catalog, entries, SPLIT);
    const groups = summarizeAssetCatalogBootstrapGroups(catalog, preview, SPLIT);

    expect(preview.find((entry) => entry.name === 'Kang_do-gyun_happy')?.slots).toEqual({ s1: 'Kang_do-gyun', s2: 'happy' });
    expect(groups.find((group) => group.firstToken === 'Kang')?.anomalies).toEqual([]);
    // Rivea는 조각이 부족(2 < s1+s2=3)하므로 여전히 유효하게 잡힌다.
    expect(groups.find((group) => group.firstToken === 'Rivea')?.anomalies).toContain('insufficient-tokens');
  });

  it('reports counts and sorts anomalous groups first, then by entry count desc', () => {
    const groups = summarize(
      [
        { path: 'a/Park_Hye-in_angry.png', name: 'Park_Hye-in_angry' },
        { path: 'a/Park_Hye-in_bored.png', name: 'Park_Hye-in_bored' },
        { path: 'a/Park_Hye-in_acting_coy.png', name: 'Park_Hye-in_acting_coy' },
        { path: 'a/Rivea_angry.png', name: 'Rivea_angry' },
      ],
      SPLIT,
    );
    expect(groups.map((group) => group.firstToken)).toEqual(['Rivea', 'Park']);
    expect(groups[1]).toMatchObject({ entryCount: 3, tokenCountMin: 3, tokenCountMax: 4 });
  });
});
