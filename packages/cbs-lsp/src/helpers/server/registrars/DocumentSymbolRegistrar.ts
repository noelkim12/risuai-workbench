/**
 * document symbol handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/DocumentSymbolRegistrar.ts
 */

import type {
  Connection,
  DocumentSymbol,
  DocumentSymbolParams,
  SymbolInformation,
} from 'vscode-languageserver/node';

import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface DocumentSymbolRegistrarContext {
  connection: Connection;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
}

/**
 * DocumentSymbolRegistrar 클래스.
 * CBS document symbols와 LuaLS fallback registration을 server helper에서 분리함.
 */
export class DocumentSymbolRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * document symbol handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - document symbol registrar 의존성 모음
   */
  constructor(context: DocumentSymbolRegistrarContext) {
    this.connection = context.connection;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/documentSymbol handler를 등록함.
   */
  register(): void {
    this.connection.onDocumentSymbol((params: DocumentSymbolParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<DocumentSymbolParams, DocumentSymbol[] | SymbolInformation[]>({
          empty: [],
          feature: 'documentSymbol',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideDocumentSymbolWithFallback(params, route, cancellationToken),
          summarize: (result) => ({
            count: result.length,
            source: route.sourceLabel('cbsAndLuaProxy'),
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'documentSymbol',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.luaLsFallbackService.provideDocumentSymbolCbsOnly(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
