/**
 * Runtime profile validation에서 공유하는 primitive guard 모음.
 * @file packages/core/src/domain/editor/runtime-profile/guards.ts
 */

/**
 * isRecord 함수.
 * 외부 입력이 array가 아닌 plain object 또는 null-prototype object인지 확인합니다.
 *
 * @param value - record guard의 기준점으로 삼을 unknown 값입니다.
 * @returns plain record로 key 접근이 안전하면 true입니다.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * isStringRecord 함수.
 * variable map처럼 모든 값이 문자열이어야 하는 plain record를 검증합니다.
 *
 * @param value - 문자열 map으로 안전하게 사용할 수 있는지 확인할 값입니다.
 * @returns plain record이고 모든 값이 문자열이면 true입니다.
 */
export function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * isBooleanRecord 함수.
 * toggle override처럼 모든 값이 boolean이어야 하는 plain record를 검증합니다.
 *
 * @param value - boolean map으로 안전하게 사용할 수 있는지 확인할 값입니다.
 * @returns plain record이고 모든 값이 boolean이면 true입니다.
 */
export function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

/**
 * isStringArray 함수.
 * HTML context URI 목록처럼 문자열 배열만 허용되는 값을 검증합니다.
 *
 * @param value - 문자열 배열로 사용할 수 있는지 확인할 값입니다.
 * @returns 배열이고 모든 항목이 문자열이면 true입니다.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
