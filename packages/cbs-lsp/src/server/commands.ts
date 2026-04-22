/**
 * CBS LSP server-side command registry.
 * @file packages/cbs-lsp/src/server/commands.ts
 */

import { ACTIVATION_CHAIN_CODELENS_COMMAND } from '../features/codelens';
import {
  LSPErrorCodes,
  ResponseError,
  type Connection,
  type ExecuteCommandOptions,
  type ExecuteCommandParams,
} from 'vscode-languageserver/node';

type ExecuteCommandHandler = (params: ExecuteCommandParams) => unknown | Promise<unknown>;

/**
 * createActivationSummaryNoOpHandler 함수.
 * informational CodeLens click이 unknown command UX로 번지지 않도록 server-owned no-op을 제공함.
 *
 * @returns 항상 null을 반환하는 executeCommand handler
 */
function createActivationSummaryNoOpHandler(): ExecuteCommandHandler {
  return async () => null;
}

const COMMAND_HANDLERS = new Map<string, ExecuteCommandHandler>([
  [ACTIVATION_CHAIN_CODELENS_COMMAND, createActivationSummaryNoOpHandler()],
]);

/**
 * createExecuteCommandProvider 함수.
 * 실제 server-side command가 있을 때만 executeCommand capability를 광고함.
 *
 * @returns 비어 있지 않은 command registry만 capability로 노출함
 */
export function createExecuteCommandProvider(): ExecuteCommandOptions | undefined {
  if (COMMAND_HANDLERS.size === 0) {
    return undefined;
  }

  return {
    commands: [...COMMAND_HANDLERS.keys()],
  };
}

/**
 * registerExecuteCommandHandler 함수.
 * server-side command registry가 비어 있지 않을 때만 executeCommand handler를 연결함.
 *
 * @param connection - command request를 받을 LSP connection
 */
export function registerExecuteCommandHandler(connection: Connection): void {
  if (COMMAND_HANDLERS.size === 0) {
    return;
  }

  connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
    const handler = COMMAND_HANDLERS.get(params.command);
    if (!handler) {
      throw new ResponseError(
        LSPErrorCodes.RequestFailed,
        `Unsupported server command: ${params.command}`,
      );
    }

    return handler(params);
  });
}
