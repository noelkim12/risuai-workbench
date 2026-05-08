/**
 * Pure JSON and value helpers for the CBS simulator.
 * Safe parsing, stringification, and property-check utilities
 * used across macro evaluation and variable access.
 * @file packages/core/src/domain/cbs/simulator/values.ts
 */

/**
 * parseJsonArray 함수.
 * JSON array 문자열을 안전하게 파싱함.
 *
 * @param value - JSON array candidate
 * @returns array면 parsed value, 아니면 undefined
 */
export function parseJsonArray(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * parseJsonObject 함수.
 * JSON object 문자열을 안전하게 파싱함.
 *
 * @param value - JSON object candidate
 * @returns object면 parsed value, 아니면 undefined
 */
export function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * stringifyPureValue 함수.
 * JSON-derived pure macro 값을 CBS 출력 문자열로 변환함.
 *
 * @param value - 변환할 값
 * @returns CBS output string
 */
export function stringifyPureValue(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * stringifyVariableValue 함수.
 * CBS variable 값을 runtime 출력용 string으로 변환함.
 *
 * @param value - context 또는 local state에서 읽은 값
 * @returns CBS output string
 */
export function stringifyVariableValue(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  return String(value);
}

/**
 * hasOwn 함수.
 * readonly record에서 own key 존재 여부를 안전하게 확인함.
 *
 * @param record - 확인할 key/value store
 * @param key - 확인할 key
 * @returns own property가 있으면 true
 */
export function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
