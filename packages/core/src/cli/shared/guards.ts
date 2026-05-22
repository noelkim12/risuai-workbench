import { isPlainRecord } from '@/shared/guards';

/**
 * isPlainObject 함수.
 * JSON 계열 값이 null/array가 아닌 object property bag인지 확인함.
 * 공유 isPlainRecord에 위임함.
 *
 * @param value - record처럼 다룰 수 있는지 확인할 unknown 값
 * @returns null과 array를 제외한 object이면 true
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value);
}
