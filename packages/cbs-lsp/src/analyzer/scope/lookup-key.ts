/**
 * scope analyzer lookup key 정규화 유틸.
 * @file packages/cbs-lsp/src/analyzer/scope/lookup-key.ts
 */

/**
 * normalizeLookupKey 함수.
 * macro 이름 비교를 위해 대소문자와 구분 문자를 제거한 lookup key를 만듦.
 *
 * @param value - 정규화할 원본 macro 이름
 * @returns 비교용 normalized lookup key
 */
export function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}
