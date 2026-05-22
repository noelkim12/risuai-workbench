/**
 * Main Editor runtime simulator profile variable merge helper.
 * @file packages/core/src/domain/editor/runtime-profile/variables.ts
 */

import type { CbsSimulationContextInput } from '../../../simulator';
import { isSimulatorProfile } from './validation';
import type { MainEditorSimulatorProfile, SimulatorProfileVariablePatch } from './types';

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
