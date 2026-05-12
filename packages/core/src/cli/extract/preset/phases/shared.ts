/**
 * 프리셋 추출 phase에서 재사용하는 좁은 변환 헬퍼 모음.
 * @file packages/core/src/cli/extract/preset/phases/shared.ts
 */

import type { PresetType } from './types';

/**
 * detectPresetType 함수.
 * 프리셋 원본 객체의 구조를 보고 RisuAI/NAI/SillyTavern 계열을 판별함.
 *
 * @param data - 타입을 판별할 프리셋 원본 객체
 * @returns 감지된 프리셋 타입
 */
export function detectPresetType(data: Record<string, unknown>): PresetType {
  if (
    typeof data.presetVersion === 'number' &&
    data.presetVersion >= 3 &&
    data.parameters &&
    typeof data.parameters === 'object'
  ) {
    return 'nai';
  }

  const promptOrder = data.prompt_order;
  const firstPromptOrder = Array.isArray(promptOrder) ? promptOrder[0] : undefined;
  if (
    Array.isArray(promptOrder) &&
    promptOrder.length > 0 &&
    isRecord(firstPromptOrder) &&
    Array.isArray(firstPromptOrder.order) &&
    Array.isArray(data.prompts)
  ) {
    return 'sillytavern';
  }

  if (
    typeof data.mainPrompt === 'string' ||
    Array.isArray(data.formatingOrder) ||
    typeof data.temperature === 'number'
  ) {
    return 'risuai';
  }

  return 'unknown';
}

/**
 * isRecord 함수.
 * unknown 값이 배열이 아닌 plain object 형태인지 좁힘.
 *
 * @param value - 검사할 임의 값
 * @returns record로 안전하게 다룰 수 있으면 true
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * pickDefined 함수.
 * 지정한 key 중 null/undefined가 아닌 값만 새 객체로 복사함.
 *
 * @param source - 값을 읽을 원본 객체
 * @param keys - 복사 대상 key 목록
 * @returns 정의된 값만 담은 객체
 */
export function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * pickNonEmpty 함수.
 * 지정한 key 중 빈 문자열/null/undefined가 아닌 값만 새 객체로 복사함.
 *
 * @param source - 값을 읽을 원본 객체
 * @param keys - 복사 대상 key 목록
 * @returns 비어 있지 않은 값만 담은 객체
 */
export function pickNonEmpty(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const val = source[key];
    if (val === undefined || val === null || val === '') continue;
    result[key] = val;
  }
  return result;
}
