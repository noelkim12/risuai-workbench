import { describe, expect, it } from 'vitest';

import {
  getLorebookDecoratorCompletionContext,
  getLorebookDecoratorHoverToken,
} from '../../../../src/domain/lorebook/decorators';

describe('LorebookDecoratorContext', () => {
  // ── getLorebookDecoratorCompletionContext ───────────────────────

  describe('getLorebookDecoratorCompletionContext', () => {
    it('returns null for single @', () => {
      expect(getLorebookDecoratorCompletionContext('@', 1)).toBeNull();
      expect(getLorebookDecoratorCompletionContext('  @', 3)).toBeNull();
    });

    it('returns null for prose containing inline @', () => {
      expect(getLorebookDecoratorCompletionContext('foo @bar', 8)).toBeNull();
      expect(getLorebookDecoratorCompletionContext('hello @', 7)).toBeNull();
    });

    it('returns null when @@ is not line-leading', () => {
      expect(getLorebookDecoratorCompletionContext('foo @@rec', 10)).toBeNull();
      expect(getLorebookDecoratorCompletionContext('text @@depth', 13)).toBeNull();
    });

    it('returns context with empty prefix for bare @@', () => {
      const ctx = getLorebookDecoratorCompletionContext('@@', 2);
      expect(ctx).not.toBeNull();
      expect(ctx!.prefix).toBe('');
      expect(ctx!.tokenStart).toBe(0);
      expect(ctx!.tokenEnd).toBe(2);
    });

    it('returns context with prefix for @@rec', () => {
      const ctx = getLorebookDecoratorCompletionContext('@@rec', 5);
      expect(ctx).not.toBeNull();
      expect(ctx!.prefix).toBe('rec');
      expect(ctx!.tokenStart).toBe(0);
      expect(ctx!.tokenEnd).toBe(5);
    });

    it('returns context with prefix and correct offsets for indented @@rec', () => {
      const ctx = getLorebookDecoratorCompletionContext('  @@rec', 7);
      expect(ctx).not.toBeNull();
      expect(ctx!.prefix).toBe('rec');
      expect(ctx!.tokenStart).toBe(2);
      expect(ctx!.tokenEnd).toBe(7);
    });

    it('returns context with prefix for @@depth at various cursor positions', () => {
      // Cursor at end
      const endCtx = getLorebookDecoratorCompletionContext('@@depth', 7);
      expect(endCtx).not.toBeNull();
      expect(endCtx!.prefix).toBe('depth');

      // Cursor in the middle (after @@de)
      const midCtx = getLorebookDecoratorCompletionContext('@@depth', 4);
      expect(midCtx).not.toBeNull();
      expect(midCtx!.prefix).toBe('de');
    });

    it('returns null when cursor is before @@ on the line', () => {
      // If cursor is at position 0 or 1 on `@@foo`, we're still within the trigger
      // This test verifies we only match when cursor is at/after the @@ prefix
      const ctx = getLorebookDecoratorCompletionContext('@@foo', 0);
      expect(ctx).toBeNull();
    });

    it('returns null for cursor before the second @', () => {
      // At position 1 we have only typed '@', not '@@'
      expect(getLorebookDecoratorCompletionContext('@@foo', 1)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getLorebookDecoratorCompletionContext('', 0)).toBeNull();
    });

    it('returns null when line has trailing text after decorator prefix', () => {
      // @@foo bar — cursor at position 7 (after 'foo') but line continues
      // In completion context, we usually care about cursor position being at end
      // But if cursor is in the middle of the line after text, it's not a completion context
      expect(getLorebookDecoratorCompletionContext('@@foo bar', 7)).toBeNull();
    });

    it('returns context when cursor is at end of partial decorator with no trailing text', () => {
      // This is the standard completion case: user typed @@foo and cursor is at end
      const ctx = getLorebookDecoratorCompletionContext('@@foo', 5);
      expect(ctx).not.toBeNull();
      expect(ctx!.prefix).toBe('foo');
    });
  });

  // ── getLorebookDecoratorHoverToken ──────────────────────────────

  describe('getLorebookDecoratorHoverToken', () => {
    it('returns null when line has no line-leading @@ token', () => {
      expect(getLorebookDecoratorHoverToken('foo @@rec', 5)).toBeNull();
      expect(getLorebookDecoratorHoverToken('hello world', 5)).toBeNull();
    });

    it('returns null for single @', () => {
      expect(getLorebookDecoratorHoverToken('@foo', 1)).toBeNull();
    });

    it('returns null when cursor is before the @@ token', () => {
      expect(getLorebookDecoratorHoverToken('  @@recursive', 0)).toBeNull();
      expect(getLorebookDecoratorHoverToken('  @@recursive', 1)).toBeNull();
    });

    it('returns null when cursor is after the token and trailing space', () => {
      // @@recursive length=11, position 12 is in trailing space
      expect(getLorebookDecoratorHoverToken('@@recursive ', 12)).toBeNull();
      // Way past end
      expect(getLorebookDecoratorHoverToken('@@recursive', 15)).toBeNull();
    });

    it('resolves token when cursor is exactly at endOffset (last char boundary)', () => {
      // @@recursive length=11, endOffset=11
      const token = getLorebookDecoratorHoverToken('@@recursive', 11);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@recursive');
      expect(token!.normalizedName).toBe('recursive');
      expect(token!.startOffset).toBe(0);
      expect(token!.endOffset).toBe(11);
    });

    it('detects token when cursor is at token start', () => {
      const token = getLorebookDecoratorHoverToken('@@recursive', 0);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@recursive');
      expect(token!.normalizedName).toBe('recursive');
      expect(token!.startOffset).toBe(0);
      expect(token!.endOffset).toBe(11);
    });

    it('detects token when cursor is in the middle of the token', () => {
      const token = getLorebookDecoratorHoverToken('@@recursive', 5);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@recursive');
      expect(token!.normalizedName).toBe('recursive');
    });

    it('detects token when cursor is at token end (last character)', () => {
      // Cursor at the last 'e' (position 10, 0-indexed)
      const token = getLorebookDecoratorHoverToken('@@recursive', 10);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@recursive');
    });

    it('detects token with leading whitespace and correct offsets', () => {
      const token = getLorebookDecoratorHoverToken('  @@depth', 6);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@depth');
      expect(token!.normalizedName).toBe('depth');
      expect(token!.startOffset).toBe(2);
      expect(token!.endOffset).toBe(9);
    });

    it('detects token with argument-like trailing text but cursor is within token', () => {
      // @@depth 5 — cursor at position 6 (within 'depth' part)
      const token = getLorebookDecoratorHoverToken('@@depth 5', 6);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@depth');
      expect(token!.endOffset).toBe(7);
    });

    it('does not include trailing arguments in rawToken', () => {
      const token = getLorebookDecoratorHoverToken('@@depth 5', 3);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@depth');
      expect(token!.endOffset).toBe(7); // end right after 'depth', before space
    });

    it('identifies unknown decorator tokens like @@made_up', () => {
      const token = getLorebookDecoratorHoverToken('@@made_up', 3);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@made_up');
      expect(token!.normalizedName).toBe('made_up');
    });

    it('returns null for @@ followed by invalid identifier characters', () => {
      expect(getLorebookDecoratorHoverToken('@@123abc', 3)).toBeNull();
      expect(getLorebookDecoratorHoverToken('@@-foo', 3)).toBeNull();
    });

    it('handles underscore in decorator names', () => {
      const token = getLorebookDecoratorHoverToken('@@no_recursive_search', 5);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@no_recursive_search');
      expect(token!.normalizedName).toBe('no_recursive_search');
    });

    it('normalizes uppercase decorator tokens for lookup', () => {
      const token = getLorebookDecoratorHoverToken('@@Recursive', 3);
      expect(token).not.toBeNull();
      expect(token!.rawToken).toBe('@@Recursive');
      expect(token!.normalizedName).toBe('recursive');
    });

    it('returns null when cursor is in whitespace between @@ and identifier', () => {
      // @@ foo is not valid decorator syntax (no space between @@ and name)
      expect(getLorebookDecoratorHoverToken('@@ foo', 3)).toBeNull();
    });
  });
});
