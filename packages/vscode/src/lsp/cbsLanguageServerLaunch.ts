/**
 * CBS language server launch resolution contract for the VS Code client.
 * @file packages/vscode/src/lsp/cbsLanguageServerLaunch.ts
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const CBS_LANGUAGE_SERVER_BINARY_NAME = 'cbs-language-server';

export const CBS_LANGUAGE_SERVER_INSTALL_MODES = Object.freeze([
  'local-devDependency',
  'npx',
  'global',
] as const);

export const CBS_LANGUAGE_SERVER_LAUNCH_MODES = Object.freeze([
  'auto',
  'embedded',
  'standalone',
] as const);

export type CbsLanguageServerInstallMode = (typeof CBS_LANGUAGE_SERVER_INSTALL_MODES)[number];

export type CbsLanguageServerLaunchMode = (typeof CBS_LANGUAGE_SERVER_LAUNCH_MODES)[number];

export interface CbsLanguageServerSettings {
  installMode: CbsLanguageServerInstallMode;
  launchMode: CbsLanguageServerLaunchMode;
  pathOverride: string;
}

export interface CbsLanguageServerLaunchResolutionOptions {
  exists?: (filePath: string) => boolean;
  extensionRootPath: string;
  platform?: NodeJS.Platform;
  settings: CbsLanguageServerSettings;
  workspaceRootPath: string | null;
}

export interface CbsEmbeddedLaunchPlan {
  detail: string;
  kind: 'embedded';
  modulePath: string;
}

export interface CbsStandaloneLaunchPlan {
  args: readonly string[];
  command: string;
  cwd: string | undefined;
  detail: string;
  installMode: CbsLanguageServerInstallMode;
  kind: 'standalone';
  source: 'global' | 'installMode' | 'npx' | 'pathOverride' | 'workspace-local-devDependency';
}

export interface CbsLaunchFailure {
  attemptedModes: readonly string[];
  detail: string;
  kind: 'failure';
  recovery: string;
}

export type CbsLanguageServerLaunchPlan =
  | CbsEmbeddedLaunchPlan
  | CbsStandaloneLaunchPlan
  | CbsLaunchFailure;

const STDIO_ARGS = Object.freeze(['--stdio']);

/**
 * defaultCbsLanguageServerSettings 함수.
 * VS Code client가 기본으로 사용하는 launch/install 정책을 반환함.
 *
 * @returns 기본 CBS language server 설정
 */
export function defaultCbsLanguageServerSettings(): CbsLanguageServerSettings {
  return {
    installMode: 'local-devDependency',
    launchMode: 'auto',
    pathOverride: '',
  };
}

/**
 * getEmbeddedCbsServerModulePath 함수.
 * monorepo 개발 환경에서만 존재하는 embedded server module 경로를 계산함.
 *
 * @param extensionRootPath - VS Code extension root 경로
 * @returns embedded `embedded.js` 예상 경로
 */
export function getEmbeddedCbsServerModulePath(extensionRootPath: string): string {
  return path.join(extensionRootPath, '..', 'cbs-lsp', 'dist', 'embedded.js');
}

/**
 * getWorkspaceLocalCbsBinaryPath 함수.
 * workspace local devDependency install mode가 찾을 binary 경로를 계산함.
 *
 * @param workspaceRootPath - 첫 번째 workspace folder 경로
 * @param platform - 실행 중인 플랫폼 이름
 * @returns `node_modules/.bin` 아래 binary 경로
 */
export function getWorkspaceLocalCbsBinaryPath(
  workspaceRootPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const binaryName = platform === 'win32'
    ? `${CBS_LANGUAGE_SERVER_BINARY_NAME}.cmd`
    : CBS_LANGUAGE_SERVER_BINARY_NAME;
  return path.join(workspaceRootPath, 'node_modules', '.bin', binaryName);
}

/**
 * resolveCbsLanguageServerLaunch 함수.
 * VS Code client가 사용할 standalone/embedded launch plan을 결정함.
 *
 * @param options - extension root, workspace root, settings, file existence seam
 * @returns 성공 시 launch plan, 실패 시 user-facing failure payload
 */
