/**
 * Main Editor runtime simulator profile public module export.
 * @file packages/core/src/domain/editor/runtime-profile/index.ts
 */

export type {
  MainEditorSimulatorProfile,
  SimulatorProfile,
  SimulatorProfileChatMessage,
  SimulatorProfileChatRole,
  SimulatorProfileHtmlContext,
  SimulatorProfileTarget,
  SimulatorProfileVariableOverrides,
  SimulatorProfileVariablePatch,
} from './types';
export { cloneSimulatorProfile } from './clone';
export {
  createDefaultMainEditorSimulatorProfile,
  createDefaultSimulatorProfile,
  createEmptySimulatorProfileVariables,
} from './defaults';
export { isSimulatorProfile, normalizeSimulatorProfile } from './validation';
export { mergeSimulatorProfileVariables } from './variables';
