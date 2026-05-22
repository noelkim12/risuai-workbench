/**
 * 프리셋 추출 phase 사이에서 공유하는 타입 모음.
 * @file packages/core/src/cli/extract/preset/phases/types.ts
 */

export type PresetType = 'risuai' | 'nai' | 'sillytavern' | 'unknown';

export interface ParsedPreset {
  raw: Record<string, unknown>;
  presetType: PresetType;
  sourceFormat: string;
  name: string;
  importFormat: 'native' | 'encrypted-container';
}

export interface SillyTavernPrompt {
  identifier?: unknown;
  content?: unknown;
  role?: unknown;
}

export interface SillyTavernOrderItem {
  identifier?: unknown;
  enabled?: unknown;
}
