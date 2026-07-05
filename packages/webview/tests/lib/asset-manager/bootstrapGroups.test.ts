import { describe, expect, it } from 'vitest';
import {
  anomalyLabel,
  buildGroupOverrides,
  detectFirstSlotCounts,
  detectSeparator,
  detectSlotCount,
  pruneStaleOverrides,
} from '../../../src/lib/asset-manager/bootstrapGroups';
import type { AssetCatalogBootstrapGroupSummaryMirror } from '../../../src/lib/types/assetManager';

const GROUPS: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [
  { firstToken: 'Rivea', entryCount: 24, tokenCountMin: 2, tokenCountMax: 5, anomalies: ['insufficient-tokens'] },
  { firstToken: 'Park', entryCount: 90, tokenCountMin: 3, tokenCountMax: 6, anomalies: [] },
];

describe('bootstrapGroups helpers', () => {
  it('drops overrides equal to the global counts', () => {
    const edited = new Map([
      ['Rivea', { s1: 1, s2: 1 }],
      ['Park', { s1: 2, s2: 1 }],
    ]);
    expect(buildGroupOverrides(edited, { s1: 2, s2: 1 })).toEqual([
      { firstToken: 'Rivea', slotTokenCounts: { s1: 1, s2: 1 } },
    ]);
  });

  it('returns an empty array when nothing differs from global', () => {
    expect(buildGroupOverrides(new Map([['Park', { s1: 2, s2: 1 }]]), { s1: 2, s2: 1 })).toEqual([]);
  });

  it('prunes overrides whose group disappeared from the latest preview', () => {
    const edited = new Map([
      ['Rivea', { s1: 1, s2: 1 }],
      ['Ghost', { s1: 3, s2: 1 }],
    ]);
    const pruned = pruneStaleOverrides(edited, GROUPS);
    expect([...pruned.keys()]).toEqual(['Rivea']);
  });

  it('maps anomaly reasons to Korean labels', () => {
    expect(anomalyLabel('insufficient-tokens')).toBe('지정한 조각 수를 적용할 수 없는 항목 있음');
    expect(anomalyLabel('vocab-overlap')).toBe('다른 그룹의 뒷슬롯 어휘와 겹침 (오분할 의심)');
  });

  it('builds overrides across an arbitrary set of non-last slots (s1 only)', () => {
    const edited = new Map([['Rivea', { s1: 1 }]]);
    expect(buildGroupOverrides(edited, { s1: 2 })).toEqual([{ firstToken: 'Rivea', slotTokenCounts: { s1: 1 } }]);
    expect(buildGroupOverrides(new Map([['Rivea', { s1: 2 }]]), { s1: 2 })).toEqual([]);
  });
});

describe('detectSeparator', () => {
  it('picks the delimiter that splits the most names into >=2 tokens', () => {
    expect(detectSeparator(['Rivea_happy', 'Kang_do-gyun_angry'], '_')).toBe('_');
    expect(detectSeparator(['Rivea-happy', 'Kang-angry'], '_')).toBe('-');
    expect(detectSeparator(['Rivea happy', 'Kang angry'], '_')).toBe(' ');
  });

  it('prefers underscore over hyphen when both appear in every name (tie-break)', () => {
    expect(detectSeparator(['Kang_do-gyun_happy', 'Kang_do-gyun_angry'], '-')).toBe('_');
  });

  it('falls back when no candidate produces multiple tokens', () => {
    expect(detectSeparator(['Rivea', 'Kang'], '.')).toBe('.');
    expect(detectSeparator([], '_')).toBe('_');
  });
});

describe('detectSlotCount', () => {
  it('suggests 3 slots when a solid fraction of names reach 3 tokens', () => {
    expect(detectSlotCount(['Rivea_happy', 'Rivea_angry', 'Kang_do-gyun_happy', 'Kang_do-gyun_angry'], '_')).toBe(3);
  });

  it('suggests 2 slots for uniformly 2-token names', () => {
    expect(detectSlotCount(['Rivea_happy', 'Kang_angry', 'Mia_sad'], '_')).toBe(2);
  });

  it('ignores rare high-token outliers below the coverage threshold', () => {
    const names = ['a_x', 'b_x', 'c_x', 'd_x', 'e_x', 'f_x', 'g_x', 'h_x', 'i_x', 'j_a_b_c'];
    expect(detectSlotCount(names, '_')).toBe(2);
  });

  it('falls back to 1 slot for single-token names and 2 for an empty list', () => {
    expect(detectSlotCount(['Rivea', 'Kang'], '_')).toBe(1);
    expect(detectSlotCount([], '_')).toBe(2);
  });
});

describe('detectFirstSlotCounts', () => {
  const NAMES = ['Rivea_happy', 'Rivea_angry', 'Kang_do-gyun_happy', 'Kang_do-gyun_angry'];

  it('detects s1 per group via common leading-token prefix (3-slot)', () => {
    const detection = detectFirstSlotCounts(NAMES, '_', 3);
    expect(detection.groupS1.get('Rivea')).toBe(1);
    expect(detection.groupS1.get('Kang')).toBe(2);
  });

  it('chooses the most common detected value as global, smaller wins ties', () => {
    const detection = detectFirstSlotCounts(NAMES, '_', 3);
    // Rivea→1, Kang→2 : one group each, tie resolves to the smaller value
    expect(detection.global).toBe(1);
  });

  it('clamps s1 so middle slots keep at least one token', () => {
    // 3-slot: upper bound = groupMinTokens - 1; a 2-token group cannot exceed s1=1
    const detection = detectFirstSlotCounts(['Ann_x', 'Ann_y'], '_', 3);
    expect(detection.groupS1.get('Ann')).toBe(1);
  });

  it('skips single-member groups (no variation to learn from)', () => {
    const detection = detectFirstSlotCounts(['Solo_do-gyun_happy'], '_', 3);
    expect(detection.groupS1.has('Solo')).toBe(false);
    expect(detection.global).toBe(1);
  });
});
