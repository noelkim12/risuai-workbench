import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../src/domain/asset/catalog';
import {
  computeMissingMatrix,
  expectedListFor,
  findDuplicateNameGroups,
  listMissingCombos,
} from '../src/domain/asset/missing';

function twoSlotCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'emotion' },
      ],
      joinTemplate: '{s1} {s2}',
    },
    vocab: { s1: ['Rin', 'Yua'], s2: ['angry', 'sad', 'smile'] },
    expected: { Yua: { s2: ['angry'] } },
    assignments: {
      'additional/rin_angry.png': { s1: 'Rin', s2: 'angry' },
      'additional/rin_angry_alt.png': { s1: 'Rin', s2: 'angry' },
      'additional/yua_angry.png': { s1: 'Yua', s2: 'angry' },
    },
  };
}

function threeSlotCatalog(): AssetCatalog {
  return {
    version: 1,
    schema: {
      slots: [
        { id: 's1', label: 'character' },
        { id: 's2', label: 'attire' },
        { id: 's3', label: 'emotion' },
      ],
      joinTemplate: '{s1}_{s2}_{s3}',
    },
    vocab: { s1: ['Elsie'], s2: ['Dress', 'Nude'], s3: ['angry', 'sad'] },
    expected: { Elsie: { s2: ['Dress'], s3: null } },
    assignments: {
      'additional/a.webp': { s1: 'Elsie', s2: 'Dress', s3: 'angry' },
    },
  };
}

describe('expectedListFor', () => {
  it('falls back to full vocab when no override', () => {
    expect(expectedListFor(twoSlotCatalog(), 'Rin', 's2')).toEqual(['angry', 'sad', 'smile']);
  });

  it('applies per-s1 override', () => {
    expect(expectedListFor(twoSlotCatalog(), 'Yua', 's2')).toEqual(['angry']);
  });
});

describe('computeMissingMatrix (2-slot)', () => {
  it('builds rows=s1, cols=s2 with duplicate/missing/excluded states', () => {
    const matrix = computeMissingMatrix(twoSlotCatalog());
    expect(matrix).not.toBeNull();
    if (matrix === null) return;

    expect(matrix.rows).toEqual(['Rin', 'Yua']);
    expect(matrix.cols).toEqual(['angry', 'sad', 'smile']);
    const rinRow = matrix.cells[0];
    const yuaRow = matrix.cells[1];
    expect(rinRow?.[0]?.state).toBe('duplicate');
    expect(rinRow?.[0]?.count).toBe(2);
    expect(rinRow?.[1]?.state).toBe('missing');
    expect(yuaRow?.[0]?.state).toBe('present');
    expect(yuaRow?.[1]?.state).toBe('excluded');
  });
});

describe('computeMissingMatrix (3-slot)', () => {
  it('requires s1 and builds rows=s2, cols=s3 within expected sets', () => {
    expect(computeMissingMatrix(threeSlotCatalog())).toBeNull();
    const matrix = computeMissingMatrix(threeSlotCatalog(), { s1: 'Elsie' });
    expect(matrix).not.toBeNull();
    if (matrix === null) return;

    expect(matrix.rows).toEqual(['Dress']);
    expect(matrix.cols).toEqual(['angry', 'sad']);
    expect(matrix.cells[0]?.[0]?.state).toBe('present');
    expect(matrix.cells[0]?.[1]?.state).toBe('missing');
  });
});

describe('listMissingCombos', () => {
  it('lists expected combos without assignments, with rendered names', () => {
    const combos = listMissingCombos(threeSlotCatalog());
    expect(combos).toEqual([{ slots: { s1: 'Elsie', s2: 'Dress', s3: 'sad' }, name: 'Elsie_Dress_sad' }]);
  });
});

describe('findDuplicateNameGroups', () => {
  it('groups assignments resolving to the same rendered name', () => {
    const groups = findDuplicateNameGroups(twoSlotCatalog());
    expect(groups).toEqual([
      { name: 'Rin angry', paths: ['additional/rin_angry.png', 'additional/rin_angry_alt.png'] },
    ]);
  });
});
