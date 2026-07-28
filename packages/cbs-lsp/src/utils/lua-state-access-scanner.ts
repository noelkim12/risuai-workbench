/**
 * Lightweight Lua state API scanner for oversized `.risulua` files.
 * @file packages/cbs-lsp/src/utils/lua-state-access-scanner.ts
 */

import type { StateAccessOccurrence } from '@risuai-workbench/core';

import {
  type ParsedLuaArgument,
  countLuaLine,
  isLuaIdentifierPart,
  parseLuaTopLevelArguments,
  skipLuaTrivia,
  skipLuaWhitespace,
} from './lua-lexical-scan';

const STATE_API_DIRECTIONS = Object.freeze({
  getChatVar: 'read',
  getState: 'read',
  setChatVar: 'write',
  setState: 'write',
} satisfies Record<string, StateAccessOccurrence['direction']>);

type StateApiName = keyof typeof STATE_API_DIRECTIONS;

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
    (left, right) =>
      left.argStart - right.argStart ||
      left.argEnd - right.argEnd ||
      left.key.localeCompare(right.key),
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
  const cursor = skipLuaWhitespace(source, apiStart + apiName.length);
  if (source[cursor] !== '(') {
    return null;
  }

  const parsed = parseLuaTopLevelArguments(source, cursor + 1);
  if (!parsed) {
    return null;
  }

  const keyArgument = pickStateKeyArgument(apiName, parsed.arguments);
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
