/**
 * Main Editor runtime simulator profile validation helper.
 * @file packages/core/src/domain/editor/runtime-profile/validation.ts
 */

import { cloneSimulatorProfile } from './clone';
import { createDefaultSimulatorProfile } from './defaults';
import { isBooleanRecord, isRecord, isStringArray, isStringRecord } from './guards';
import type {
  SimulatorProfile,
  SimulatorProfileChatMessage,
  SimulatorProfileChatRole,
  SimulatorProfileTarget,
  SimulatorProfileVariableOverrides,
} from './types';

/**
 * normalizeSimulatorProfile 함수.
 * 저장소나 webview message 경계에서 온 profile 후보를 검증하고 깨진 값은 기본값으로 대체합니다.
 *
 * @param value - 저장소/메시지 경계에서 들어와 contract 확인이 필요한 profile 후보입니다.
 * @returns 유효한 profile이면 복제본, 아니면 기본 simulator profile입니다.
 */
export function normalizeSimulatorProfile(value: unknown): SimulatorProfile {
  return isSimulatorProfile(value) ? cloneSimulatorProfile(value) : createDefaultSimulatorProfile();
}

/**
 * isSimulatorProfile 함수.
 * unknown 값이 simulator profile contract를 만족하는지 확인합니다.
 *
 * @param value - 외부 입력이라 구조 검증이 필요한 unknown 값입니다.
 * @returns simulator profile contract를 만족하면 true입니다.
 */
export function isSimulatorProfile(value: unknown): value is SimulatorProfile {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.trim().length === 0) return false;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return false;
  if (!isSimulatorProfileTarget(value.target)) return false;
  if (!isSimulatorProfileVariables(value.variables)) return false;
  if (!Array.isArray(value.chatHistory) || !value.chatHistory.every(isSimulatorProfileChatMessage)) return false;
  return isRecord(value.htmlContext) && isStringArray(value.htmlContext.enabledHtmlDocumentUris);
}

/**
 * isSimulatorProfileTarget 함수.
 * simulator profile의 실행 대상 character/module/preset 구조를 검증합니다.
 *
 * @param value - target contract를 만족하는지 확인할 외부 입력값입니다.
 * @returns simulator target contract를 만족하면 true입니다.
 */
function isSimulatorProfileTarget(value: unknown): value is SimulatorProfileTarget {
  return (
    isRecord(value) &&
    (!('characterId' in value) || typeof value.characterId === 'string') &&
    Array.isArray(value.moduleIds) &&
    value.moduleIds.every((entry) => typeof entry === 'string') &&
    (!('presetId' in value) || typeof value.presetId === 'string')
  );
}

/**
 * isSimulatorProfileVariables 함수.
 * runtime simulation에 주입할 variable override map들의 형태를 검증합니다.
 *
 * @param value - variable override payload로 사용할 수 있는지 확인할 외부 입력값입니다.
 * @returns 모든 variable override map이 올바른 record이면 true입니다.
 */
function isSimulatorProfileVariables(value: unknown): value is SimulatorProfileVariableOverrides {
  return (
    isRecord(value) &&
    isStringRecord(value.chatVariables) &&
    isStringRecord(value.globalVariables) &&
    isBooleanRecord(value.toggleValues) &&
    isStringRecord(value.tempVariables)
  );
}

/**
 * isSimulatorProfileChatMessage 함수.
 * simulator chat history 한 항목의 role/content/timestamp 구조를 검증합니다.
 *
 * @param value - chat history item으로 사용할 수 있는지 확인할 외부 입력값입니다.
 * @returns simulator chat message contract를 만족하면 true입니다.
 */
function isSimulatorProfileChatMessage(value: unknown): value is SimulatorProfileChatMessage {
  return (
    isRecord(value) &&
    isSimulatorProfileChatRole(value.role) &&
    typeof value.content === 'string' &&
    (!('timestamp' in value) || typeof value.timestamp === 'string')
  );
}

/**
 * isSimulatorProfileChatRole 함수.
 * chat history에서 허용하는 발화자 role인지 확인합니다.
 *
 * @param value - chat message role로 좁힐 후보 값입니다.
 * @returns 지원하는 simulator chat role이면 true입니다.
 */
function isSimulatorProfileChatRole(value: unknown): value is SimulatorProfileChatRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'bot';
}
