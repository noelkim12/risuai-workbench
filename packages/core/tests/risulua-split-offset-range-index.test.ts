import { describe, expect, it } from 'vitest';

import { createOffsetRangeIndex } from '../src/domain/risulua-split/offset-range-index';

describe('createOffsetRangeIndex', () => {
  // ─── Empty input ────────────────────────────────────────────────

  it('returns false for all queries on empty input', () => {
    const idx = createOffsetRangeIndex([]);
    expect(idx.containsOffset(0)).toBe(false);
    expect(idx.containsOffset(100)).toBe(false);
    expect(idx.containsRange({ startOffset: 0, endOffset: 10 })).toBe(false);
  });

  it('discards invalid/empty ranges and returns empty index', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 5, endOffset: 5 },
      { startOffset: 10, endOffset: 3 },
      { startOffset: -1, endOffset: -5 },
    ]);
    expect(idx.containsOffset(4)).toBe(false);
    expect(idx.containsRange({ startOffset: 3, endOffset: 10 })).toBe(false);
  });

  // ─── Single range ───────────────────────────────────────────────

  it('containsOffset: single range with half-open semantics', () => {
    const idx = createOffsetRangeIndex([{ startOffset: 10, endOffset: 20 }]);
    expect(idx.containsOffset(9)).toBe(false);
    expect(idx.containsOffset(10)).toBe(true);
    expect(idx.containsOffset(15)).toBe(true);
    expect(idx.containsOffset(19)).toBe(true);
    expect(idx.containsOffset(20)).toBe(false);
    expect(idx.containsOffset(21)).toBe(false);
  });

  it('containsRange: single range fully enclosing', () => {
    const idx = createOffsetRangeIndex([{ startOffset: 10, endOffset: 30 }]);
    expect(idx.containsRange({ startOffset: 10, endOffset: 30 })).toBe(true);
    expect(idx.containsRange({ startOffset: 15, endOffset: 25 })).toBe(true);
    expect(idx.containsRange({ startOffset: 9, endOffset: 15 })).toBe(false);
    expect(idx.containsRange({ startOffset: 15, endOffset: 31 })).toBe(false);
    expect(idx.containsRange({ startOffset: 9, endOffset: 31 })).toBe(false);
  });

  // ─── Unsorted input ─────────────────────────────────────────────

  it('handles unsorted input correctly', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 30, endOffset: 40 },
      { startOffset: 10, endOffset: 20 },
      { startOffset: 50, endOffset: 60 },
    ]);
    expect(idx.containsOffset(15)).toBe(true);
    expect(idx.containsOffset(35)).toBe(true);
    expect(idx.containsOffset(55)).toBe(true);
    expect(idx.containsOffset(25)).toBe(false);
    expect(idx.containsOffset(45)).toBe(false);
  });

  // ─── Overlapping range merge ────────────────────────────────────

  it('merges overlapping ranges into one', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 25 },
      { startOffset: 20, endOffset: 35 },
      { startOffset: 30, endOffset: 45 },
    ]);
    // Should be merged into [10, 45)
    expect(idx.containsOffset(10)).toBe(true);
    expect(idx.containsOffset(44)).toBe(true);
    expect(idx.containsOffset(45)).toBe(false);
    expect(idx.containsRange({ startOffset: 15, endOffset: 40 })).toBe(true);
  });

  it('merges fully contained inner range', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 50 },
      { startOffset: 15, endOffset: 30 },
    ]);
    expect(idx.containsOffset(49)).toBe(true);
    expect(idx.containsOffset(50)).toBe(false);
    expect(idx.containsRange({ startOffset: 10, endOffset: 50 })).toBe(true);
  });

  // ─── Adjacent range merge ───────────────────────────────────────

  it('merges adjacent ranges (end == next start)', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 20 },
      { startOffset: 20, endOffset: 30 },
    ]);
    // Merged into [10, 30)
    expect(idx.containsOffset(10)).toBe(true);
    expect(idx.containsOffset(19)).toBe(true);
    expect(idx.containsOffset(20)).toBe(true);
    expect(idx.containsOffset(29)).toBe(true);
    expect(idx.containsOffset(30)).toBe(false);
  });

  // ─── Gaps between ranges ────────────────────────────────────────

  it('preserves gaps between non-adjacent ranges', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 20 },
      { startOffset: 30, endOffset: 40 },
      { startOffset: 60, endOffset: 70 },
    ]);
    expect(idx.containsOffset(15)).toBe(true);
    expect(idx.containsOffset(25)).toBe(false);
    expect(idx.containsOffset(35)).toBe(true);
    expect(idx.containsOffset(50)).toBe(false);
    expect(idx.containsOffset(65)).toBe(true);
  });

  // ─── containsRange with gaps ────────────────────────────────────

  it('containsRange: returns false when range spans a gap', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 20 },
      { startOffset: 30, endOffset: 40 },
    ]);
    expect(idx.containsRange({ startOffset: 15, endOffset: 35 })).toBe(false);
  });

  it('containsRange: returns true for range inside single merged interval', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 20 },
      { startOffset: 30, endOffset: 40 },
    ]);
    expect(idx.containsRange({ startOffset: 30, endOffset: 40 })).toBe(true);
    expect(idx.containsRange({ startOffset: 32, endOffset: 38 })).toBe(true);
  });

  // ─── Empty ranges in queries ────────────────────────────────────

  it('containsRange: returns false for empty query range', () => {
    const idx = createOffsetRangeIndex([{ startOffset: 10, endOffset: 20 }]);
    expect(idx.containsRange({ startOffset: 15, endOffset: 15 })).toBe(false);
    expect(idx.containsRange({ startOffset: 15, endOffset: 14 })).toBe(false);
  });

  // ─── Negative offsets ───────────────────────────────────────────

  it('handles negative offsets correctly', () => {
    const idx = createOffsetRangeIndex([{ startOffset: -10, endOffset: 10 }]);
    expect(idx.containsOffset(-10)).toBe(true);
    expect(idx.containsOffset(0)).toBe(true);
    expect(idx.containsOffset(9)).toBe(true);
    expect(idx.containsOffset(10)).toBe(false);
    expect(idx.containsOffset(-11)).toBe(false);
  });

  // ─── Mixed valid and invalid ────────────────────────────────────

  it('filters out invalid ranges while keeping valid ones', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 5 },   // invalid
      { startOffset: 20, endOffset: 30 },   // valid
      { startOffset: 15, endOffset: 15 },   // invalid (empty)
      { startOffset: 40, endOffset: 50 },   // valid
    ]);
    expect(idx.containsOffset(25)).toBe(true);
    expect(idx.containsOffset(45)).toBe(true);
    expect(idx.containsOffset(35)).toBe(false);
  });

  // ─── Same start, different end (coalesced) ──────────────────────

  it('merges ranges with same startOffset', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 10, endOffset: 20 },
      { startOffset: 10, endOffset: 30 },
    ]);
    expect(idx.containsOffset(25)).toBe(true);
    expect(idx.containsOffset(30)).toBe(false);
  });

  // ─── Boundary stress ────────────────────────────────────────────

  it('exact boundaries at merge seam', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 0, endOffset: 100 },
      { startOffset: 100, endOffset: 200 },
    ]);
    // Merged into [0, 200)
    expect(idx.containsOffset(99)).toBe(true);
    expect(idx.containsOffset(100)).toBe(true);
    expect(idx.containsOffset(199)).toBe(true);
    expect(idx.containsOffset(200)).toBe(false);
  });

  it('containsRange at exact merged boundary', () => {
    const idx = createOffsetRangeIndex([
      { startOffset: 0, endOffset: 50 },
      { startOffset: 50, endOffset: 100 },
    ]);
    expect(idx.containsRange({ startOffset: 0, endOffset: 100 })).toBe(true);
  });
});
