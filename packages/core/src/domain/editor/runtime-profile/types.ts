/**
 * Main Editor runtime simulator profile 타입 계약.
 * @file packages/core/src/domain/editor/runtime-profile/types.ts
 */

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
