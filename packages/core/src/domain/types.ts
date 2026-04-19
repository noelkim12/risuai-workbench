export interface GenericRecord {
  [key: string]: unknown;
}

/**
 * 값이 plain object이면 GenericRecord로 캐스팅하고, 아니면 null을 반환한다.
 *
 * @param value - 검사할 값
 * @returns plain object이면 GenericRecord, 그 외 null
 */
export function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRecord)
    : null;
}
