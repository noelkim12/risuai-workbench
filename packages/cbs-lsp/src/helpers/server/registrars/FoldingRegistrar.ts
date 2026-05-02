/**
 * folding range handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/FoldingRegistrar.ts
 */

import type { Connection, FoldingRangeParams } from 'vscode-languageserver/node';

import type { FoldingProvider } from '../../../features/presentation';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { ServerFeatureRegistrarContext } from '../types';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface FoldingRegistrarContext {
  connection: Connection;
  foldingProvider: FoldingProvider;
  requestRunner: RequestHandlerRunner;
  resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];
}

/**
 * FoldingRegistrar 클래스.
 * textDocument/foldingRange registration을 server helper에서 분리함.
 */
export class FoldingRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly foldingProvider: FoldingProvider;
  private readonly requestRunner: RequestHandlerRunner;
  private readonly resolveRequest: ServerFeatureRegistrarContext['providers']['resolveRequest'];

  /**
   * constructor 함수.
   * folding handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - folding registrar 의존성 모음
   */
  constructor(context: FoldingRegistrarContext) {
    this.connection = context.connection;
    this.foldingProvider = context.foldingProvider;
    this.requestRunner = context.requestRunner;
    this.resolveRequest = context.resolveRequest;
  }

  /**
   * register 함수.
   * textDocument/foldingRange handler를 등록함.
   */
  register(): void {
    this.connection.onFoldingRanges((params: FoldingRangeParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'folding',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => {
          const request = this.resolveRequest(params.textDocument.uri);
          return request ? this.foldingProvider.provide(params, request, cancellationToken) : [];
        },
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
