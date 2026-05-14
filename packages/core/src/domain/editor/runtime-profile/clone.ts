/**
 * Main Editor runtime simulator profile clone helper.
 * @file packages/core/src/domain/editor/runtime-profile/clone.ts
 */

import type { SimulatorProfile } from './types';

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
