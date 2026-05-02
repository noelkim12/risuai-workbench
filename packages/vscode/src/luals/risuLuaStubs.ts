/**
 * native LuaLS가 RisuAI Lua runtime API를 hover/definition 대상으로 읽도록 workspace stub를 설치하는 VS Code 유틸.
 * @file packages/vscode/src/luals/risuLuaStubs.ts
 */

import * as vscode from 'vscode';
import { createMinimalRisuAiLuaTypeStub } from 'risu-workbench-core';

import {
  getWorkspaceRisuLuaStubFilePath,
  getWorkspaceRisuLuaStubRootPath,
  mergeLuaWorkspaceLibrary,
  type LuaWorkspaceLibrarySetting,
} from './risuLuaStubsCore';

export {
  RISU_LUALS_STUB_COMMAND,
  getWorkspaceRisuLuaStubFilePath,
  getWorkspaceRisuLuaStubRootPath,
  mergeLuaWorkspaceLibrary,
} from './risuLuaStubsCore';

export interface InstallRisuLuaWorkspaceStubsResult {
  readonly library: LuaWorkspaceLibrarySetting;
  readonly stubFilePath: string;
  readonly stubRootPath: string;
}

/**
 * installRisuLuaWorkspaceStubs 함수.
 * workspace-local RisuAI LuaLS stub 파일을 쓰고 native LuaLS workspace.library에 연결함.
 *
 * @param workspaceFolder - stub를 설치할 VS Code workspace folder
 * @returns 설치된 stub file/root path와 갱신된 library 설정값
 */
export async function installRisuLuaWorkspaceStubs(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<InstallRisuLuaWorkspaceStubsResult> {
  const stubRootPath = getWorkspaceRisuLuaStubRootPath(workspaceFolder.uri.fsPath);
  const stubFilePath = getWorkspaceRisuLuaStubFilePath(workspaceFolder.uri.fsPath);
  const stubRootUri = vscode.Uri.file(stubRootPath);
  const stubFileUri = vscode.Uri.file(stubFilePath);

  await vscode.workspace.fs.createDirectory(stubRootUri);
  await vscode.workspace.fs.writeFile(
    stubFileUri,
    new TextEncoder().encode(createMinimalRisuAiLuaTypeStub()),
  );

  const luaConfig = vscode.workspace.getConfiguration('Lua', workspaceFolder.uri);
  const library = mergeLuaWorkspaceLibrary(
    luaConfig.get<unknown>('workspace.library'),
    stubRootPath,
  );
  await luaConfig.update('workspace.library', library, vscode.ConfigurationTarget.Workspace);

  return {
    library,
    stubFilePath,
    stubRootPath,
  };
}
