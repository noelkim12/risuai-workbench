/**
 * CBS language client boundary seam.
 * Pure, testable snapshot of the official VS Code client forwarding contract.
 * Does not depend on the vscode extension host; safe to import from Node scripts.
 * @file packages/vscode/src/lsp/cbsLanguageClientBoundary.ts
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type CbsLanguageServerLaunchPlan,
  type CbsLanguageServerSettings,
  resolveCbsLanguageServerLaunch,
} from './cbsLanguageServerLaunch';

// Inline constants matching vscode-languageclient TransportKind to avoid
// requiring the package outside the extension host.
const TRANSPORT_STDIO = 0;
const TRANSPORT_IPC = 1;

type DocumentSelector = Array<{ scheme: string; pattern: string }>;

type ServerOptions =
  | {
      run: { module: string; transport: number };
      debug: { module: string; transport: number; options?: { execArgv: string[] } };
    }
  | {
      args: readonly string[];
      command: string;
      options?: { cwd?: string; env: NodeJS.ProcessEnv };
      transport: number;
    };

/**
 * CBS-bearing document selectors.
 * These are the only file types that should trigger the CBS language server.
 */
export const CBS_DOCUMENT_SELECTORS: DocumentSelector = [
  { scheme: 'file', pattern: '**/*.risulorebook' },
  { scheme: 'file', pattern: '**/*.risuregex' },
  { scheme: 'file', pattern: '**/*.risuprompt' },
  { scheme: 'file', pattern: '**/*.risuhtml' },
  { scheme: 'file', pattern: '**/*.risulua' },
];

/**
 * Pure inputs for `buildCbsClientBoundarySnapshot`.
 * Mirrors the VS Code context the client reads at activation time.
 */
export interface CbsClientBoundaryInputs {
  extensionPath: string;
  settings: CbsLanguageServerSettings;
  workspaceFolders: ReadonlyArray<{ fsPath: string }>;
}

/**
 * Snapshot of the official VS Code client boundary decisions.
 * Includes launch plan, transport, client options, and failure UX.
 */
export interface CbsClientBoundarySnapshot {
  clientOptions: {
    documentSelector: DocumentSelector;
    fileWatcherPattern: string;
  };
  failureInfo: {
    actions: readonly string[];
    attemptedModes: readonly string[];
    detail: string;
    recovery: string;
    userMessage: string;
  } | null;
  forwardedWorkspaceRootPath: string | null;
  initializePayloadPreview: {
    clientCapabilities: {
      workspaceFolders: true;
    };
    rootPath: string | null;
    rootUri: string | null;
    workspaceFolders:
      | Array<{
          fsPath: string;
          name: string;
          uri: string;
        }>
      | null;
  };
  launchPlan: CbsLanguageServerLaunchPlan;
  serverOptions: ServerOptions | null;
  transport: 'stdio' | 'ipc' | null;
}

/**
 * toInitializeWorkspaceFolders 함수.
 * VS Code workspace folder 목록을 initialize payload preview shape로 정규화함.
 *
 * @param workspaceFolders - activation 시점의 workspace folder 목록
 * @returns initialize.workspaceFolders에 들어갈 preview 배열 또는 null
 */
function toInitializeWorkspaceFolders(
  workspaceFolders: ReadonlyArray<{ fsPath: string }>,
): CbsClientBoundarySnapshot['initializePayloadPreview']['workspaceFolders'] {
  if (workspaceFolders.length === 0) {
    return null;
  }

  return workspaceFolders.map((workspaceFolder) => ({
    fsPath: workspaceFolder.fsPath,
    name: path.basename(workspaceFolder.fsPath),
    uri: pathToFileURL(workspaceFolder.fsPath).toString(),
  }));
}

/**
 * createServerOptions 함수.
 * resolved launch plan을 vscode-languageclient `ServerOptions`로 변환함.
 *
 * @param launchPlan - standalone 또는 embedded launch resolution 결과
 * @returns LanguageClient에 전달할 server options
 */
function createServerOptions(
  launchPlan: Exclude<CbsLanguageServerLaunchPlan, { kind: 'failure' }>,
): ServerOptions {
  if (launchPlan.kind === 'embedded') {
    return {
      run: {
        module: launchPlan.modulePath,
        transport: TRANSPORT_IPC,
      },
      debug: {
        module: launchPlan.modulePath,
        options: { execArgv: ['--nolazy', '--inspect=6009'] },
        transport: TRANSPORT_IPC,
      },
    };
  }

  return {
    args: [...launchPlan.args],
    command: launchPlan.command,
    options: launchPlan.cwd
      ? { cwd: launchPlan.cwd, env: process.env }
      : { env: process.env },
    transport: TRANSPORT_STDIO,
  };
}

/**
 * buildCbsClientBoundarySnapshot 함수.
 * VS Code client boundary가 실제로 전달/결정하는 값을 순수 계산으로 스냅샷함.
 * launch resolver, transport 선택, document selector, file watcher, multi-root reduction 등을 포함.
 *
 * @param inputs - extension 경로, 설정, workspace folder 목록
 * @param exists - 파일 존재 여부를 검사하는 seam (기본: fs.existsSync)
 * @returns client boundary 전체 스냅샷
 */
export function buildCbsClientBoundarySnapshot(
  inputs: CbsClientBoundaryInputs,
  exists: (filePath: string) => boolean = existsSync,
): CbsClientBoundarySnapshot {
  const workspaceRootPath = inputs.workspaceFolders[0]?.fsPath ?? null;
  const initializeWorkspaceFolders = toInitializeWorkspaceFolders(inputs.workspaceFolders);

  const launchPlan = resolveCbsLanguageServerLaunch({
    extensionRootPath: inputs.extensionPath,
    settings: inputs.settings,
    workspaceRootPath,
    exists,
  });

  if (launchPlan.kind === 'failure') {
    return {
      clientOptions: {
        documentSelector: CBS_DOCUMENT_SELECTORS,
        fileWatcherPattern: '**/.risu*',
      },
      failureInfo: {
        actions: ['Open Output', 'Open Settings'],
        attemptedModes: launchPlan.attemptedModes,
        detail: launchPlan.detail,
        recovery: launchPlan.recovery,
        userMessage: `CBS Language Server could not start. ${launchPlan.detail}`,
      },
      forwardedWorkspaceRootPath: workspaceRootPath,
      initializePayloadPreview: {
        clientCapabilities: {
          workspaceFolders: true,
        },
        rootPath: workspaceRootPath,
        rootUri: workspaceRootPath ? pathToFileURL(workspaceRootPath).toString() : null,
        workspaceFolders: initializeWorkspaceFolders,
      },
      launchPlan,
      serverOptions: null,
      transport: null,
    };
  }

  const serverOptions = createServerOptions(launchPlan);
  const transport = launchPlan.kind === 'standalone' ? 'stdio' : 'ipc';

  return {
    clientOptions: {
      documentSelector: CBS_DOCUMENT_SELECTORS,
      fileWatcherPattern: '**/.risu*',
    },
    failureInfo: null,
    forwardedWorkspaceRootPath: workspaceRootPath,
    initializePayloadPreview: {
      clientCapabilities: {
        workspaceFolders: true,
      },
      rootPath: workspaceRootPath,
      rootUri: workspaceRootPath ? pathToFileURL(workspaceRootPath).toString() : null,
      workspaceFolders: initializeWorkspaceFolders,
    },
    launchPlan,
    serverOptions,
    transport,
  };
}
