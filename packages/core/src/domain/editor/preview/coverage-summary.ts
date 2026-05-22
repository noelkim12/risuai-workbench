/**
 * Preview coverage summary를 문자열로 포맷하는 공통 helper.
 * @file packages/core/src/domain/editor/preview/coverage-summary.ts
 */

/**
 * formatCoverageSummary 함수.
 * CBS simulation coverage를 UI가 표시할 요약 문자열로 변환합니다.
 *
 * @param totalMacros - CBS evaluator가 만난 전체 macro 수
 * @param unknownCount - evaluator가 분류하지 못한 unknown macro 수
 * @returns coverage summary 문자열
 */
export function formatCoverageSummary(totalMacros: number, unknownCount: number): string {
  return `${totalMacros} macros, ${unknownCount} unknown`;
}
