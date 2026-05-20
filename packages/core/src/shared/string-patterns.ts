/**
 * 패키지 전반에서 재사용하는 정규식 및 문자열 패턴 escape helper 모음.
 * @file packages/core/src/shared/string-patterns.ts
 */

/**
 * escapeRegExp 함수.
 * literal 문자열을 RegExp pattern 안에서 안전하게 사용할 수 있게 escape함.
 * ASCII metacharacter 집합 `.*+?^${}()|[]\`를 모두 escape하며,
 * native `RegExp.escape()`와 출력이 다르므로 기존 동작을 유지함.
 *
 * @param value - 정규식 literal로 검색할 문자열
 * @returns RegExp metacharacter가 escape된 문자열
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
