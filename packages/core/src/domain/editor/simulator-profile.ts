/**
 * Main Editor의 런타임 시뮬레이션 상태와 정규화 helper를 모아둡니다.
 * @file packages/core/src/domain/editor/simulator-profile.ts
 */

import type { CbsSimulationContextInput } from '../../simulator';

export type SimulatorProfileChatRole = 'user' | 'assistant' | 'system' | 'bot';

export interface SimulatorProfileVariableOverrides {
  chatVariables: Record<string, string>;
  globalVariables: Record<string, string>;
  toggleValues: Record<string, boolean>;
  tempVariables: Record<string, string>;
}

export interface SimulatorProfileTarget {
  characterId?: string;
  moduleIds: string[];
  presetId?: string;
}

export interface SimulatorProfileChatMessage {
  role: SimulatorProfileChatRole;
  content: string;
  timestamp?: string;
}

export interface SimulatorProfileHtmlContext {
  enabledHtmlDocumentUris: string[];
}

export interface SimulatorProfile {
  id: string;
  name: string;
  target: SimulatorProfileTarget;
  variables: SimulatorProfileVariableOverrides;
  chatHistory: SimulatorProfileChatMessage[];
  htmlContext: SimulatorProfileHtmlContext;
}

export type MainEditorSimulatorProfile = SimulatorProfile;

export type SimulatorProfileVariablePatch = Partial<SimulatorProfileVariableOverrides>;

/**
 * createDefaultSimulatorProfile 함수.
 * Main Editor preview와 runtime simulator가 공유하는 기본 profile을 생성합니다.
 *
 * @returns id/name과 빈 target, variable, chat history, HTML context를 가진 기본 profile입니다.
 */
export function createDefaultSimulatorProfile(): SimulatorProfile {
  return {
    id: 'default',
    name: 'Default',
    target: {
      moduleIds: [],
    },
    variables: createEmptySimulatorProfileVariables(),
    chatHistory: [],
    htmlContext: {
      enabledHtmlDocumentUris: [],
    },
  };
}

/**
 * createDefaultMainEditorSimulatorProfile 함수.
 * Main Editor public API 이름으로 기본 simulator profile을 생성합니다.
 *
 * @returns JSON 직렬화 가능한 기본 Main Editor simulator profile입니다.
 */
export function createDefaultMainEditorSimulatorProfile(): MainEditorSimulatorProfile {
  return createDefaultSimulatorProfile();
}

/**
 * createEmptySimulatorProfileVariables 함수.
 * chat/global/toggle/temp override map이 모두 존재하는 빈 variable payload를 생성합니다.
 *
 * @returns simulator profile에서 안전하게 병합 가능한 빈 variable override skeleton입니다.
 */
export function createEmptySimulatorProfileVariables(): SimulatorProfileVariableOverrides {
  return {
    chatVariables: {},
    globalVariables: {},
    toggleValues: {},
    tempVariables: {},
  };
}

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
 * mergeSimulatorProfileVariables 함수.
 * 저장된 profile 변수와 preview-only override를 병합하며 preview override를 우선합니다.
 *
 * @param profileOrVariables - 저장된 profile 전체 또는 profile에서 꺼낸 variable maps입니다.
 * @param previewOverrides - 현재 preview에서만 임시로 적용할 override maps입니다.
 * @returns CBS simulator에 전달할 effective variable context입니다.
 */
export function mergeSimulatorProfileVariables(
  profileOrVariables: MainEditorSimulatorProfile | SimulatorProfileVariablePatch = {},
  previewOverrides: SimulatorProfileVariablePatch = {},
): CbsSimulationContextInput {
  const profileVariables = isSimulatorProfile(profileOrVariables) ? profileOrVariables.variables : profileOrVariables;
  return {
    chatVariables: { ...(profileVariables.chatVariables ?? {}), ...(previewOverrides.chatVariables ?? {}) },
    globalVariables: { ...(profileVariables.globalVariables ?? {}), ...(previewOverrides.globalVariables ?? {}) },
    toggleValues: { ...(profileVariables.toggleValues ?? {}), ...(previewOverrides.toggleValues ?? {}) },
    tempVariables: { ...(profileVariables.tempVariables ?? {}), ...(previewOverrides.tempVariables ?? {}) },
  };
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
 * cloneSimulatorProfile 함수.
 * Profile을 JSON-compatible plain object로 복제합니다.
 *
 * @param profile - 저장소나 UI 상태와 참조를 분리해야 하는 simulator profile입니다.
 * @returns 중첩 배열과 map을 새 참조로 가진 복제된 simulator profile입니다.
 */
export function cloneSimulatorProfile(profile: SimulatorProfile): SimulatorProfile {
  return {
    id: profile.id,
    name: profile.name,
    target: {
      ...(profile.target.characterId ? { characterId: profile.target.characterId } : {}),
      moduleIds: [...profile.target.moduleIds],
      ...(profile.target.presetId ? { presetId: profile.target.presetId } : {}),
    },
    variables: {
      chatVariables: { ...profile.variables.chatVariables },
      globalVariables: { ...profile.variables.globalVariables },
      toggleValues: { ...profile.variables.toggleValues },
      tempVariables: { ...profile.variables.tempVariables },
    },
    chatHistory: profile.chatHistory.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.timestamp ? { timestamp: message.timestamp } : {}),
    })),
    htmlContext: {
      enabledHtmlDocumentUris: [...profile.htmlContext.enabledHtmlDocumentUris],
    },
  };
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

/**
 * isStringRecord 함수.
 * variable map처럼 모든 값이 문자열이어야 하는 plain record를 검증합니다.
 *
 * @param value - 문자열 map으로 안전하게 사용할 수 있는지 확인할 값입니다.
 * @returns plain record이고 모든 값이 문자열이면 true입니다.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * isBooleanRecord 함수.
 * toggle override처럼 모든 값이 boolean이어야 하는 plain record를 검증합니다.
 *
 * @param value - boolean map으로 안전하게 사용할 수 있는지 확인할 값입니다.
 * @returns plain record이고 모든 값이 boolean이면 true입니다.
 */
function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

/**
 * isStringArray 함수.
 * HTML context URI 목록처럼 문자열 배열만 허용되는 값을 검증합니다.
 *
 * @param value - 문자열 배열로 사용할 수 있는지 확인할 값입니다.
 * @returns 배열이고 모든 항목이 문자열이면 true입니다.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * isRecord 함수.
 * 외부 입력이 array가 아닌 plain object 또는 null-prototype object인지 확인합니다.
 *
 * @param value - record guard의 기준점으로 삼을 unknown 값입니다.
 * @returns plain record로 key 접근이 안전하면 true입니다.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
