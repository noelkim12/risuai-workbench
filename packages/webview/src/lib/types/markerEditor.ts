/**
 * Root Marker Editor webview-side state and message payload types.
 * @file packages/webview/src/lib/types/markerEditor.ts
 */

import type { CharacterManifestFlags, ModuleBrowserFlags } from '../types';

export type MarkerEditorMode = 'character' | 'module';

export type MarkerEditorArtifactKind = MarkerEditorMode;

export type MarkerEditorTimestamp = string | null;

export type CharacterMarkerEditField =
  | 'name'
  | 'creator'
  | 'characterVersion'
  | 'image'
  | 'tags'
  | keyof CharacterManifestFlags;

export type ModuleMarkerEditField = 'name' | 'description' | 'namespace' | 'image' | keyof ModuleBrowserFlags;

export type MarkerEditorEditField = CharacterMarkerEditField | ModuleMarkerEditField;

export interface CharacterEditFields {
  name: string;
  creator: string;
  characterVersion: string;
  image: string | null;
  tags: string[];
  utilityBot: CharacterManifestFlags['utilityBot'];
  lowLevelAccess: CharacterManifestFlags['lowLevelAccess'];
}

export interface ModuleEditFields {
  name: string;
  description: string;
  namespace: string;
  image: string | null;
  lowLevelAccess: ModuleBrowserFlags['lowLevelAccess'];
  hideIcon: ModuleBrowserFlags['hideIcon'];
}

export type MarkerEditFields = CharacterEditFields | ModuleEditFields;

export interface CharacterEditorInitPayload {
  mode: 'character';
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel?: string;
  fields: CharacterEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export interface ModuleEditorInitPayload {
  mode: 'module';
  markerUri: string;
  rootUri: string;
  rootPathLabel: string;
  markerPathLabel?: string;
  fields: ModuleEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export type MarkerEditorInitPayload = CharacterEditorInitPayload | ModuleEditorInitPayload;

export interface MarkerEditorSavePayload {
  markerUri: string;
  mode: MarkerEditorMode;
  fields: MarkerEditFields;
}

export interface MarkerEditorResetRequestPayload {
  markerUri: string;
  mode: MarkerEditorMode;
}

export interface MarkerEditorSelectImagePayload {
  markerUri: string;
  rootUri: string;
  mode: MarkerEditorMode;
}

export interface MarkerEditorSavedPayload {
  success: boolean;
  message?: string;
  fields?: MarkerEditFields;
  imageUri?: string;
}

export interface MarkerEditorResetResponsePayload {
  fields: MarkerEditFields;
  imageUri?: string;
  createdAt: MarkerEditorTimestamp;
  modifiedAt: MarkerEditorTimestamp;
}

export interface MarkerEditorImageSelectedPayload {
  imagePath: string;
  imageUri?: string;
}

export interface MarkerEditorErrorPayload {
  code: string;
  message: string;
  field?: MarkerEditorEditField;
}
