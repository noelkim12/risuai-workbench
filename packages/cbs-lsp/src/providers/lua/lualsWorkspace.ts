/**
 * LuaLS workspace/library configuration helpers.
 * @file packages/cbs-lsp/src/providers/lua/lualsWorkspace.ts
 */

import path from 'node:path';

import { getRisuAiLuaDiagnosticGlobals } from './typeStubs';

export interface LuaLsWorkspaceLibraryOptions {
  rootPath?: string | null;
  shadowRootPath: string;
  stubRootPaths?: readonly (string | null | undefined)[];
}

export interface LuaLsWorkspaceConfigurationOptions extends LuaLsWorkspaceLibraryOptions {
  diagnosticsEnableSchemes: readonly string[];
}

/**
 * resolveLuaLsWorkspaceLibraryPaths 함수.
 * shadow root와 future stub root 후보를 LuaLS `Lua.workspace.library` 경로 목록으로 정규화함.
 *
 * @param options - workspace/library 경로를 구성할 입력값
 * @returns 중복 없이 정렬된 absolute library root 목록
 */
export function resolveLuaLsWorkspaceLibraryPaths(
  options: LuaLsWorkspaceLibraryOptions,
): readonly string[] {
  const basePath = options.rootPath ?? process.cwd();
  const libraryPaths = new Set<string>([path.resolve(options.shadowRootPath)]);

  for (const stubRootPath of options.stubRootPaths ?? []) {
    if (!stubRootPath) {
      continue;
    }

    libraryPaths.add(
      path.isAbsolute(stubRootPath) ? stubRootPath : path.resolve(basePath, stubRootPath),
    );
  }

  return [...libraryPaths].sort((left, right) => left.localeCompare(right));
}

/**
 * createLuaLsWorkspaceConfiguration 함수.
 * LuaLS `workspace/didChangeConfiguration` payload를 diagnostics scheme + workspace/library 기준으로 생성함.
 *
 * @param options - diagnostics scheme과 workspace/library root 입력값
 * @returns LuaLS에 바로 전달할 configuration payload
 */
export function createLuaLsWorkspaceConfiguration(
  options: LuaLsWorkspaceConfigurationOptions,
): {
  settings: {
    Lua: {
      diagnostics: {
        enableScheme: string[];
        globals: string[];
        libraryFiles: 'Disable';
      };
      workspace: {
        library: string[];
      };
    };
  };
} {
  return {
    settings: {
      Lua: {
        diagnostics: {
          enableScheme: [...options.diagnosticsEnableSchemes],
          globals: [...getRisuAiLuaDiagnosticGlobals()],
          libraryFiles: 'Disable',
        },
        workspace: {
          library: [...resolveLuaLsWorkspaceLibraryPaths(options)],
        },
      },
    },
  };
}
