/**
 * formatting 계열 handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/FormattingRegistrar.ts
 */

import type {
  Connection,
  DocumentFormattingParams,
  DocumentOnTypeFormattingParams,
  DocumentRangeFormattingParams,
  TextEdit,
} from 'vscode-languageserver/node';

import type { FormattingProvider, OnTypeFormattingProvider } from '../../../features/editing';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface FormattingRegistrarContext {
  connection: Connection;
  formattingProvider: FormattingProvider;
  onTypeFormattingProvider: OnTypeFormattingProvider | undefined;
  requestRunner: RequestHandlerRunner;
}

/**
 * FormattingRegistrar 클래스.
 * document/range/on-type formatting registration을 server helper에서 분리함.
 */
export class FormattingRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly formattingProvider: FormattingProvider;
  private readonly onTypeFormattingProvider: OnTypeFormattingProvider | undefined;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * formatting handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - formatting registrar 의존성 모음
   */
  constructor(context: FormattingRegistrarContext) {
    this.connection = context.connection;
    this.formattingProvider = context.formattingProvider;
    this.onTypeFormattingProvider = context.onTypeFormattingProvider;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * formatting/rangeFormatting/onTypeFormatting handler를 기존 순서대로 등록함.
   */
  register(): void {
    this.registerFormattingHandler();
    this.registerRangeFormattingHandler();
    this.registerOnTypeFormattingHandler();
  }

  private registerFormattingHandler(): void {
    this.connection.onDocumentFormatting((params: DocumentFormattingParams, cancellationToken): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'formatting',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.formattingProvider.provide(params),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerRangeFormattingHandler(): void {
    this.connection.onDocumentRangeFormatting((
      params: DocumentRangeFormattingParams,
      cancellationToken,
    ): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'rangeFormatting',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.formattingProvider.provideRange(params),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }

  private registerOnTypeFormattingHandler(): void {
    this.connection.onDocumentOnTypeFormatting((
      params: DocumentOnTypeFormattingParams,
      cancellationToken,
    ): TextEdit[] => {
      return this.requestRunner.runSync({
        empty: [],
        feature: 'formattingOnType',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.onTypeFormattingProvider?.provide(params) ?? [],
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
