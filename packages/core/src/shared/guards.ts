/**
 * Core 전반에서 공통으로 쓰는 plain-record type guard 모음.
 * CLI 계층 의존성을 갖지 않는 pure helper임.
 * @file packages/core/src/shared/guards.ts
 */

/**
 * isPlainRecord 함수.
 * unknown 값이 null이 아닌 plain object이고 배열이 아닌지 확인함.
 * 프로토타입 검사 없이 typeof/identity만으로 빠르게 좁히는 기본 guard임.
 *
 * @param value - record로 안전하게 다룰 수 있는지 확인할 unknown 값
 * @returns non-null object이고 array가 아니면 true
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * isStrictPlainRecord 함수.
 * isPlainRecord에 prototype 검사를 더해 Object.prototype을 상속하거나
 * null-prototype인 객체만 허용함. 신뢰할 수 없는 외부 입력에서
 * 예기치 않은 클래스 인스턴스를 걸러낼 때 사용함.
 *
 * @param value - 엄격한 plain record 여부를 확인할 unknown 값
 * @returns Object.prototype 또는 null prototype의 plain record이면 true
 */
export function isStrictPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
