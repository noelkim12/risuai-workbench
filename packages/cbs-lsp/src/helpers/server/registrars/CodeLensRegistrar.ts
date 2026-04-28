/**
 * CodeLens handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/CodeLensRegistrar.ts
 */

import type { CodeLensParams, Connection } from 'vscode-languageserver/node';

import type { CodeLensProvider } from '../../../features/codelens';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface CodeLensRegistrarContext {
  codeLensProvider: CodeLensProvider;
  connection: Connection;
  requestRunner: RequestHandlerRunner;
}

/**
 * CodeLensRegistrar 클래스.
 * textDocument/codeLens registration을 server helper에서 분리함.
 */
export class CodeLensRegistrar implements FeatureRegistrar {
  private readonly codeLensProvider: CodeLensProvider;
  private readonly connection: Connection;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * CodeLens handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - CodeLens registrar 의존성 모음
   */
  constructor(context: CodeLensRegistrarContext) {
    this.codeLensProvider = context.codeLensProvider;
    this.connection = context.connection;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/codeLens handler를 등록함.
   */
  register(): void {
    this.connection.onCodeLens((params: CodeLensParams, cancellationToken) => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'codelens',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.codeLensProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
