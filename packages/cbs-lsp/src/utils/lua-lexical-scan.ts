/**
 * Low-level Lua lexical cursor helpers shared across CBS-LSP scanning and diagnostics.
 * @file packages/cbs-lsp/src/utils/lua-lexical-scan.ts
 */

/**
 * Parsed top-level Lua call argument.
 *
 * @property kind - argument classification: identifier, string literal, or other
 * @property value - decoded value for string/identifier, null for other
 * @property start - start offset of the argument value span
 * @property end - end offset (exclusive) of the argument value span
 */
export interface ParsedLuaArgument {
  kind: 'identifier' | 'other' | 'string';
  value: string | null;
  start: number;
  end: number;
}

/**
 * Parsed Lua quoted string literal.
 *
 * @property value - decoded string content (escape sequences resolved to single chars)
 * @property contentStart - offset of first character inside the quotes
 * @property contentEnd - offset of the closing quote
 * @property end - offset one past the closing quote
 */
export interface ParsedStringLiteral {
  value: string;
  contentStart: number;
  contentEnd: number;
  end: number;
}

/**
 * Result of parsing comma-separated top-level arguments inside parentheses.
 *
 * @property arguments - parsed argument list
 * @property closeParen - offset of the closing ')'
 */
export interface ParsedTopLevelArguments {
  arguments: ParsedLuaArgument[];
  closeParen: number;
}

/**
 * skipLuaQuotedString.
 * Advances past a single- or double-quoted Lua string starting at `start`.
 *
 * @param source - full source text
 * @param start - offset of the opening quote character
 * @returns offset one past the closing quote, or `source.length` if unterminated
 */
export function skipLuaQuotedString(source: string, start: number): number {
  const quote = source[start];
  let cursor = start + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }

    if (char === quote) {
      return cursor + 1;
    }

    cursor += 1;
  }

  return source.length;
}

/**
 * skipLuaCommentOrLongString.
 * If `index` starts a Lua comment (`--`, `--[=[...]=]`) or a plain long string
 * (`[[...]]`, `[=[...]=]`), returns the offset past its closing delimiter.
 * Returns `index` unchanged otherwise.
 *
 * @param source - full source text
 * @param index - candidate offset
 * @returns offset past the skipped construct, or `index` if nothing to skip
 */
export function skipLuaCommentOrLongString(source: string, index: number): number {
  if (source.startsWith('--', index)) {
    const longBracketOpen = skipLuaLongBracket(source, index + 2);
    if (longBracketOpen !== index + 2) {
      return longBracketOpen;
    }

    const end = source.indexOf('\n', index + 2);
    return end === -1 ? source.length : end + 1;
  }

  if (source.startsWith('[', index)) {
    return skipLuaLongBracket(source, index);
  }

  return index;
}

/**
 * skipLuaTrivia.
 * Skips past a Lua quoted string, comment, or long bracket construct at `index`.
 * Returns `index` unchanged when the character at `index` is not the start of
 * any such construct.
 *
 * @param source - full source text
 * @param index - candidate offset
 * @returns offset past the skipped trivia, or `index` if nothing to skip
 */
export function skipLuaTrivia(source: string, index: number): number {
  const char = source[index];
  if (char === '"' || char === "'") {
    return skipLuaQuotedString(source, index);
  }

  return skipLuaCommentOrLongString(source, index);
}

/**
 * skipLuaWhitespace.
 * Advances past any whitespace characters starting at `start`.
 *
 * @param source - full source text
 * @param start - offset to start scanning from
 * @returns offset of the first non-whitespace character at or after `start`
 */
export function skipLuaWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

/**
 * trimLuaTrailingWhitespace.
 * Trims trailing whitespace from the half-open interval `[start, end)`.
 *
 * @param source - full source text
 * @param start - lower bound (not trimmed into)
 * @param end - initial exclusive upper bound
 * @returns adjusted exclusive upper bound with trailing whitespace removed
 */
export function trimLuaTrailingWhitespace(source: string, start: number, end: number): number {
  let cursor = end;
  while (cursor > start && /\s/u.test(source[cursor - 1] ?? '')) {
    cursor -= 1;
  }
  return cursor;
}

/**
 * isLuaIdentifierPart.
 * Tests whether `value` is a single Lua identifier character (alnum or underscore).
 *
 * @param value - single character to test, may be undefined at string boundaries
 * @returns true when the character is a valid Lua identifier continuation
 */
export function isLuaIdentifierPart(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}