export function resolveCbsLanguageServerLaunch(
  options: CbsLanguageServerLaunchResolutionOptions,
): CbsLanguageServerLaunchPlan {
  const exists = options.exists ?? existsSync;
  const platform = options.platform ?? process.platform;
  const settings = normalizeSettings(options.settings);
  const embeddedModulePath = getEmbeddedCbsServerModulePath(options.extensionRootPath);
  const explicitPathConfigured = settings.pathOverride.length > 0;

  if (settings.launchMode === 'embedded') {
    return resolveEmbeddedLaunch(embeddedModulePath, exists, ['embedded']);
  }

  if (settings.launchMode === 'standalone') {
    return resolveStandaloneLaunch({
      embeddedModulePath,
      exists,
      explicitPathConfigured,
      extensionRootPath: options.extensionRootPath,
      installMode: settings.installMode,
      platform,
      pathOverride: settings.pathOverride,
      workspaceRootPath: options.workspaceRootPath,
    });
  }

  const standaloneLaunch = resolveStandaloneLaunch({
    embeddedModulePath,
    exists,
    explicitPathConfigured,
    extensionRootPath: options.extensionRootPath,
    installMode: settings.installMode,
    platform,
    pathOverride: settings.pathOverride,
    workspaceRootPath: options.workspaceRootPath,
  });

  if (standaloneLaunch.kind !== 'failure') {
    return standaloneLaunch;
  }

  if (explicitPathConfigured) {
    return standaloneLaunch;
  }

  if (exists(embeddedModulePath)) {
    return {
      detail:
        `${standaloneLaunch.detail} Falling back to embedded dev module at ${embeddedModulePath}. ` +
        'This fallback is intended for monorepo development only.',
      kind: 'embedded',
      modulePath: embeddedModulePath,
    };
  }

  return {
    attemptedModes: ['standalone', 'embedded'],
    detail:
      `${standaloneLaunch.detail} Embedded dev module was also not found at ${embeddedModulePath}.`,
    kind: 'failure',
    recovery:
      'Install `cbs-language-server` in the workspace, switch to `npx`/`global`, set `risuWorkbench.cbs.server.path`, or open the monorepo workspace that contains `packages/cbs-lsp/dist/embedded.js`.',
  };
}

interface ResolveStandaloneLaunchOptions {
  embeddedModulePath: string;
  exists: (filePath: string) => boolean;
  explicitPathConfigured: boolean;
  extensionRootPath: string;
  installMode: CbsLanguageServerInstallMode;
  pathOverride: string;
  platform: NodeJS.Platform;
  workspaceRootPath: string | null;
}

/**
 * normalizeSettings 함수.
 * string 설정값을 trim해서 resolution 로직이 같은 기준으로 판단하게 함.
 *
 * @param settings - 사용자가 선택한 client launch 설정
 * @returns trim된 설정값
 */
function normalizeSettings(settings: CbsLanguageServerSettings): CbsLanguageServerSettings {
  return {
    installMode: settings.installMode,
    launchMode: settings.launchMode,
    pathOverride: settings.pathOverride.trim(),
  };
}

/**
 * resolveEmbeddedLaunch 함수.
 * embedded dev server module 존재 여부를 확인하고 module launch payload를 반환함.
 *
 * @param modulePath - 예상 embedded server module 경로
 * @param exists - 파일 존재 여부 검사 seam
 * @param attemptedModes - 이번 분기에서 시도한 launch mode 목록
 * @returns embedded success 또는 user-facing failure
 */
function resolveEmbeddedLaunch(
  modulePath: string,
  exists: (filePath: string) => boolean,
  attemptedModes: readonly string[],
): CbsLanguageServerLaunchPlan {
  if (exists(modulePath)) {
    return {
      detail: `Using embedded dev server module at ${modulePath}.`,
      kind: 'embedded',
      modulePath,
    };
  }

  return {
    attemptedModes,
    detail: `Embedded CBS server module was not found at ${modulePath}.`,
    kind: 'failure',
    recovery:
      'Build `packages/cbs-lsp` in the monorepo, or switch the client to standalone mode with a workspace install, `npx`, `global`, or explicit path override.',
  };
}

