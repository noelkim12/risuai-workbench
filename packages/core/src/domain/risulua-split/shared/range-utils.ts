/**
 * Line/offset utilities for converting between 0-based character offsets
 * and 1-based line / 0-based column ranges in Lua source text.
 *
 * All public functions use the convention documented in types.ts:
 * - `startLine` / `endLine` are **1-based**.
 * - `startOffset` / `endOffset` are **0-based** character offsets into the source string.
 */

export interface LineInfo {
  /** 1-based line number */
  line: number;
  /** 0-based column (character offset from line start) */
  column: number;
}

/**
 * Build a `lineStarts` array where `lineStarts[i]` is the 0-based character
 * offset of the first character on line `i + 1`.
 *
 * - `lineStarts[0]` is always `0` (start of line 1).
 * - The array length equals the number of lines (including any trailing empty line
 *   after a final `\n`).
 */
export function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Convert a 0-based character offset to a 1-based line and 0-based column.
 */
export function offsetToLineColumn(offset: number, lineStarts: number[]): LineInfo {
  if (lineStarts.length === 0) return { line: 1, column: 0 };
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const line = high + 1;
  const column = offset - lineStarts[high];
  return { line, column };
}

/**
 * Return the 1-based line number for a 0-based character offset.
 */
export function lineAtOffset(offset: number, lineStarts: number[]): number {
  return offsetToLineColumn(offset, lineStarts).line;
}

/**
 * Return the total number of lines in the source text.
 */
export function totalLineCount(lineStarts: number[]): number {
  return lineStarts.length;
}

/**
 * Clamp an offset to `[0, maxLength]`.
 */
export function clampOffset(offset: number, maxLength: number): number {
  return Math.max(0, Math.min(offset, maxLength));
}

/**
 * Return the offset of the start of the line containing `offset`.
 */
export function lineStartAtOffset(offset: number, lineStarts: number[]): number {
  const idx = offsetToLineColumn(offset, lineStarts).line - 1;
  return lineStarts[idx] ?? 0;
}

/**
 * Return the offset just past the end of the line containing `offset`
 * (i.e., the position of the `\n` or end-of-source).
 */
export function lineEndAtOffset(offset: number, source: string, lineStarts: number[]): number {
  const lineIdx = offsetToLineColumn(offset, lineStarts).line - 1;
  if (lineIdx + 1 < lineStarts.length) {
    return lineStarts[lineIdx + 1] - 1;
  }
  return source.length;
}
