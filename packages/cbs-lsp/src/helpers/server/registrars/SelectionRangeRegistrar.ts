/**
 * selection range handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/SelectionRangeRegistrar.ts
 */

import type { Connection, SelectionRange, SelectionRangeParams } from 'vscode-languageserver/node';

import type { SelectionRangeProvider } from '../../../features/selectionRange';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface SelectionRangeRegistrarContext {
  connection: Connection;
  requestRunner: RequestHandlerRunner;
  selectionRangeProvider: SelectionRangeProvider;
}

/**
 * SelectionRangeRegistrar 클래스.
 * textDocument/selectionRange registration을 server helper에서 분리함.
 */
export class SelectionRangeRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly requestRunner: RequestHandlerRunner;
  private readonly selectionRangeProvider: SelectionRangeProvider;

  /**
   * constructor 함수.
   * selection range handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - selection range registrar 의존성 모음
   */
  constructor(context: SelectionRangeRegistrarContext) {
    this.connection = context.connection;
    this.requestRunner = context.requestRunner;
    this.selectionRangeProvider = context.selectionRangeProvider;
  }

  /**
   * register 함수.
   * textDocument/selectionRange handler를 등록함.
   */
  register(): void {
    this.connection.onSelectionRanges((params: SelectionRangeParams, cancellationToken): SelectionRange[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'selectionRange',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.selectionRangeProvider.provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
