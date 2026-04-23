import process from 'node:process';
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

  const launchPlan = boundarySnapshot.launchPlan;

  const output = getOrCreateOutputChannel();

  if (launchPlan.kind === 'failure') {
    void handleLaunchFailure(launchPlan, output);
    return;
  }

  output.appendLine(`[CBS Language Server] ${launchPlan.detail}`);

  const serverOptions = createServerOptions(launchPlan);

  const clientOptions: LanguageClientOptions = {
    documentSelector: boundarySnapshot.clientOptions.documentSelector,
    outputChannel: output,
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(boundarySnapshot.clientOptions.fileWatcherPattern),
    },
    traceOutputChannel: output,
  };

  // CodeLens command ownership stays on the server as an advertised no-op, so the VS Code client does not register a local shim.
  client = new LanguageClient(
    'cbs-language-server',
    'CBS Language Server',
    serverOptions,
    clientOptions,
  );

  void client.start();
}

/**
 * Stop the CBS language client.
 * Disposes the language server connection.
 */
export async function stopCbsLanguageClient(): Promise<void> {
  if (!client) {
    outputChannel?.dispose();
    outputChannel = undefined;
    return;
  }

  await client.stop();
  client = undefined;
  outputChannel?.dispose();
  outputChannel = undefined;
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
  return {
    installMode:
      config.get<CbsLanguageServerSettings['installMode']>('installMode', defaults.installMode) ??
      defaults.installMode,
    launchMode:
      config.get<CbsLanguageServerSettings['launchMode']>('launchMode', defaults.launchMode) ??
      defaults.launchMode,
    pathOverride: config.get<string>('path', defaults.pathOverride) ?? defaults.pathOverride,
  };
}

/**
 * createServerOptions 함수.
 * resolved launch plan을 vscode-languageclient `ServerOptions`로 변환함.
 *
 * @param launchPlan - standalone 또는 embedded launch resolution 결과
 * @returns LanguageClient에 전달할 server options
 */
function createServerOptions(launchPlan: Exclude<CbsLanguageServerLaunchPlan, CbsLaunchFailure>): ServerOptions {
  if (launchPlan.kind === 'embedded') {
    return {
      run: {
        module: launchPlan.modulePath,
        transport: TransportKind.ipc,
      },
      debug: {
        module: launchPlan.modulePath,
        transport: TransportKind.ipc,
        options: { execArgv: ['--nolazy', '--inspect=6009'] },
      },
    };
  }

  return createStandaloneExecutable(launchPlan);
}

/**
 * createStandaloneExecutable 함수.
 * stdio attach용 executable payload를 구성함.
 *
 * @param launchPlan - standalone launch resolution 결과
 * @returns standalone executable server options
 */
function createStandaloneExecutable(launchPlan: Exclude<CbsLanguageServerLaunchPlan, CbsLaunchFailure | { kind: 'embedded' }>): Executable {
  return {
    args: [...launchPlan.args],
    command: launchPlan.command,
    options: launchPlan.cwd
      ? {
          cwd: launchPlan.cwd,
          env: process.env,
        }
      : {
          env: process.env,
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
    await vscode.commands.executeCommand('workbench.action.openSettings', 'risuWorkbench.cbs.server');
  }
}
