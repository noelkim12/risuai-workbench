/**
 * Sorted interval index for fast containment lookups over non-executable ranges.
 *
 * Normalizes overlapping/adjacent ranges on construction so that
 * `containsOffset` and `containsRange` run in O(log R) via binary search.
 */

// ─── Public API ─────────────────────────────────────────────────────

export interface OffsetRangeIndex {
  /** Half-open: `startOffset <= offset < endOffset` */
  containsOffset(offset: number): boolean;
  /** True when some merged range fully encloses `range` (closed-interval containment). */
  containsRange(range: { startOffset: number; endOffset: number }): boolean;
}

export interface OffsetRangeLike {
  startOffset: number;
  endOffset: number;
}

/**
 * Build a sorted, merged interval index from raw ranges.
 *
 * - Empty/invalid ranges (`startOffset >= endOffset`) are silently discarded.
 * - Overlapping and adjacent ranges are coalesced.
 * - The returned index is immutable and safe to share across many lookups.
 */
export function createOffsetRangeIndex(ranges: ReadonlyArray<OffsetRangeLike>): OffsetRangeIndex {
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return EMPTY_INDEX;
  return new SortedRangeIndex(merged);
}

// ─── Implementation ─────────────────────────────────────────────────

class SortedRangeIndex implements OffsetRangeIndex {
  private readonly starts: ReadonlyArray<number>;
  private readonly readonlyEnds: ReadonlyArray<number>;

  constructor(merged: ReadonlyArray<{ startOffset: number; endOffset: number }>) {
    this.starts = merged.map((r) => r.startOffset);
    this.readonlyEnds = merged.map((r) => r.endOffset);
  }

  containsOffset(offset: number): boolean {
    const idx = binarySearchRightmost(this.starts, offset);
    if (idx < 0) return false;
    return offset < this.readonlyEnds[idx];
  }

  containsRange(range: { startOffset: number; endOffset: number }): boolean {
    if (range.startOffset >= range.endOffset) return false;
    const idx = binarySearchRightmost(this.starts, range.startOffset);
    if (idx < 0) return false;
    return range.endOffset <= this.readonlyEnds[idx];
  }
}

const EMPTY_INDEX: OffsetRangeIndex = {
  containsOffset(): boolean { return false; },
  containsRange(): boolean { return false; },
};

// ─── Range merging ──────────────────────────────────────────────────

function mergeRanges(ranges: ReadonlyArray<OffsetRangeLike>): Array<{ startOffset: number; endOffset: number }> {
  if (ranges.length === 0) return [];

  const valid = ranges.filter((r) => r.startOffset < r.endOffset);
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const merged: Array<{ startOffset: number; endOffset: number }> = [];
  let current = { startOffset: sorted[0].startOffset, endOffset: sorted[0].endOffset };

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    // Adjacent or overlapping: coalesce
    if (next.startOffset <= current.endOffset) {
      current.endOffset = Math.max(current.endOffset, next.endOffset);
    } else {
      merged.push(current);
      current = { startOffset: next.startOffset, endOffset: next.endOffset };
    }
  }
  merged.push(current);

  return merged;
}

// ─── Binary search ──────────────────────────────────────────────────

/**
 * Returns the index of the rightmost element in `sorted` that is `<= value`.
 * Returns `-1` if all elements are greater than `value`.
 */
function binarySearchRightmost(sorted: ReadonlyArray<number>, value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}
