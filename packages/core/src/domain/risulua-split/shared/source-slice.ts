/**
 * Exact source slicing utilities.
 *
 * Slices are always taken from the **original source text** using the exact
 * start/end character offsets.  No AST reprinting or formatting is performed.
 */

import type { LuaSourceRange } from './types';

/**
 * Extract the exact source text for the given range.
 */
export function sliceSourceRange(source: string, range: LuaSourceRange): string {
  return source.slice(range.startOffset, range.endOffset);
}

/**
 * Extract the exact source text for a pair of 0-based offsets.
 */
export function sliceSourceOffsets(source: string, startOffset: number, endOffset: number): string {
  return source.slice(startOffset, endOffset);
}

/**
 * Reconstruct the original top-level text by concatenating source slices
 * for non-overlapping, ordered atoms.
 *
 * Returns `{ text, missingByteCount }` where `missingByteCount` is the
 * number of bytes between the end of the last concatenated slice and the
 * end of source that were not covered by any slice (gaps between atoms).
 */
export function reconstructTopLevelText(
  source: string,
  ranges: Array<{ startOffset: number; endOffset: number }>,
): { text: string; gapByteCount: number } {
  const sorted = [...ranges].sort((a, b) => a.startOffset - b.startOffset);
  let text = '';
  let gapByteCount = 0;
  let cursor = 0;

  for (const range of sorted) {
    if (range.startOffset > cursor) {
      gapByteCount += range.startOffset - cursor;
    }
    text += source.slice(range.startOffset, range.endOffset);
    cursor = range.endOffset;
  }

  if (cursor < source.length) {
    gapByteCount += source.length - cursor;
  }

  return { text, gapByteCount };
}

/**
 * Check that a set of ranges is non-overlapping (sorted by startOffset).
 */
export function rangesAreNonOverlapping(ranges: Array<{ startOffset: number; endOffset: number }>): boolean {
  const sorted = [...ranges].sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startOffset < sorted[i - 1].endOffset) {
      return false;
    }
  }
  return true;
}
