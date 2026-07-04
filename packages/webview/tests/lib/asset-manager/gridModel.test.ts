/**
 * Asset Manager grid model tests.
 * @file packages/webview/tests/lib/asset-manager/gridModel.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  applyTileSelection,
  computeMissingMatrixClient,
  computeVirtualWindow,
  filterAssetEntries,
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
      flags: { unassigned: false, duplicate: false },
    }),
    entry({ path: 'additional/a_angry.webp', sizeBytes: 300 }),
    entry({ path: 'icons/main.png', subdir: 'icons' }),
  ];

  it('filters by subdir, query and flags', () => {
    expect(
      filterAssetEntries(entries, {
        subdir: 'additional',
        query: '',
        onlyUnassigned: false,
        onlyDuplicate: false,
      }),
    ).toHaveLength(2);
    expect(
      filterAssetEntries(entries, {
        subdir: 'all',
        query: 'sad',
        onlyUnassigned: false,
        onlyDuplicate: false,
      }),
    ).toHaveLength(1);
    expect(
      filterAssetEntries(entries, {
        subdir: 'all',
        query: '',
        onlyUnassigned: true,
        onlyDuplicate: false,
      }),
    ).toHaveLength(2);
  });

  it('sorts by size descending on size key', () => {
    const sorted = sortAssetEntries(entries, 'size');
    expect(sorted[0]?.sizeBytes).toBe(300);
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
});
