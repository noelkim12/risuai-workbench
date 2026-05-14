/**
 * Main editor simulator profile workspaceState bridge.
 * @file packages/vscode/src/editors/mainEditor/mainEditorSimulatorProfileBridge.ts
 */

import * as vscode from 'vscode';
import { createDefaultMainEditorSimulatorProfile, type MainEditorSimulatorProfile } from 'risu-workbench-core';
import type {
  MainEditorSimulatorProfileListRequestPayload,
  MainEditorSimulatorProfileListResultPayload,
  MainEditorSimulatorProfilePayload,
  MainEditorSimulatorProfileSaveRequestPayload,
  MainEditorSimulatorProfileSaveResultPayload,
} from './mainEditorTypes';
import { isSimulatorProfile as isStrictMainEditorSimulatorProfile } from './mainEditorTypes';

export const MAIN_EDITOR_SIMULATOR_PROFILES_KEY = 'risuWorkbench.mainEditor.simulatorProfiles';

interface SimulatorProfileStore {
  profiles: MainEditorSimulatorProfilePayload[];
  activeProfileId: string;
}

/**
 * createMainEditorSimulatorProfileListResult 함수.
 * workspaceState profile store를 읽고 corrupted entry를 정리한 뒤 list result를 생성함.
 *
 * @param workspaceState - profile persistence에 사용할 VS Code workspaceState
 * @param payload - webview list request payload
 * @returns webview profile list result
 */
export async function createMainEditorSimulatorProfileListResult(
  workspaceState: vscode.Memento,
  payload: MainEditorSimulatorProfileListRequestPayload,
): Promise<MainEditorSimulatorProfileListResultPayload> {
  const store = readSimulatorProfileStore(workspaceState);
  return {
    requestId: payload.requestId,
    documentUri: payload.documentUri,
    profiles: store.profiles,
    activeProfileId: store.activeProfileId,
  };
}

/**
 * createMainEditorSimulatorProfileSaveResult 함수.
 * 명시적 save request만 workspaceState profile store에 반영함.
 *
 * @param workspaceState - profile persistence에 사용할 VS Code workspaceState
 * @param payload - webview save request payload
 * @returns save result payload
 */
export async function createMainEditorSimulatorProfileSaveResult(
  workspaceState: vscode.Memento,
  payload: MainEditorSimulatorProfileSaveRequestPayload,
): Promise<MainEditorSimulatorProfileSaveResultPayload> {
  if (!isSimulatorProfilePayload(payload.profile)) {
    const fallback = createDefaultProfilePayload();
    return {
      requestId: payload.requestId,
      documentUri: payload.documentUri,
      profile: fallback,
      activeProfileId: fallback.id,
      status: 'error',
      message: 'Simulator profile payload failed validation.',
    };
  }

  const store = readSimulatorProfileStore(workspaceState);
  const profile = cloneProfilePayload(payload.profile);
  const profiles = upsertProfile(store.profiles, profile);
  const activeProfileId = resolveActiveProfileId(profiles, payload.activeProfileId ?? profile.id);
  const nextStore = { profiles, activeProfileId };
  await workspaceState.update(MAIN_EDITOR_SIMULATOR_PROFILES_KEY, nextStore);
  return {
    requestId: payload.requestId,
    documentUri: payload.documentUri,
    profile,
    activeProfileId,
    status: 'ok',
  };
}

/**
 * readSimulatorProfileStore 함수.
 * workspaceState unknown 값을 검증 가능한 profile store로 정규화함.
 *
 * @param workspaceState - 읽을 VS Code workspaceState
 * @returns corruption이 제거된 profile store
 */
export function readSimulatorProfileStore(workspaceState: vscode.Memento): SimulatorProfileStore {
  const stored = workspaceState.get<unknown>(MAIN_EDITOR_SIMULATOR_PROFILES_KEY);
  if (!isRecord(stored)) return createDefaultStore();

  const profiles = Array.isArray(stored.profiles)
    ? stored.profiles.filter(isSimulatorProfilePayload).map(cloneProfilePayload)
    : [];
  const normalizedProfiles = ensureDefaultProfile(profiles);
  const activeProfileId = typeof stored.activeProfileId === 'string'
    ? resolveActiveProfileId(normalizedProfiles, stored.activeProfileId)
    : normalizedProfiles[0].id;
  return { profiles: normalizedProfiles, activeProfileId };
}

function createDefaultStore(): SimulatorProfileStore {
  const profile = createDefaultProfilePayload();
  return { profiles: [profile], activeProfileId: profile.id };
}

function createDefaultProfilePayload(): MainEditorSimulatorProfilePayload {
  return cloneProfilePayload(createDefaultMainEditorSimulatorProfile());
}

function ensureDefaultProfile(profiles: MainEditorSimulatorProfilePayload[]): MainEditorSimulatorProfilePayload[] {
  if (profiles.length === 0) return [createDefaultProfilePayload()];
  if (profiles.some((profile) => profile.id === 'default')) return profiles;
  return [createDefaultProfilePayload(), ...profiles];
}

function upsertProfile(
  profiles: MainEditorSimulatorProfilePayload[],
  profile: MainEditorSimulatorProfilePayload,
): MainEditorSimulatorProfilePayload[] {
  const nextProfiles = profiles.filter((entry) => entry.id !== profile.id);
  nextProfiles.push(profile);
  return nextProfiles;
}

function resolveActiveProfileId(profiles: MainEditorSimulatorProfilePayload[], requestedId: string): string {
  return profiles.some((profile) => profile.id === requestedId) ? requestedId : profiles[0].id;
}

function isSimulatorProfilePayload(value: unknown): value is MainEditorSimulatorProfilePayload {
  return isStrictMainEditorSimulatorProfile(toProfileCandidateWithRequiredVariableMaps(value));
}

function cloneProfilePayload(profile: MainEditorSimulatorProfilePayload | MainEditorSimulatorProfile): MainEditorSimulatorProfilePayload {
  return {
    id: profile.id,
    name: profile.name,
    target: {
      ...(profile.target.characterId ? { characterId: profile.target.characterId } : {}),
      moduleIds: [...profile.target.moduleIds],
      ...(profile.target.presetId ? { presetId: profile.target.presetId } : {}),
    },
    variables: {
      chatVariables: { ...(profile.variables.chatVariables ?? {}) },
      globalVariables: { ...(profile.variables.globalVariables ?? {}) },
      toggleValues: { ...(profile.variables.toggleValues ?? {}) },
      tempVariables: { ...(profile.variables.tempVariables ?? {}) },
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

function toProfileCandidateWithRequiredVariableMaps(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    variables: isRecord(value.variables)
      ? {
          chatVariables: value.variables.chatVariables ?? {},
          globalVariables: value.variables.globalVariables ?? {},
          toggleValues: value.variables.toggleValues ?? {},
          tempVariables: value.variables.tempVariables ?? {},
        }
      : value.variables,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
