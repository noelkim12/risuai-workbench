/**
 * Lightweight Lua state API scanner for oversized `.risulua` files.
 * @file packages/cbs-lsp/src/utils/lua-state-access-scanner.ts
 */

import type { StateAccessOccurrence } from 'risu-workbench-core';

const STATE_API_DIRECTIONS = Object.freeze({
  getChatVar: 'read',
  getState: 'read',
  setChatVar: 'write',
  setState: 'write',
} satisfies Record<string, StateAccessOccurrence['direction']>);

type StateApiName = keyof typeof STATE_API_DIRECTIONS;

interface ParsedLuaArgument {
  kind: 'identifier' | 'other' | 'string';
  value: string | null;
  start: number;
  end: number;
}

interface ParsedStringLiteral {
  value: string;
  contentStart: number;
  contentEnd: number;
  end: number;
}

const STATE_API_NAMES = Object.keys(STATE_API_DIRECTIONS) as StateApiName[];

/**
 * scanLuaStateAccessOccurrences 함수.
 * oversized Lua에서 full parser 없이 정적 state API 문자열 key만 추출함.
 *
 * @param source - 원본 Lua source text
 * @returns 정적 state access occurrence 목록
 */
export function scanLuaStateAccessOccurrences(source: string): StateAccessOccurrence[] {
  const occurrences: StateAccessOccurrence[] = [];
  let index = 0;

  while (index < source.length) {
    const skippedIndex = skipLuaTrivia(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const apiName = matchStateApiName(source, index);
    if (!apiName) {
      index += 1;
      continue;
    }

    const parsedCall = parseStateApiCall(source, index, apiName);
    if (!parsedCall) {
      index += apiName.length;
      continue;
    }

    occurrences.push(parsedCall);
    index = Math.max(index + apiName.length, parsedCall.argEnd + 1);
  }

  return occurrences.sort(
    (left, right) => left.argStart - right.argStart || left.argEnd - right.argEnd || left.key.localeCompare(right.key),
  );
}

function matchStateApiName(source: string, index: number): StateApiName | null {
  const previous = index > 0 ? source[index - 1] : '';
  if (isLuaIdentifierPart(previous)) {
    return null;
  }

  for (const apiName of STATE_API_NAMES) {
    if (!source.startsWith(apiName, index)) {
      continue;
    }

    const next = source[index + apiName.length] ?? '';
    if (!isLuaIdentifierPart(next)) {
      return apiName;
    }
  }

  return null;
}

function parseStateApiCall(
  source: string,
  apiStart: number,
  apiName: StateApiName,
): StateAccessOccurrence | null {
  let cursor = skipWhitespace(source, apiStart + apiName.length);
  if (source[cursor] !== '(') {
    return null;
  }

  const args = parseTopLevelArguments(source, cursor + 1);
  if (!args) {
    return null;
  }

  const keyArgument = pickStateKeyArgument(apiName, args.arguments);
  if (!keyArgument || keyArgument.kind !== 'string' || !keyArgument.value) {
    return null;
  }

  return {
    key: keyArgument.value,
    direction: STATE_API_DIRECTIONS[apiName],
    apiName,
    containingFunction: '<top-level>',
    line: countLuaLine(source, apiStart),
    argStart: keyArgument.start,
    argEnd: keyArgument.end,
  };
}

function pickStateKeyArgument(
  apiName: StateApiName,
  args: readonly ParsedLuaArgument[],
): ParsedLuaArgument | null {
  const isRead = apiName === 'getState' || apiName === 'getChatVar';
  const first = args[0] ?? null;
  const second = args[1] ?? null;

  if (args.length === 1 && first?.kind === 'string') {
    return first;
  }

  if (args.length >= 2 && first?.kind === 'string') {
    return first;
  }

  if (args.length >= 2 && first?.kind === 'identifier' && second?.kind === 'string') {
    if (isRead && args.length === 2) {
      return second;
    }

    if (!isRead && args.length >= 3) {
      return second;
    }
  }

  return null;
}

function parseTopLevelArguments(
  source: string,
  start: number,
): { arguments: ParsedLuaArgument[]; end: number } | null {
  const args: ParsedLuaArgument[] = [];
  let cursor = start;
  let argumentStart = skipWhitespace(source, cursor);
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
      const end = trimTrailingWhitespace(source, argumentStart, cursor);
      if (end > argumentStart || args.length > 0) {
        args.push(parseArgument(source, argumentStart, end));
      }
      return { arguments: args, end: cursor + 1 };
    }

    if ((char === ')' || char === '}' || char === ']') && nestedDepth > 0) {
      nestedDepth -= 1;
      cursor += 1;
      continue;
    }

    if (char === ',' && nestedDepth === 0) {
      const end = trimTrailingWhitespace(source, argumentStart, cursor);
      args.push(parseArgument(source, argumentStart, end));
      cursor += 1;
      argumentStart = skipWhitespace(source, cursor);
      continue;
    }

    cursor += 1;
  }

  return null;
}

function parseArgument(source: string, start: number, end: number): ParsedLuaArgument {
  const stringLiteral = parseStringLiteral(source, start);
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

function parseStringLiteral(source: string, start: number): ParsedStringLiteral | null {
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

function skipLuaTrivia(source: string, index: number): number {
  const char = source[index];
  if (char === '"' || char === "'") {
    return skipQuotedString(source, index);
  }

  if (source.startsWith('--[[', index)) {
    const end = source.indexOf(']]', index + 4);
    return end === -1 ? source.length : end + 2;
  }

  if (source.startsWith('--', index)) {
    const end = source.indexOf('\n', index + 2);
    return end === -1 ? source.length : end + 1;
  }

  if (source.startsWith('[[', index)) {
    const end = source.indexOf(']]', index + 2);
    return end === -1 ? source.length : end + 2;
  }

  return index;
}

function skipQuotedString(source: string, start: number): number {
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

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function trimTrailingWhitespace(source: string, start: number, end: number): number {
  let cursor = end;
  while (cursor > start && /\s/u.test(source[cursor - 1] ?? '')) {
    cursor -= 1;
  }
  return cursor;
}

function countLuaLine(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

function isLuaIdentifierPart(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}
