/**
 * native LuaLS RisuAI stub installer에서 쓰는 VS Code 비의존 경로/설정 유틸.
 * @file packages/vscode/src/luals/risuLuaStubsCore.ts
 */

import path from 'node:path';

import { RISUAI_LUA_RUNTIME_STUB_FILE_NAME } from 'risu-workbench-core';

export const RISU_LUALS_STUB_COMMAND = 'risuaiWorkbench.generateLuaStubs';

const RISU_LUALS_STUB_ROOT_SEGMENTS = Object.freeze(['.vscode', 'risu-stubs']);

export type LuaWorkspaceLibrarySetting = string[] | Record<string, boolean>;

/**
 * getWorkspaceRisuLuaStubRootPath 함수.
 * workspace-local LuaLS stub directory 경로를 계산함.
 *
 * @param workspaceRootPath - 첫 번째 workspace folder의 filesystem path
 * @returns `.vscode/risu-stubs` 절대 경로
 */
export function getWorkspaceRisuLuaStubRootPath(workspaceRootPath: string): string {
  return path.join(workspaceRootPath, ...RISU_LUALS_STUB_ROOT_SEGMENTS);
}

/**
 * getWorkspaceRisuLuaStubFilePath 함수.
 * workspace-local RisuAI runtime stub 파일 경로를 계산함.
 *
 * @param workspaceRootPath - 첫 번째 workspace folder의 filesystem path
 * @returns generated `risu-runtime.lua` 절대 경로
 */
export function getWorkspaceRisuLuaStubFilePath(workspaceRootPath: string): string {
  return path.join(
    getWorkspaceRisuLuaStubRootPath(workspaceRootPath),
    RISUAI_LUA_RUNTIME_STUB_FILE_NAME,
  );
}

/**
 * mergeLuaWorkspaceLibrary 함수.
 * 기존 Lua.workspace.library 설정에 RisuAI stub directory를 중복 없이 추가함.
 *
 * @param currentValue - 현재 VS Code Lua.workspace.library 설정값
 * @param stubRootPath - LuaLS library로 추가할 stub directory path
 * @returns LuaLS가 읽을 merged workspace.library 설정값
 */
export function mergeLuaWorkspaceLibrary(
  currentValue: unknown,
  stubRootPath: string,
): LuaWorkspaceLibrarySetting {
  if (Array.isArray(currentValue)) {
    return [
      ...new Set([
        ...currentValue.filter((value): value is string => typeof value === 'string'),
        stubRootPath,
      ]),
    ];
  }

  if (isBooleanRecord(currentValue)) {
    return {
      ...currentValue,
      [stubRootPath]: true,
    };
  }

  return [stubRootPath];
}

/**
 * isBooleanRecord 함수.
 * Lua.workspace.library의 map-like 설정값인지 보수적으로 판별함.
 *
 * @param value - 판별할 unknown 설정값
 * @returns string key와 boolean value만 담긴 record 여부
 */
function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'boolean');
}
