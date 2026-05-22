/**
 * Tests for lua-lexical-scan shared cursor helpers.
 * @file packages/cbs-lsp/tests/utils/lua-lexical-scan.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  countLuaLine,
  isLuaIdentifierPart,
  parseLuaArgument,
  parseLuaStringLiteral,
  parseLuaTopLevelArguments,
  skipLuaCommentOrLongString,
  skipLuaLongBracket,
  skipLuaQuotedString,
  skipLuaTrivia,
  skipLuaWhitespace,
  trimLuaTrailingWhitespace,
} from '../../src/utils/lua-lexical-scan';

// ---------------------------------------------------------------------------
// skipLuaQuotedString
// ---------------------------------------------------------------------------

describe('skipLuaQuotedString', () => {
  it('skips a double-quoted string', () => {
    expect(skipLuaQuotedString('"hello"', 0)).toBe(7);
  });

  it('skips a single-quoted string', () => {
    expect(skipLuaQuotedString("'hello'", 0)).toBe(7);
  });

  it('handles escape sequences', () => {
    expect(skipLuaQuotedString('"he\\"llo"', 0)).toBe(9);
  });

  it('handles unterminated string', () => {
    expect(skipLuaQuotedString('"hello', 0)).toBe(6);
  });

  it('skips from the middle of source', () => {
    const source = 'x = "hello" + 1';
    expect(skipLuaQuotedString(source, 4)).toBe(11);
  });

  it('handles empty string', () => {
    expect(skipLuaQuotedString('""', 0)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// skipLuaCommentOrLongString
// ---------------------------------------------------------------------------

describe('skipLuaCommentOrLongString', () => {
  it('skips single-line comment', () => {
    const source = '-- comment\ncode';
    expect(skipLuaCommentOrLongString(source, 0)).toBe(11);
  });

  it('skips single-line comment at end of file (no newline)', () => {
    const source = 'code\n-- comment';
    expect(skipLuaCommentOrLongString(source, 5)).toBe(source.length);
  });

  it('skips block comment --[[...]]', () => {
    const source = '--[[block comment]]code';
    expect(skipLuaCommentOrLongString(source, 0)).toBe(19);
  });

  it('skips plain long string [[...]]', () => {
    const source = '[[long string]]code';
    expect(skipLuaCommentOrLongString(source, 0)).toBe(15);
  });

  it('returns index unchanged for non-comment non-bracket', () => {
    expect(skipLuaCommentOrLongString('code', 0)).toBe(0);
  });

  it('skips block comment with equals --[=[...]=]', () => {
    const source = '--[=[block comment]=]code';
    expect(skipLuaCommentOrLongString(source, 0)).toBe(21);
  });

  it('skips long bracket with equals [==[...]==]', () => {
    const source = '[==[long string]==]code';
    expect(skipLuaCommentOrLongString(source, 0)).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// skipLuaLongBracket
// ---------------------------------------------------------------------------

describe('skipLuaLongBracket', () => {
  it('skips basic [[...]]', () => {
    expect(skipLuaLongBracket('[[hello]]rest', 0)).toBe(9);
  });

  it('skips [=[...]=]', () => {
    expect(skipLuaLongBracket('[=[hello]=]rest', 0)).toBe(11);
  });

  it('skips [==[...]==]', () => {
    expect(skipLuaLongBracket('[==[hello]==]rest', 0)).toBe(13);
  });

  it('returns index when no bracket opens', () => {
    expect(skipLuaLongBracket('code', 0)).toBe(0);
  });

  it('returns index for single [ without opening bracket', () => {
    expect(skipLuaLongBracket('[1', 0)).toBe(0);
  });

  it('handles unterminated long bracket', () => {
    expect(skipLuaLongBracket('[[hello', 0)).toBe(7);
  });

  it('requires matching equals count in close delimiter', () => {
    const source = '[=[hello]]rest';
    expect(skipLuaLongBracket(source, 0)).toBe(source.length);
  });
});

// ---------------------------------------------------------------------------
// skipLuaTrivia
// ---------------------------------------------------------------------------

describe('skipLuaTrivia', () => {
  it('skips double-quoted string', () => {
    expect(skipLuaTrivia('"hello"code', 0)).toBe(7);
  });

  it('skips single-quoted string', () => {
    expect(skipLuaTrivia("'hello'code", 0)).toBe(7);
  });

  it('skips block comment', () => {
    expect(skipLuaTrivia('--[[comment]]code', 0)).toBe(13);
  });

  it('skips line comment', () => {
    const source = '-- comment\ncode';
    expect(skipLuaTrivia(source, 0)).toBe(11);
  });

  it('skips long string', () => {
    expect(skipLuaTrivia('[[string]]code', 0)).toBe(10);
  });

  it('returns index for regular code', () => {
    expect(skipLuaTrivia('code', 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// skipLuaWhitespace
// ---------------------------------------------------------------------------

describe('skipLuaWhitespace', () => {
  it('skips spaces and tabs', () => {
    expect(skipLuaWhitespace('  \tcode', 0)).toBe(3);
  });

  it('skips newlines', () => {
    expect(skipLuaWhitespace('\n\ncode', 0)).toBe(2);
  });

  it('returns start when no whitespace', () => {
    expect(skipLuaWhitespace('code', 0)).toBe(0);
  });

  it('handles end of string', () => {
    expect(skipLuaWhitespace('  ', 0)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// trimLuaTrailingWhitespace
// ---------------------------------------------------------------------------

describe('trimLuaTrailingWhitespace', () => {
  it('trims trailing spaces', () => {
    expect(trimLuaTrailingWhitespace('arg  ', 0, 5)).toBe(3);
  });

  it('does not trim into start', () => {
    expect(trimLuaTrailingWhitespace('  ', 0, 2)).toBe(0);
  });

  it('returns end when no trailing whitespace', () => {
    expect(trimLuaTrailingWhitespace('arg', 0, 3)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// isLuaIdentifierPart
// ---------------------------------------------------------------------------

describe('isLuaIdentifierPart', () => {
  it('returns true for letters', () => {
    expect(isLuaIdentifierPart('a')).toBe(true);
    expect(isLuaIdentifierPart('Z')).toBe(true);
  });

  it('returns true for digits', () => {
    expect(isLuaIdentifierPart('5')).toBe(true);
  });

  it('returns true for underscore', () => {
    expect(isLuaIdentifierPart('_')).toBe(true);
  });

  it('returns false for punctuation', () => {
    expect(isLuaIdentifierPart('.')).toBe(false);
    expect(isLuaIdentifierPart('-')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLuaIdentifierPart(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLuaIdentifierPart('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseLuaStringLiteral
// ---------------------------------------------------------------------------

describe('parseLuaStringLiteral', () => {
  it('parses double-quoted string', () => {
    const result = parseLuaStringLiteral('"hello"', 0);
    expect(result).toEqual({
      value: 'hello',
      contentStart: 1,
      contentEnd: 6,
      end: 7,
    });
  });

  it('parses single-quoted string', () => {
    const result = parseLuaStringLiteral("'hello'", 0);
    expect(result).toEqual({
      value: 'hello',
      contentStart: 1,
      contentEnd: 6,
      end: 7,
    });
  });

  it('parses string with escape sequences', () => {
    const result = parseLuaStringLiteral('"he\\"llo"', 0);
    expect(result?.value).toBe('he"llo');
    expect(result?.end).toBe(9);
  });

  it('parses empty string', () => {
    const result = parseLuaStringLiteral('""', 0);
    expect(result).toEqual({
      value: '',
      contentStart: 1,
      contentEnd: 1,
      end: 2,
    });
  });

  it('returns null for non-quote', () => {
    expect(parseLuaStringLiteral('hello', 0)).toBeNull();
  });

  it('returns null for unterminated string', () => {
    expect(parseLuaStringLiteral('"hello', 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseLuaArgument
// ---------------------------------------------------------------------------

describe('parseLuaArgument', () => {
  it('parses string argument', () => {
    const result = parseLuaArgument('"hello"', 0, 7);
    expect(result.kind).toBe('string');
    expect(result.value).toBe('hello');
  });

  it('parses identifier argument', () => {
    const result = parseLuaArgument('myVar', 0, 5);
    expect(result.kind).toBe('identifier');
    expect(result.value).toBe('myVar');
  });

  it('parses other argument', () => {
    const result = parseLuaArgument('1 + 2', 0, 5);
    expect(result.kind).toBe('other');
    expect(result.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseLuaTopLevelArguments
// ---------------------------------------------------------------------------

describe('parseLuaTopLevelArguments', () => {
  it('parses single string argument', () => {
    const source = '"hello")';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments).toHaveLength(1);
    expect(result!.arguments[0]!.kind).toBe('string');
    expect(result!.arguments[0]!.value).toBe('hello');
    expect(result!.closeParen).toBe(7);
  });

  it('parses multiple arguments', () => {
    const source = '"key", "value")';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments).toHaveLength(2);
    expect(result!.arguments[0]!.value).toBe('key');
    expect(result!.arguments[1]!.value).toBe('value');
  });

  it('handles whitespace around arguments', () => {
    const source = '  "key" ,  "value"  )';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments).toHaveLength(2);
  });

  it('returns null when closing paren is missing', () => {
    const source = '"hello"';
    expect(parseLuaTopLevelArguments(source, 0)).toBeNull();
  });

  it('handles nested parentheses', () => {
    const source = 'f(), "value")';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments).toHaveLength(2);
  });

  it('handles comments inside arguments', () => {
    const source = '"key" --[[comment]], "value")';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments).toHaveLength(2);
  });

  it('handles strings inside arguments that are not comments', () => {
    const source = '"hello")';
    const result = parseLuaTopLevelArguments(source, 0);
    expect(result).not.toBeNull();
    expect(result!.arguments[0]!.kind).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// countLuaLine (1-based)
// ---------------------------------------------------------------------------

describe('countLuaLine', () => {
  it('returns 1 for offset 0', () => {
    expect(countLuaLine('hello', 0)).toBe(1);
  });

  it('counts newlines before offset', () => {
    expect(countLuaLine('line1\nline2\nline3', 6)).toBe(2);
    expect(countLuaLine('line1\nline2\nline3', 12)).toBe(3);
  });

  it('returns 1 for single-line source', () => {
    expect(countLuaLine('hello world', 5)).toBe(1);
  });

  it('handles offset at newline character', () => {
    expect(countLuaLine('a\nb', 1)).toBe(1);
    expect(countLuaLine('a\nb', 2)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Integration: state API scanning still works via shared helpers
// ---------------------------------------------------------------------------

describe('integration: shared helpers preserve state scanner behavior', () => {
  it('skipLuaTrivia + parseLuaTopLevelArguments finds getState key', () => {
    const source = 'getState("hp")';
    // 'getState' is 8 chars, '(' at index 8, arguments start at 9
    const parsed = parseLuaTopLevelArguments(source, 9);
    expect(parsed).not.toBeNull();
    expect(parsed!.arguments[0]!.kind).toBe('string');
    expect(parsed!.arguments[0]!.value).toBe('hp');
  });

  it('skipLuaTrivia skips a string that looks like API calls', () => {
    const source = '"getState("';
    const skipped = skipLuaTrivia(source, 0);
    expect(skipped).toBe(source.length);
  });

  it('skipLuaTrivia skips comments hiding API calls', () => {
    const source = '-- getState("hp")\ngetState("mp")';
    const afterComment = skipLuaTrivia(source, 0);
    expect(afterComment).toBe(18);
  });
});
