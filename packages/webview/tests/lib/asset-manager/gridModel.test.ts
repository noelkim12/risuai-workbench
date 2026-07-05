/**
 * Asset Manager grid model tests.
 * @file packages/webview/tests/lib/asset-manager/gridModel.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  applyTileSelection,
  assignmentProgressLabel,
  chainedValuesForClient,
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