/**
 * resolveStandaloneLaunch 함수.
 * path override 또는 install mode에 따라 stdio executable launch payload를 계산함.
 *
 * @param options - standalone resolution에 필요한 경로/설정 정보
 * @returns standalone success 또는 user-facing failure
 */
function resolveStandaloneLaunch(
  options: ResolveStandaloneLaunchOptions,
): CbsLanguageServerLaunchPlan {
  if (options.explicitPathConfigured) {
    const resolvedPath = resolvePathOverride(options.pathOverride, options.workspaceRootPath, options.extensionRootPath);
    if (!options.exists(resolvedPath)) {
      return {
        attemptedModes: ['standalone:pathOverride'],
        detail: `Configured CBS server path does not exist: ${resolvedPath}.`,
        kind: 'failure',
        recovery:
          'Update `risuWorkbench.cbs.server.path` to a valid `cbs-language-server` executable, or clear the override to reuse install-mode resolution.',
      };
    }

    return {
      args: STDIO_ARGS,
      command: resolvedPath,
      cwd: options.workspaceRootPath ?? undefined,
      detail: `Using explicit CBS server path override at ${resolvedPath}.`,
      installMode: options.installMode,
      kind: 'standalone',
      source: 'pathOverride',
    };
  }

  if (options.installMode === 'local-devDependency') {
    if (!options.workspaceRootPath) {
      return {
        attemptedModes: ['standalone:local-devDependency'],
        detail:
          'Standalone local-devDependency mode needs an open workspace folder so the client can resolve `node_modules/.bin/cbs-language-server`.',
        kind: 'failure',
        recovery:
          'Open the extracted workspace first, or switch install mode to `npx`, `global`, or an explicit path override.',
      };
    }

    const localBinaryPath = getWorkspaceLocalCbsBinaryPath(options.workspaceRootPath, options.platform);
    if (!options.exists(localBinaryPath)) {
      return {
        attemptedModes: ['standalone:local-devDependency'],
        detail: `Workspace local CBS server binary was not found at ${localBinaryPath}.`,
        kind: 'failure',
        recovery:
          'Run `npm install --save-dev cbs-language-server` in the workspace, or switch install mode to `npx`, `global`, or a path override.',
      };
    }

    return {
      args: STDIO_ARGS,
      command: localBinaryPath,
      cwd: options.workspaceRootPath,
      detail: `Using workspace local CBS server binary at ${localBinaryPath}.`,
      installMode: 'local-devDependency',
      kind: 'standalone',
      source: 'workspace-local-devDependency',
    };
  }

  if (options.installMode === 'npx') {
    return {
      args: [CBS_LANGUAGE_SERVER_BINARY_NAME, ...STDIO_ARGS],
      command: options.platform === 'win32' ? 'npx.cmd' : 'npx',
      cwd: options.workspaceRootPath ?? undefined,
      detail:
        'Using `npx cbs-language-server --stdio`. This mode expects npm/npx to be available in the environment.',
      installMode: 'npx',
      kind: 'standalone',
      source: 'npx',
    };
  }

  return {
    args: STDIO_ARGS,
    command: options.platform === 'win32'
      ? `${CBS_LANGUAGE_SERVER_BINARY_NAME}.cmd`
      : CBS_LANGUAGE_SERVER_BINARY_NAME,
    cwd: options.workspaceRootPath ?? undefined,
    detail:
      'Using global `cbs-language-server --stdio`. This mode expects the binary to be available on PATH.',
    installMode: 'global',
    kind: 'standalone',
    source: 'global',
  };
}

/**
 * resolvePathOverride 함수.
 * 상대 경로 override를 workspace root 또는 extension root 기준 절대 경로로 바꿈.
 *
 * @param pathOverride - 사용자가 설정한 executable path
 * @param workspaceRootPath - 첫 번째 workspace folder 경로
 * @param extensionRootPath - VS Code extension root 경로
 * @returns 절대 경로로 정규화된 override path
 */
function resolvePathOverride(
  pathOverride: string,
  workspaceRootPath: string | null,
  extensionRootPath: string,
): string {
  if (path.isAbsolute(pathOverride)) {
    return pathOverride;
  }

  return path.resolve(workspaceRootPath ?? extensionRootPath, pathOverride);
}
