/**
 * Asset Manager grid model tests.
 * @file packages/webview/tests/lib/asset-manager/gridModel.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  applyTileSelection,
  assignmentProgressLabel,
  chainedValuesForClient,
  computeCrossMatrixClient,
  computeMissingMatrixClient,
  computeSummaryMatrixClient,
  computeVirtualWindow,
  filterAssetEntries,
  filterEntriesByCombo,
  sortAssetEntries,
} from '../../../src/lib/asset-manager/gridModel';
import type { AssetManagerAssetEntry } from '../../../src/lib/types/assetManager';

function entry(partial: Partial<AssetManagerAssetEntry> & { readonly path: string }): AssetManagerAssetEntry {
  const { path, ...rest } = partial;
  return {
    path,
    subdir: 'additional',
    ext: 'webp',
    sizeBytes: 100,
    mtimeMs: 0,
    fileStem: path.split('/').pop() ?? '',
    assignment: null,
    generatedName: null,
    flags: { unassigned: true, duplicate: false },
    ...rest,
  };
}

describe('filter/sort', () => {
  const entries = [
    entry({
      path: 'additional/b_sad.webp',
      generatedName: 'B sad',
      assignment: { s1: 'Rin', s2: 'sad' },
      flags: { unassigned: false, duplicate: false },
    }),
    entry({ path: 'additional/a_angry.webp', sizeBytes: 300, assignment: { s1: 'Rin', s2: 'angry', s3: 'closeup' } }),
    entry({ path: 'icons/main.png', subdir: 'icons' }),
  ];

  it('filters by subdir, query and flags', () => {
    expect(
      filterAssetEntries(entries, {
        subdir: 'additional',
        query: '',
        slotFilters: {},
        onlyUnassigned: false,
        onlyDuplicate: false,
      }),
    ).toHaveLength(2);
    expect(
      filterAssetEntries(entries, {
        subdir: 'all',
        query: 'sad',
        slotFilters: {},
        onlyUnassigned: false,
        onlyDuplicate: false,
      }),
    ).toHaveLength(1);
    expect(
      filterAssetEntries(entries, {
        subdir: 'all',
        query: '',
        slotFilters: {},
        onlyUnassigned: true,
        onlyDuplicate: false,
      }),
    ).toHaveLength(2);
  });

  it('sorts by size descending on size key', () => {
    const sorted = sortAssetEntries(entries, 'size');
    expect(sorted[0]?.sizeBytes).toBe(300);
  });

  it('filters by assigned s1/s2/s3 slot values', () => {
    expect(
      filterAssetEntries(entries, {
        subdir: 'all',
        query: '',
        slotFilters: { s1: 'Rin', s2: 'angry', s3: 'closeup' },
        onlyUnassigned: false,
        onlyDuplicate: false,
      }).map((item) => item.path),
    ).toEqual(['additional/a_angry.webp']);
  });
});

describe('assignmentProgressLabel', () => {
  const slots = [
    { id: 's1' as const, label: 'character' },
    { id: 's2' as const, label: 'outfit' },
    { id: 's3' as const, label: 'emotion' },
  ];

  it('labels no assignment and partial assignment, then omits complete assignment', () => {
    expect(assignmentProgressLabel(null, slots)).toBe('미할당');
    expect(assignmentProgressLabel({ s1: 'Rin' }, slots)).toBe('s1까지');
    expect(assignmentProgressLabel({ s1: 'Rin', s2: 'casual' }, slots)).toBe('s2까지');
    expect(assignmentProgressLabel({ s1: 'Rin', s2: 'casual', s3: 'sad' }, slots)).toBeNull();
  });
});

describe('computeVirtualWindow', () => {
  it('windows rows with overscan and padding', () => {
    const window = computeVirtualWindow({
      scrollTop: 1000,
      viewportHeight: 600,
      tileSize: 180,
      gap: 8,
      columns: 5,
      totalItems: 3000,
      overscanRows: 2,
    });
    const rowHeight = 188;
    expect(window.startIndex).toBe((Math.floor(1000 / rowHeight) - 2) * 5);
    expect(window.endIndex).toBeGreaterThan(window.startIndex);
    expect(
      window.topPadding +
        window.bottomPadding +
        Math.ceil((window.endIndex - window.startIndex) / 5) * rowHeight,
    ).toBe(window.totalHeight);
  });

  it('clamps at boundaries', () => {
    const window = computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: 600,
      tileSize: 180,
      gap: 8,
      columns: 4,
      totalItems: 10,
      overscanRows: 3,
    });
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(10);
  });
});

describe('applyTileSelection', () => {
  const paths = ['a', 'b', 'c', 'd'];

  it('supports single/toggle/range', () => {
    let state = applyTileSelection(paths, new Set(), null, 'b', 'single');
    expect([...state.selected]).toEqual(['b']);
    state = applyTileSelection(paths, state.selected, state.anchorPath, 'd', 'range');
    expect([...state.selected].sort()).toEqual(['b', 'c', 'd']);
    state = applyTileSelection(paths, state.selected, state.anchorPath, 'c', 'toggle');
    expect(state.selected.has('c')).toBe(false);
  });
});

describe('computeMissingMatrixClient', () => {
  it('mirrors core 2-slot semantics (duplicate/missing/excluded)', () => {
    const catalog = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad'] },
      expected: { Yua: { s2: ['angry'] } },
      assignments: {
        'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
        'additional/rin_angry2.png': { s1: 'Rin', s2: 'angry' },
      },
    };
    const matrix = computeMissingMatrixClient(catalog);
    expect(matrix?.cells[0]?.[0]?.state).toBe('duplicate');
    expect(matrix?.cells[0]?.[1]?.state).toBe('missing');
    expect(matrix?.cells[1]?.[1]?.state).toBe('excluded');
  });

  it('collapses 3-slot rows to a single s2 when constrained', () => {
    const catalog = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'outfit' },
          { id: 's3' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2} {s3}',
      },
      vocab: { s1: ['Rin'], s2: ['casual', 'uniform'], s3: ['angry', 'sad'] },
      expected: {},
      assignments: {
        'a/rin_uniform_angry.png': { s1: 'Rin', s2: 'uniform', s3: 'angry' },
      },
    };

    const full = computeMissingMatrixClient(catalog, 'Rin');
    expect(full?.rows).toEqual(['casual', 'uniform']);

    const collapsed = computeMissingMatrixClient(catalog, 'Rin', 'uniform');
    expect(collapsed?.rows).toEqual(['uniform']);
    expect(collapsed?.cols).toEqual(['angry', 'sad']);
    expect(collapsed?.cells[0]?.[0]?.state).toBe('present');
    expect(collapsed?.cells[0]?.[1]?.state).toBe('missing');
  });

  it('collapses 2-slot rows to a single s1 when pinned', () => {
    const catalog = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad'] },
      expected: {},
      assignments: { 'a/rin_angry.png': { s1: 'Rin', s2: 'angry' } },
    };

    expect(computeMissingMatrixClient(catalog)?.rows).toEqual(['Rin', 'Yua']);

    const pinned = computeMissingMatrixClient(catalog, 'Yua');
    expect(pinned?.rows).toEqual(['Yua']);
    expect(pinned?.cols).toEqual(['angry', 'sad']);
  });
});

describe('computeSummaryMatrixClient', () => {
  const threeSlotCatalog = {
    version: 1 as const,
    schema: {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'outfit' },
        { id: 's3' as const, label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2} {s3}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['casual', 'uniform'], s3: ['angry', 'sad'] },
    expected: {},
    assignments: {
      'a/rin_casual_angry.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/rin_casual_angry2.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/rin_casual_sad.png': { s1: 'Rin', s2: 'casual', s3: 'sad' },
      'a/rin_uniform_angry.png': { s1: 'Rin', s2: 'uniform', s3: 'angry' },
    },
  };

  it('aggregates complete/partial/empty states with counts', () => {
    const summary = computeSummaryMatrixClient(threeSlotCatalog);
    expect(summary?.rows).toEqual(['Rin', 'Yua']);
    expect(summary?.cols).toEqual(['casual', 'uniform']);
    expect(summary?.cells[0]?.[0]).toMatchObject({
      state: 'complete',
      presentCount: 2,
      expectedCount: 2,
      duplicateCount: 1,
      missingValues: [],
    });
    expect(summary?.cells[0]?.[1]).toMatchObject({
      state: 'partial',
      presentCount: 1,
      expectedCount: 2,
      missingValues: ['sad'],
    });
    expect(summary?.cells[1]?.[0]).toMatchObject({ state: 'empty', presentCount: 0, expectedCount: 2 });
  });

  it('applies per-s1 expected overrides for both s2 (excluded) and s3 (denominator)', () => {
    const withOverride = {
      ...threeSlotCatalog,
      expected: { Yua: { s2: ['casual'], s3: ['angry'] } },
    };
    const summary = computeSummaryMatrixClient(withOverride);
    expect(summary?.cells[1]?.[1]?.state).toBe('excluded');
    expect(summary?.cells[1]?.[0]).toMatchObject({ state: 'empty', expectedCount: 1 });
  });

  it('shows aggregation instead of excluded when files exist outside expected s2', () => {
    const withOverride = {
      ...threeSlotCatalog,
      expected: { Rin: { s2: ['casual'] } },
    };
    const summary = computeSummaryMatrixClient(withOverride);
    expect(summary?.cells[0]?.[1]?.state).toBe('partial');
  });

  it('does not exclude outside-expected s2 when only non-expected s3 files exist', () => {
    const withUnexpectedS3 = {
      ...threeSlotCatalog,
      expected: { Rin: { s2: ['casual'], s3: ['sad'] } },
      assignments: {
        'a/rin_uniform_angry.png': { s1: 'Rin', s2: 'uniform', s3: 'angry' },
      },
    };
    const summary = computeSummaryMatrixClient(withUnexpectedS3);
    expect(summary?.cells[0]?.[1]).toMatchObject({ state: 'empty', presentCount: 0, expectedCount: 1 });
  });

  it('marks cells excluded when the expected s3 list is empty', () => {
    const noS3 = { ...threeSlotCatalog, expected: { Rin: { s3: [] } } };
    const summary = computeSummaryMatrixClient(noS3);
    expect(summary?.cells[0]?.[0]?.state).toBe('excluded');
  });

  it('hides bare s1 (only s1-tagged, no override) rows when hideBareS1 is set', () => {
    const withBare = {
      ...threeSlotCatalog,
      vocab: { ...threeSlotCatalog.vocab, s1: ['Rin', 'Yua', 'Mei'] },
      expected: { Yua: { s2: ['casual'] } }, // Yua: override 있음 → 조합 파일 없어도 유지
      assignments: {
        ...threeSlotCatalog.assignments, // Rin: s2 조합 파일 있음
        'a/mei_portrait.png': { s1: 'Mei' }, // Mei: s1-only → bare
      },
    };
    expect(computeSummaryMatrixClient(withBare)?.rows).toEqual(['Rin', 'Yua', 'Mei']);
    expect(computeSummaryMatrixClient(withBare, { hideBareS1: true })?.rows).toEqual(['Rin', 'Yua']);
  });

  it('returns null for non-3-slot schemas', () => {
    const twoSlot = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin'], s2: ['angry'] },
      expected: {},
      assignments: {},
    };
    expect(computeSummaryMatrixClient(twoSlot)).toBeNull();
  });
});

describe('computeCrossMatrixClient', () => {
  const catalog = {
    version: 1 as const,
    schema: {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'outfit' },
        { id: 's3' as const, label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2} {s3}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['casual', 'uniform'], s3: ['angry', 'sad'] },
    // Yua 는 uniform 만, sad 만 기대 → (casual,*)·(uniform,angry) 셀은 Yua 열에서 excluded
    expected: { Yua: { s2: ['uniform'], s3: ['sad'] } },
    assignments: {
      'a/rin_casual_angry.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/rin_casual_angry2.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
      'a/yua_beach_wink.png': { s1: 'Yua', s2: 'beach', s3: 'wink' },
    },
  };

  it('builds rows from explicit-override combos union actual files, vocab order first', () => {
    const cross = computeCrossMatrixClient(catalog);
    // 행 = 명시적 override 기대 조합 ∪ 실제 파일 조합만 (override 없는 Rin 은 vocab 전체를 깔지 않음).
    //   - (casual, angry): Rin 실제 파일 → vocab 조합.
    //   - (uniform, sad): Yua override(s2:uniform × s3:sad) → vocab 조합.
    //   - (beach, wink): Yua 실제 파일이지만 vocab 밖 → 뒤에 append.
    expect(cross?.rows).toEqual([
      { s2: 'casual', s3: 'angry' },
      { s2: 'uniform', s3: 'sad' },
      { s2: 'beach', s3: 'wink' },
    ]);
    expect(cross?.cols).toEqual(['Rin', 'Yua']);
  });

  it('does not fall back to full vocab cartesian for uncurated s1 (no row explosion)', () => {
    const noOverrides = {
      ...catalog,
      expected: {}, // 아무도 override 안 함
      assignments: {
        'a/rin_casual_angry.png': { s1: 'Rin', s2: 'casual', s3: 'angry' },
        'a/yua_uniform_sad.png': { s1: 'Yua', s2: 'uniform', s3: 'sad' },
      },
    };
    const cross = computeCrossMatrixClient(noOverrides);
    // vocab 는 2×2=4 조합이지만 override 없음 → 실제 파일 2조합만 행이 됨(폭발 방지).
    expect(cross?.rows).toEqual([
      { s2: 'casual', s3: 'angry' },
      { s2: 'uniform', s3: 'sad' },
    ]);
  });

  it('marks cells present/duplicate/missing/excluded per s1 expected sets', () => {
    const cross = computeCrossMatrixClient(catalog);
    // (casual, angry): Rin 파일 2개 → duplicate. Yua 는 기대 밖 + 파일 없음 → excluded.
    expect(cross?.cells[0]?.[0]).toMatchObject({ s1: 'Rin', state: 'duplicate', count: 2 });
    expect(cross?.cells[0]?.[1]).toMatchObject({ s1: 'Yua', state: 'excluded' });
    // (uniform, sad): Rin 기대(override 없음 → 전체 vocab 기대) + 파일 없음 → missing. Yua override 기대 + 파일 없음 → missing.
    expect(cross?.cells[1]?.[0]?.state).toBe('missing');
    expect(cross?.cells[1]?.[1]?.state).toBe('missing');
    // (beach, wink): Yua 파일 1개 → present (기대 밖이어도 파일 있으면 표시). Rin → excluded.
    expect(cross?.cells[2]?.[1]).toMatchObject({ state: 'present', count: 1, paths: ['a/yua_beach_wink.png'] });
    expect(cross?.cells[2]?.[0]?.state).toBe('excluded');
  });

  it('sorts out-of-vocab extras lexicographically after vocab combos', () => {
    const withExtras = {
      ...catalog,
      assignments: {
        'a/z.png': { s1: 'Rin', s2: 'winter', s3: 'sad' },
        'a/y.png': { s1: 'Rin', s2: 'beach', s3: 'wink' },
        'a/x.png': { s1: 'Rin', s2: 'beach', s3: 'angry' },
      },
    };
    const cross = computeCrossMatrixClient(withExtras);
    // vocab 조합은 Yua override 로부터 (uniform, sad) 1개뿐 → extras 는 index 1 부터.
    expect(cross?.rows[0]).toEqual({ s2: 'uniform', s3: 'sad' });
    expect(cross?.rows.slice(1)).toEqual([
      { s2: 'beach', s3: 'angry' },
      { s2: 'beach', s3: 'wink' },
      { s2: 'winter', s3: 'sad' },
    ]);
  });

  it('hides bare s1 (only s1-tagged, no override) columns when hideBareS1 is set', () => {
    const withBare = {
      ...catalog,
      vocab: { ...catalog.vocab, s1: ['Rin', 'Yua', 'Mei'] },
      assignments: {
        ...catalog.assignments, // Rin: 조합 파일, Yua: override + beach_wink 조합
        'a/mei_portrait.png': { s1: 'Mei' }, // Mei: s1-only → bare
      },
    };
    expect(computeCrossMatrixClient(withBare)?.cols).toEqual(['Rin', 'Yua', 'Mei']);
    const hidden = computeCrossMatrixClient(withBare, { hideBareS1: true });
    expect(hidden?.cols).toEqual(['Rin', 'Yua']);
    // 각 행 셀도 필터된 열 수와 일치해야 함
    expect(hidden?.cells.every((cellRow) => cellRow.length === 2)).toBe(true);
  });

  it('ignores assignments missing s2 or s3 and returns null for non-3-slot schemas', () => {
    const partial = {
      ...catalog,
      expected: { Rin: { s2: [], s3: [] }, Yua: { s2: [], s3: [] } },
      assignments: { 'a/rin_only.png': { s1: 'Rin', s2: 'casual' } },
    };
    // s3 미할당 파일은 행을 만들지 않음 + expected 전부 비면 행 없음
    expect(computeCrossMatrixClient(partial)?.rows).toEqual([]);

    const twoSlot = {
      version: 1 as const,
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
        ],
        joinTemplate: '{s1} {s2}',
      },
      vocab: { s1: ['Rin'], s2: ['angry'] },
      expected: {},
      assignments: {},
    };
    expect(computeCrossMatrixClient(twoSlot)).toBeNull();
  });
});

describe('filterEntriesByCombo', () => {
  const entries = [
    entry({ path: 'a/rin_casual_angry.png', assignment: { s1: 'Rin', s2: 'casual', s3: 'angry' } }),
    entry({ path: 'a/rin_casual_sad.png', assignment: { s1: 'Rin', s2: 'casual', s3: 'sad' } }),
    entry({ path: 'a/rin_uniform_angry.png', assignment: { s1: 'Rin', s2: 'uniform', s3: 'angry' } }),
    entry({ path: 'a/yua_casual_angry.png', assignment: { s1: 'Yua', s2: 'casual', s3: 'angry' } }),
    entry({ path: 'a/unassigned.png', assignment: null }),
  ];

  it('matches a full combo exactly', () => {
    const matched = filterEntriesByCombo(entries, ['Rin', 'casual', 'angry']);
    expect(matched.map((item) => item.path)).toEqual(['a/rin_casual_angry.png']);
  });

  it('treats undefined slots as wildcards (partial combo)', () => {
    const matched = filterEntriesByCombo(entries, ['Rin', 'casual', undefined]);
    expect(matched.map((item) => item.path)).toEqual(['a/rin_casual_angry.png', 'a/rin_casual_sad.png']);
  });

  it('excludes unassigned entries when any slot is constrained', () => {
    expect(filterEntriesByCombo(entries, ['Rin', undefined, undefined])).toHaveLength(3);
    expect(filterEntriesByCombo(entries, [undefined, 'casual', undefined])).toHaveLength(3);
  });
});

describe('chainedValuesForClient', () => {
  const catalog = {
    version: 1 as const,
    schema: {
      slots: [
        { id: 's1' as const, label: 'character' },
        { id: 's2' as const, label: 'outfit' },
        { id: 's3' as const, label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2} {s3}',
    },
    vocab: { s1: ['agatha', 'bob'], s2: ['dress', 'nun', 'nude', 'suit'], s3: ['angry'] },
    expected: {},
    assignments: {
      'a/agatha_dress_angry.png': { s1: 'agatha', s2: 'dress', s3: 'angry' },
      'a/agatha_nun_angry.png': { s1: 'agatha', s2: 'nun', s3: 'angry' },
      'a/agatha_nude_angry.png': { s1: 'agatha', s2: 'nude', s3: 'angry' },
      'a/bob_suit_angry.png': { s1: 'bob', s2: 'suit', s3: 'angry' },
    },
  };

  it('derives s2 options from what is assigned to the s1 (vocab order)', () => {
    expect(chainedValuesForClient(catalog, 'agatha', 's2')).toEqual(['dress', 'nun', 'nude']);
    expect(chainedValuesForClient(catalog, 'bob', 's2')).toEqual(['suit']);
  });

  it('prefers the expected override when configured', () => {
    const withOverride = { ...catalog, expected: { agatha: { s2: ['dress'] } } };
    expect(chainedValuesForClient(withOverride, 'agatha', 's2')).toEqual(['dress']);
  });
});
