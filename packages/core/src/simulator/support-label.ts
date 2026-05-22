/**
 * Support classification label and boolean output helpers.
 * Tiny pure utilities for formatting diagnostic messages
 * and converting boolean values to CBS output convention.
 * @file packages/core/src/domain/cbs/simulator/support-label.ts
 */

/**
 * booleanString 함수.
 * CBS boolean output convention으로 변환함.
 *
 * @param value - truthy 여부
 * @returns `1` 또는 `0`
 */
export function booleanString(value: boolean): string {
  return value ? '1' : '0';
}

/**
 * formatSupportClassLabel 함수.
 * Support class를 diagnostic 문장용 라벨로 바꿈.
 *
 * @param supportClass - classification support class
 * @returns human-readable support class label
 */
export function formatSupportClassLabel(supportClass: string): string {
  return supportClass.charAt(0).toLocaleUpperCase() + supportClass.slice(1);
}
