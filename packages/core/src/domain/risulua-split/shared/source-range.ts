/**
 * RisuLua split planner에서 공용으로 쓰는 source range 생성 helper 모음.
 * @file packages/core/src/domain/risulua-split/shared/source-range.ts
 */

import { buildLineStarts, totalLineCount } from './range-utils';
import type { LuaSourceRange } from './types';

/**
 * wholeSourceRange 함수.
 * 전체 source를 가리키는 Lua source range를 생성함.
 *
 * @param source - range로 표현할 원본 RisuLua source text
 * @returns source 전체를 덮는 1-based line / 0-based offset range
 */
export function wholeSourceRange(source: string): LuaSourceRange {
  const lineStarts = buildLineStarts(source);
  return { startLine: 1, endLine: totalLineCount(lineStarts), startOffset: 0, endOffset: source.length };
}

/**
 * lineOnlyRange 함수.
 * line number만 알려진 diagnostic에 사용할 빈 offset range를 생성함.
 *
 * @param line - 표시할 1-based source line number
 * @returns 해당 line만 가리키는 zero-width source range
 */
export function lineOnlyRange(line: number): LuaSourceRange {
  return { startLine: line, endLine: line, startOffset: 0, endOffset: 0 };
}