/**
 * parseLuaStringLiteral.
 * Parses a single- or double-quoted Lua string literal starting at `start`.
 * Returns null when `source[start]` is not a quote or the string is unterminated.
 *
 * @param source - full source text
 * @param start - offset of the opening quote character
 * @returns parsed literal or null
 */
export function parseLuaStringLiteral(source: string, start: number): ParsedStringLiteral | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let cursor = start + 1;
  let value = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      const next = source[cursor + 1];
      if (next === undefined) {
        return null;
      }
      value += next;
      cursor += 2;
      continue;
    }

    if (char === quote) {
      return {
        value,
        contentStart: start + 1,
        contentEnd: cursor,
        end: cursor + 1,
      };
    }

    value += char;
    cursor += 1;
  }

  return null;
}

/**
 * parseLuaArgument.
 * Classifies a single Lua argument span as identifier, string literal, or other.
 *
 * @param source - full source text
 * @param start - argument span start offset
 * @param end - argument span end offset (exclusive)
 * @returns classified argument
 */
export function parseLuaArgument(source: string, start: number, end: number): ParsedLuaArgument {
  const stringLiteral = parseLuaStringLiteral(source, start);
  if (stringLiteral && stringLiteral.end === end) {
    return {
      kind: 'string',
      value: stringLiteral.value,
      start: stringLiteral.contentStart,
      end: stringLiteral.contentEnd,
    };
  }

  const raw = source.slice(start, end);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(raw)) {
    return { kind: 'identifier', value: raw, start, end };
  }

  return { kind: 'other', value: null, start, end };
}

/**
 * parseLuaTopLevelArguments.
 * Parses comma-separated arguments between `start` (after '(') and the matching ')'.
 * Handles nested brackets and skips strings/comments.
 * Returns null when the closing ')' is not found.
 *
 * @param source - full source text
 * @param start - offset just after the opening '('
 * @returns parsed arguments with close-paren offset, or null
 */
export function parseLuaTopLevelArguments(
  source: string,
  start: number,
): ParsedTopLevelArguments | null {
  const args: ParsedLuaArgument[] = [];
  let cursor = start;
  let argumentStart = skipLuaWhitespace(source, cursor);
  let nestedDepth = 0;

  while (cursor < source.length) {
    const skippedIndex = skipLuaTrivia(source, cursor);
    if (skippedIndex !== cursor) {
      cursor = skippedIndex;
      continue;
    }

    const char = source[cursor];
    if (char === '(' || char === '{' || char === '[') {
      nestedDepth += 1;
      cursor += 1;
      continue;
    }

    if (char === ')' && nestedDepth === 0) {
      const end = trimLuaTrailingWhitespace(source, argumentStart, cursor);
      if (end > argumentStart || args.length > 0) {
        args.push(parseLuaArgument(source, argumentStart, end));
      }
      return { arguments: args, closeParen: cursor };
    }

    if ((char === ')' || char === '}' || char === ']') && nestedDepth > 0) {
      nestedDepth -= 1;
      cursor += 1;
      continue;
    }

    if (char === ',' && nestedDepth === 0) {
      const end = trimLuaTrailingWhitespace(source, argumentStart, cursor);
      args.push(parseLuaArgument(source, argumentStart, end));
      cursor += 1;
      argumentStart = skipLuaWhitespace(source, cursor);
      continue;
    }

    cursor += 1;
  }

  return null;
}

/**
 * countLuaLine.
 * Returns the 1-based line number at `offset` in `source`.
 *
 * @param source - full source text
 * @param offset - byte offset to query
 * @returns 1-based line number
 */
export function countLuaLine(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

/**
 * skipLuaLongBracket.
 * If `index` starts a Lua long bracket (`[[`, `[=[`, `]=]`, etc.),
 * skips to the end of the matching closing bracket.
 * Returns `index` unchanged if no long bracket opens here.
 *
 * @param source - full source text
 * @param index - candidate offset for opening bracket
 * @returns offset past the closing bracket, or `index` if not a long bracket
 */
export function skipLuaLongBracket(source: string, index: number): number {
  if (source[index] !== '[') {
    return index;
  }

  let equalsCount = 0;
  let probe = index + 1;
  while (probe < source.length && source[probe] === '=') {
    equalsCount += 1;
    probe += 1;
  }

  if (probe >= source.length || source[probe] !== '[') {
    return index;
  }

  const closeDelimiter = ']' + '='.repeat(equalsCount) + ']';
  const searchStart = probe + 1;
  const end = source.indexOf(closeDelimiter, searchStart);
  return end === -1 ? source.length : end + closeDelimiter.length;
}
