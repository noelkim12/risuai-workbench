/**
 * workspace symbol handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/WorkspaceSymbolRegistrar.ts
 */

import type {
  CancellationToken,
  Connection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from 'vscode-languageserver/node';

import type { WorkspaceSymbolProvider } from '../../../features/workspaceSymbol';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface WorkspaceSymbolRegistrarContext {
  connection: Connection;
  requestRunner: RequestHandlerRunner;
  workspaceSymbolProvider: WorkspaceSymbolProvider;
}

/**
 * WorkspaceSymbolRegistrar 클래스.
 * workspace/symbol registration을 server helper에서 분리함.
 */
export class WorkspaceSymbolRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly requestRunner: RequestHandlerRunner;
  private readonly workspaceSymbolProvider: WorkspaceSymbolProvider;

  /**
   * constructor 함수.
   * workspace symbol handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - workspace symbol registrar 의존성 모음
   */
  constructor(context: WorkspaceSymbolRegistrarContext) {
    this.connection = context.connection;
    this.requestRunner = context.requestRunner;
    this.workspaceSymbolProvider = context.workspaceSymbolProvider;
  }

  /**
   * register 함수.
   * workspace/symbol handler를 optional connection surface에 등록함.
   */
  register(): void {
    const workspaceSymbolConnection = this.connection as Connection & {
      onWorkspaceSymbol?: (
        handler: (params: WorkspaceSymbolParams, cancellationToken: CancellationToken) => SymbolInformation[],
      ) => unknown;
    };
    workspaceSymbolConnection.onWorkspaceSymbol?.((params, cancellationToken): SymbolInformation[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'workspaceSymbol',
        getUri: () => 'workspace://symbol',
        params,
        run: () => this.workspaceSymbolProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
