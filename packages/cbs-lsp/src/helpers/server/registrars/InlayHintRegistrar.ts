/**
 * inlay hint handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/InlayHintRegistrar.ts
 */

import type { Connection, InlayHint, InlayHintParams } from 'vscode-languageserver/node';

import type { InlayHintProvider } from '../../../features/presentation';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface InlayHintRegistrarContext {
  connection: Connection;
  inlayHintProvider: InlayHintProvider;
  requestRunner: RequestHandlerRunner;
}

/**
 * InlayHintRegistrar 클래스.
 * textDocument/inlayHint registration을 server helper에서 분리함.
 */
export class InlayHintRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly inlayHintProvider: InlayHintProvider;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * inlay hint handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - inlay hint registrar 의존성 모음
   */
  constructor(context: InlayHintRegistrarContext) {
    this.connection = context.connection;
    this.inlayHintProvider = context.inlayHintProvider;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/inlayHint handler를 등록함.
   */
  register(): void {
    this.connection.languages.inlayHint.on((params: InlayHintParams, cancellationToken): InlayHint[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'inlayHint',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.inlayHintProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
