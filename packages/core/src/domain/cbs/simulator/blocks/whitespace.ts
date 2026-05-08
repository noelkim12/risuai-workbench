/**
 * Whitespace trimming and brace escaping helpers for CBS block evaluators.
 * Pure functions with no state dependency.
 * @file packages/core/src/domain/cbs/simulator/blocks/whitespace.ts
 */

/**
 * trimLines 함수.
 * upstream legacy block whitespace trimming을 적용함.
 *
 * @param value - trimming할 문자열
 * @returns whitespace가 정리된 문자열
 */
export function trimLines(value: string): string {
  if (!value.includes('\n')) return value.trimEnd();
  return value.split('\n').map((line) => line.trimStart()).join('\n').trim();
}

/**
 * trimBlankEdgeLines 함수.
 * #when 기본 mode의 edge blank line만 제거함.
 *
 * @param value - trimming할 문자열
 * @returns 앞뒤 빈 줄이 제거된 문자열
 */
export function trimBlankEdgeLines(value: string): string {
  const lines = value.split('\n');
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.join('\n');
}

/**
 * trimOuterWhitespace 함수.
 * pure block end matcher의 p1.trim()에 해당함.
 *
 * @param value - trimming할 문자열
 * @returns 양끝 whitespace가 제거된 문자열
 */
export function trimOuterWhitespace(value: string): string {
  return value.trim();
}
