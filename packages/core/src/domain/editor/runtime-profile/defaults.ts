/**
 * Main Editor runtime simulator profile 기본값 생성 helper.
 * @file packages/core/src/domain/editor/runtime-profile/defaults.ts
 */

import type { MainEditorSimulatorProfile, SimulatorProfile, SimulatorProfileVariableOverrides } from './types';

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
