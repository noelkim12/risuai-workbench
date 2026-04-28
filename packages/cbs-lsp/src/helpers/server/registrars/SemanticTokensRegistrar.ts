/**
 * semantic tokens handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/SemanticTokensRegistrar.ts
 */

import type {
  Connection,
  SemanticTokensParams,
  SemanticTokensRangeParams,
} from 'vscode-languageserver/node';

import type { SemanticTokensProvider } from '../../../features/symbols';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { ServerFeatureRegistrarContext } from '../types';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface SemanticTokensRegistrarContext {
  connection: Connection;
  requestRunner: RequestHandlerRunner;
  resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];
  semanticTokensProvider: SemanticTokensProvider;
}

/**
 * SemanticTokensRegistrar 클래스.
 * full/range semantic tokens registration을 server helper에서 분리함.
 */
export class SemanticTokensRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly requestRunner: RequestHandlerRunner;
  private readonly resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];
  private readonly semanticTokensProvider: SemanticTokensProvider;

  /**
   * constructor 함수.
   * semantic tokens handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - semantic tokens registrar 의존성 모음
   */
  constructor(context: SemanticTokensRegistrarContext) {
    this.connection = context.connection;
    this.requestRunner = context.requestRunner;
    this.resolveRequest = context.resolveRequest;
    this.semanticTokensProvider = context.semanticTokensProvider;
  }

  /**
   * register 함수.
   * full semantic tokens와 range semantic tokens handler를 기존 순서대로 등록함.
   */
  register(): void {
    this.registerSemanticTokensHandler();
    this.registerSemanticTokensRangeHandler();
  }

  private registerSemanticTokensHandler(): void {
    this.connection.languages.semanticTokens.on((params: SemanticTokensParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: { data: [] },
        feature: 'semanticTokens',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request
            ? this.semanticTokensProvider.provide(params, request, cancellationToken)
            : { data: [] };
        },
        summarize: (result) => ({ count: result.data.length }),
        token: cancellationToken,
      });
    });
  }

  private registerSemanticTokensRangeHandler(): void {
    this.connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: { data: [] },
        feature: 'semanticTokensRange',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request
            ? this.semanticTokensProvider.provideRange(params, request, cancellationToken)
            : { data: [] };
        },
        summarize: (result) => ({ count: result.data.length }),
        token: cancellationToken,
      });
    });
  }
}
