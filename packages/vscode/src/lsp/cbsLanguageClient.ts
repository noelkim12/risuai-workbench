import process from 'node:process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import {
  LanguageClient,
  type Executable,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import {
  defaultCbsLanguageServerSettings,
  type CbsLaunchFailure,
  type CbsLanguageServerLaunchPlan,
  type CbsLanguageServerSettings,
} from './cbsLanguageServerLaunch';
import { applyCbsCodeLensActivationTooltip } from './cbsCodeLensTooltip';
import {
  buildCbsClientBoundarySnapshot,
  CBS_DOCUMENT_SELECTORS,
  type CbsClientBoundaryInputs,
  type CbsClientBoundarySnapshot,
} from './cbsLanguageClientBoundary';

export {
  buildCbsClientBoundarySnapshot,
  CBS_DOCUMENT_SELECTORS,
  type CbsClientBoundaryInputs,
  type CbsClientBoundarySnapshot,
};

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let lastBoundarySnapshot: CbsClientBoundarySnapshot | undefined;
let clientReadyPromise: Promise<void> | undefined;

export const CBS_OCCURRENCE_NAVIGATION_COMMAND = 'risuWorkbench.cbs.openOccurrence';

export const CBS_MARKDOWN_TRUSTED_COMMANDS = [CBS_OCCURRENCE_NAVIGATION_COMMAND] as const;

const CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD = 'cbs/runtimeAvailability';

interface CbsRuntimeAvailabilitySnapshot {
  companions?: Array<{
    detail?: string;
    executablePath?: string | null;
    health?: string;
    status?: string;
  }>;
  failureModes?: Array<{
    active?: boolean;
    detail?: string;
    key?: string;
    recovery?: string;
    severity?: string;
  }>;
}

/**
 * Start the CBS language client.
 * Resolves standalone or embedded launch mode and starts the client.
 */
