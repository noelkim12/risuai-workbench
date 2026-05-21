/**
 * Lorebook decorator line-context and token detection helpers.
 * Platform-neutral utilities for LSP completion gating and hover token resolution.
 * Operates on strings and numeric offsets only — no editor/LSP/Monaco types.
 * @file packages/core/src/domain/lorebook/decorators/context.ts
 */

import { normalizeLorebookDecoratorName } from './registry';

/**
 * Completion context for a line-leading `@@` decorator.
 * Produced when the current line up to the cursor matches decorator syntax.
 */
export interface LorebookDecoratorCompletionContext {
  /** Name prefix after `@@` used for filtering candidates (empty when no chars typed). */
  readonly prefix: string;
  /** Start offset of the `@@` token within the line. */
  readonly tokenStart: number;
  /** End offset of the prefix (cursor position). */
  readonly tokenEnd: number;
}

/**
 * Hover token info for a line-leading `@@` decorator.
 * Produced when the cursor falls inside a valid decorator token.
 */
export interface LorebookDecoratorHoverToken {
  /** Raw token text including `@@`, e.g. `'@@recursive'`. */
  readonly rawToken: string;
  /** Normalized lookup key without `@@`, e.g. `'recursive'`. */
  readonly normalizedName: string;
  /** Start offset of the token within the input line/text. */
  readonly startOffset: number;
  /** End offset of the token (exclusive). */
  readonly endOffset: number;
}

// ── Completion context detection ──────────────────────────────────

/**
 * getLorebookDecoratorCompletionContext.
 * Detects whether the current line up to the cursor is a line-leading `@@`
 * decorator prefix suitable for triggering completion.
 *
 * Rules:
 * - Trigger only when the line up to cursor matches `^\s*@@([A-Za-z_][A-Za-z0-9_]*)?$`.
 * - Single `@` or prose like `foo @@rec` does not trigger.
 * - Returns `null` when there is no decorator completion context.
 *
 * @param lineText - Full text of the current line
 * @param cursorOffset - 0-based offset within the line where the cursor sits
 * @returns Completion context with prefix and offsets, or `null`
 */
export function getLorebookDecoratorCompletionContext(
  lineText: string,
  cursorOffset: number,
): LorebookDecoratorCompletionContext | null {
  // Clamp cursor to valid range
  const clamped = Math.max(0, Math.min(cursorOffset, lineText.length));
  const prefix = lineText.slice(0, clamped);

  // Match optional whitespace, @@, and optional identifier prefix up to cursor
  const match = /^\s*@@([A-Za-z_][A-Za-z0-9_]*)?$/.exec(prefix);
  if (!match) {
    return null;
  }

  // tokenStart is the offset of the first `@` in the line
  const leadingSpace = /^\s*/.exec(prefix);
  const tokenStart = leadingSpace ? leadingSpace[0].length : 0;

  return {
    prefix: match[1] ?? '',
    tokenStart,
    tokenEnd: clamped,
  };
}

// ── Hover token detection ───────────────────────────────────────

/**
 * getLorebookDecoratorHoverToken.
 * Detects a line-leading `@@` decorator token when the cursor falls inside it.
 *
 * Rules:
 * - Match `^\s*@@[A-Za-z_][A-Za-z0-9_]*` on the line.
 * - Cursor positions at token start, middle, and end boundary all resolve to the same token.
 * - `endOffset` in the returned value is the exclusive token end (suitable for replacement ranges).
 * - Returns `null` when the cursor is outside the token or no valid token exists.
 *
 * @param lineText - Full text of the line to inspect
 * @param cursorOffset - 0-based offset within the line where the cursor sits
 * @returns Hover token info with raw token, normalized name, and offsets, or `null`
 */
export function getLorebookDecoratorHoverToken(
  lineText: string,
  cursorOffset: number,
): LorebookDecoratorHoverToken | null {
  // Match a line-leading decorator token (only the token, not trailing args)
  const tokenMatch = /^\s*(@@[A-Za-z_][A-Za-z0-9_]*)/.exec(lineText);
  if (!tokenMatch) {
    return null;
  }

  const rawToken = tokenMatch[1];
  const startOffset = tokenMatch.index + (tokenMatch[0].length - rawToken.length);
  const endOffset = startOffset + rawToken.length;

  // Cursor must be within the token range [startOffset, endOffset]
  // The end boundary is inclusive so that hovering the last character
  // and the position immediately after it both resolve the same token.
  // Positions beyond endOffset (e.g. trailing whitespace) are rejected.
  if (cursorOffset < startOffset || cursorOffset > endOffset) {
    return null;
  }

  // Normalized name: strip @@ prefix, lower-case, trim
  const normalizedName = normalizeLorebookDecoratorName(rawToken);

  return {
    rawToken,
    normalizedName,
    startOffset,
    endOffset,
  };
}
