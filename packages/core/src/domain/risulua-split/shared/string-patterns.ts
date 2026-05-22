/**
 * RisuLua split planner에서 정규식 기반 문자열 탐색에 쓰는 helper 모음.
 * @file packages/core/src/domain/risulua-split/shared/string-patterns.ts
 */

import { escapeRegExp as escapeRegExpImpl } from '../../../shared/string-patterns';

// Re-export shared escapeRegExp for backward compatibility with existing imports.
export { escapeRegExpImpl as escapeRegExp };

/**
 * collectPresent 함수.
 * source 안에 word boundary로 실제 등장하는 후보 이름만 수집함.
 *
 * @param source - 후보 이름을 찾을 RisuLua source text
 * @param names - source에서 존재 여부를 검사할 후보 이름 목록
 * @returns source에 등장한 후보 이름 목록
 */
export function collectPresent(source: string, names: string[]): string[] {
  return names.filter((name) => new RegExp(`\\b${escapeRegExpImpl(name)}\\b`).test(source));
}