export function startCbsLanguageClient(context: vscode.ExtensionContext): void {
  if (client) {
    return;
  }

  const settings = readCbsLanguageServerSettings();
  const boundarySnapshot = buildCbsClientBoundarySnapshot({
    extensionPath: context.extensionPath,
    settings,
    workspaceFolders:
      vscode.workspace.workspaceFolders?.map((workspaceFolder) => ({
        fsPath: workspaceFolder.uri.fsPath,
      })) ?? [],
  });
  lastBoundarySnapshot = boundarySnapshot;

  const launchPlan = boundarySnapshot.launchPlan;

  const output = getOrCreateOutputChannel();

  if (launchPlan.kind === 'failure') {
    void handleLaunchFailure(launchPlan, output);
    return;
  }

  output.appendLine(`[CBS Language Server] ${launchPlan.detail}`);
  const timelineLogPath = createCbsTimelineLogPath(context);
  process.env.CBS_LSP_TIMELINE_LOG = timelineLogPath;
  output.appendLine(`[CBS Language Server] Timeline log: ${timelineLogPath}`);

  const serverOptions = createServerOptions(launchPlan, timelineLogPath, settings);

  const clientOptions: LanguageClientOptions = {
    documentSelector: boundarySnapshot.clientOptions.documentSelector,
    markdown: {
      isTrusted: { enabledCommands: CBS_MARKDOWN_TRUSTED_COMMANDS },
    },
    middleware: createCbsCodeLensTooltipMiddleware(),
    outputChannel: output,
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        boundarySnapshot.clientOptions.fileWatcherPattern,
      ),
    },
    traceOutputChannel: output,
  };

  // Server-advertised executeCommand ids are reserved for languageclient proxy commands;
  // activation CodeLens UI uses a separate risuWorkbench.* command to avoid duplicate registration.
  client = new LanguageClient(
    'cbs-language-server',
    'CBS Language Server',
    serverOptions,
    clientOptions,
  );
  const currentClient = client;

  void currentClient.start();
  clientReadyPromise = createClientReadyPromise(currentClient);
  void clientReadyPromise
    .then(() => reportCbsRuntimeAvailability(currentClient, output))
    .catch((error: unknown) => {
      output.appendLine(
        `[CBS Language Server] Could not query runtime availability: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

/**
 * createCbsCodeLensTooltipMiddleware 함수.
 * LSP CodeLens.data의 activation tooltip을 VS Code command tooltip로 복원함.
 *
 * @returns LanguageClient CodeLens middleware
 */
function createCbsCodeLensTooltipMiddleware(): NonNullable<LanguageClientOptions['middleware']> {
  return {
    async provideCodeLenses(document, token, next) {
      const lenses = await next(document, token);
      return lenses?.map(applyCbsCodeLensActivationTooltip);
    },
    async resolveCodeLens(codeLens, token, next) {
      const resolved = await next(codeLens, token);
      return resolved ? applyCbsCodeLensActivationTooltip(resolved) : resolved;
    },
  };
}

/**
 * Stop the CBS language client.
 * Disposes the language server connection.
 */
export async function stopCbsLanguageClient(): Promise<void> {
  if (!client) {
    outputChannel?.dispose();
    outputChannel = undefined;
    lastBoundarySnapshot = undefined;
    clientReadyPromise = undefined;
    return;
  }

  await client.stop();
  client = undefined;
  outputChannel?.dispose();
  outputChannel = undefined;
  lastBoundarySnapshot = undefined;
  clientReadyPromise = undefined;
}

/**
 * createClientReadyPromise 함수.
 * LanguageClient가 실제 running state에 도달할 때 resolve되는 promise를 만듦.
 *
 * @param currentClient - readiness를 기다릴 live LanguageClient 인스턴스
 * @returns running state 또는 startup failure를 반영하는 promise
 */
function createClientReadyPromise(currentClient: LanguageClient): Promise<void> {
  if (currentClient.isRunning()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stateSubscription.dispose();
      reject(
        new Error('Timed out while waiting for the CBS language client to reach running state.'),
      );
    }, 30_000);

    const settle = (callback: () => void): void => {
      clearTimeout(timeout);
      stateSubscription.dispose();
      callback();
    };

    const stateSubscription = currentClient.onDidChangeState(() => {
      if (currentClient.isRunning()) {
        settle(resolve);
      }
    });
  });
}

async function reportCbsRuntimeAvailability(
  currentClient: LanguageClient,
  output: vscode.OutputChannel,
): Promise<void> {
  const snapshot = await currentClient.sendRequest<CbsRuntimeAvailabilitySnapshot>(
    CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
    {},
  );
  const luaLsRuntime = snapshot.companions?.find((companion) => companion.status !== undefined);
  if (!luaLsRuntime) {
    return;
  }

  const status = luaLsRuntime.status ?? 'unknown';
  const executablePath = luaLsRuntime.executablePath ?? 'not resolved';
  output.appendLine(
    `[CBS Language Server] LuaLS sidecar status=${status} health=${luaLsRuntime.health ?? 'unknown'} executable=${executablePath}`,
  );

  if (status !== 'unavailable' && status !== 'crashed') {
    return;
  }

  const luaLsFailure = snapshot.failureModes?.find(
    (failureMode) => failureMode.active && failureMode.key === 'luals-unavailable',
  );
  const detail = luaLsFailure?.detail ?? luaLsRuntime.detail ?? 'LuaLS sidecar is unavailable.';
  const recovery =
    luaLsFailure?.recovery ??
    'Install lua-language-server, add it to PATH, or set risuWorkbench.cbs.server.luaLsPath.';
  output.appendLine(`[CBS Language Server] LuaLS unavailable: ${detail}`);
  output.appendLine(`[CBS Language Server] LuaLS recovery: ${recovery}`);
}

/**
 * readCbsLanguageServerSettings 함수.
 * VS Code configuration을 launch resolver가 쓰는 shape로 읽어 옴.
 *
 * @returns CBS language server launch 설정
 */
function readCbsLanguageServerSettings(): CbsLanguageServerSettings {
  const defaults = defaultCbsLanguageServerSettings();
  const config = vscode.workspace.getConfiguration('risuWorkbench.cbs.server');
  const configuredLuaLsPath =
    config.get<string>('luaLsPath', defaults.luaLsPath) ?? defaults.luaLsPath;
  return {
    installMode:
      config.get<CbsLanguageServerSettings['installMode']>('installMode', defaults.installMode) ??
      defaults.installMode,
    launchMode:
      config.get<CbsLanguageServerSettings['launchMode']>('launchMode', defaults.launchMode) ??
      defaults.launchMode,
    pathOverride: config.get<string>('path', defaults.pathOverride) ?? defaults.pathOverride,
    luaLsPath: configuredLuaLsPath.trim() || discoverLuaLsExecutablePath() || defaults.luaLsPath,
  };
}

function discoverLuaLsExecutablePath(): string | null {
  const configuredSumnekoPath = vscode.workspace
    .getConfiguration('Lua.misc')
    .get<string>('executablePath', '')
    .trim();
  if (configuredSumnekoPath && existsSync(configuredSumnekoPath)) {
    return configuredSumnekoPath;
  }

  const extensionPath = vscode.extensions.getExtension('sumneko.lua')?.extensionPath;
  if (!extensionPath) {
    return null;
  }

  const executableName =
    process.platform === 'win32' ? 'lua-language-server.exe' : 'lua-language-server';
  const candidates = [
    path.join(extensionPath, 'server', 'bin', executableName),
    path.join(extensionPath, 'server', 'bin-Linux', executableName),
    path.join(extensionPath, 'server', 'bin-macOS', executableName),
    path.join(extensionPath, 'server', 'bin-Windows', executableName),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * createServerOptions 함수.
 * resolved launch plan을 vscode-languageclient `ServerOptions`로 변환함.
 *
 * @param launchPlan - standalone 또는 embedded launch resolution 결과
 * @returns LanguageClient에 전달할 server options
 */
function createServerOptions(
  launchPlan: Exclude<CbsLanguageServerLaunchPlan, CbsLaunchFailure>,
  timelineLogPath: string,
  settings: CbsLanguageServerSettings,
): ServerOptions {
  const env = createCbsServerEnv(timelineLogPath, settings);
  if (launchPlan.kind === 'embedded') {
    return {
      run: {
        module: launchPlan.modulePath,
        options: { env },
        transport: TransportKind.ipc,
      },
      debug: {
        module: launchPlan.modulePath,
        transport: TransportKind.ipc,
        options: { env, execArgv: ['--nolazy', '--inspect=0'] },
      },
    };
  }

  return createStandaloneExecutable(launchPlan, timelineLogPath, settings);
}

/**
 * createCbsTimelineLogPath 함수.
 * Extension Host 로그 디렉터리 아래 CBS LSP timeline 파일 경로를 만듦.
 *
 * @param context - VS Code extension context
 * @returns 서버에 전달할 JSONL timeline 파일 경로
 */
function createCbsTimelineLogPath(context: vscode.ExtensionContext): string {
  return path.join(context.logUri.fsPath, 'cbs-lsp', 'timeline.jsonl');
}

/**
 * createCbsServerEnv 함수.
 * CBS LSP child process에 넘길 환경 변수와 timeline log 경로를 병합함.
 *
 * @param timelineLogPath - 서버가 append할 timeline JSONL 파일 경로
 * @returns 기존 process.env를 보존한 CBS server env
 */
function createCbsServerEnv(
  timelineLogPath: string,
  settings: CbsLanguageServerSettings,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CBS_LSP_TIMELINE_LOG: timelineLogPath,
  };

  const luaLsPath = settings.luaLsPath.trim();
  if (luaLsPath.length > 0) {
    env.CBS_LSP_LUALS_PATH = luaLsPath;
  }

  return env;
}

/**
 * createStandaloneExecutable 함수.
 * stdio attach용 executable payload를 구성함.
 *
 * @param launchPlan - standalone launch resolution 결과
 * @returns standalone executable server options
 */
function createStandaloneExecutable(
  launchPlan: Exclude<CbsLanguageServerLaunchPlan, CbsLaunchFailure | { kind: 'embedded' }>,
  timelineLogPath: string,
  settings: CbsLanguageServerSettings,
): Executable {
  const env = createCbsServerEnv(timelineLogPath, settings);

  return {
    args: [...launchPlan.args],
    command: launchPlan.command,
    options: launchPlan.cwd
      ? {
          cwd: launchPlan.cwd,
          env,
        }
      : {
          env,
        },
    transport: TransportKind.stdio,
  };
}

/**
 * getOrCreateOutputChannel 함수.
 * CBS language client launch 및 trace를 위한 output channel을 재사용함.
 *
 * @returns CBS 전용 output channel
 */
function getOrCreateOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel('CBS Language Server');
  return outputChannel;
}

/**
 * appendCbsLanguageClientOutputLine 함수.
 * CBS language client와 관련된 운영 로그를 공용 Output channel에 기록함.
 *
 * @param message - Output channel에 남길 한 줄 메시지
 */
export function appendCbsLanguageClientOutputLine(message: string): void {
  getOrCreateOutputChannel().appendLine(message);
}

/**
 * handleLaunchFailure 함수.
 * client resolution 실패를 output channel과 VS Code error message로 동시에 노출함.
 *
 * @param failure - launch resolution 실패 payload
 * @param output - 사용자에게 세부 로그를 보여줄 output channel
 */
async function handleLaunchFailure(
  failure: CbsLaunchFailure,
  output: vscode.OutputChannel,
): Promise<void> {
  output.show(true);
  output.appendLine(`[CBS Language Server] Failed to resolve launch plan: ${failure.detail}`);
  output.appendLine(`[CBS Language Server] Recovery: ${failure.recovery}`);
  if (failure.attemptedModes.length > 0) {
    output.appendLine(`[CBS Language Server] Attempted: ${failure.attemptedModes.join(' -> ')}`);
  }

  const selection = await vscode.window.showErrorMessage(
    `CBS Language Server could not start. ${failure.detail}`,
    'Open Output',
    'Open Settings',
  );

  if (selection === 'Open Output') {
    output.show(true);
    return;
  }

  if (selection === 'Open Settings') {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'risuWorkbench.cbs.server',
    );
  }
}

/**
 * Runtime state snapshot of the CBS language client.
 * Observable seam for extension-host tests.
 */
export interface CbsLanguageClientRuntimeState {
  /** The active LanguageClient instance, or undefined if not started / stopped. */
  client: LanguageClient | undefined;
  /** The output channel used by the client, or undefined if not created / disposed. */
  outputChannel: vscode.OutputChannel | undefined;
  /** The last boundary snapshot computed at start time. */
  boundarySnapshot: CbsClientBoundarySnapshot | undefined;
  /** Whether the client instance exists (does not guarantee ready state). */
  isStarted: boolean;
  /** The readiness promise captured when the client was launched. Tests can await this to detect running state or startup failure. */
  clientReadyPromise: Promise<void> | undefined;
}

/**
 * Get the current runtime state of the CBS language client.
 * Safe to call at any time; returns undefined fields when stopped.
 *
 * @returns Current runtime state snapshot
 */
export function getCbsLanguageClientRuntimeState(): CbsLanguageClientRuntimeState {
  return {
    client,
    outputChannel,
    boundarySnapshot: lastBoundarySnapshot,
    isStarted: client !== undefined,
    clientReadyPromise,
  };
}

/**
 * Await until the CBS language client is ready.
 * Resolves immediately if no client is running (e.g. launch failure).
 * Rejects if the client start promise rejects.
 *
 * @returns Promise that resolves when the client has started
 */
export async function awaitCbsLanguageClientReady(): Promise<void> {
  if (!clientReadyPromise) {
    return;
  }
  await clientReadyPromise;
}
