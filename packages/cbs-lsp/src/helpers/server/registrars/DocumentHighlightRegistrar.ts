/**
 * document highlight handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/DocumentHighlightRegistrar.ts
 */

import type { Connection, DocumentHighlight, DocumentHighlightParams } from 'vscode-languageserver/node';

import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface DocumentHighlightRegistrarContext {
  connection: Connection;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
}

/**
 * DocumentHighlightRegistrar 클래스.
 * CBS document highlights와 LuaLS fallback registration을 server helper에서 분리함.
 */
export class DocumentHighlightRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * document highlight handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - document highlight registrar 의존성 모음
   */
  constructor(context: DocumentHighlightRegistrarContext) {
    this.connection = context.connection;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/documentHighlight handler를 등록함.
   */
  register(): void {
    this.connection.onDocumentHighlight((params: DocumentHighlightParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<DocumentHighlightParams, DocumentHighlight[]>({
          empty: [],
          feature: 'documentHighlight',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideDocumentHighlightWithFallback(params, route, cancellationToken),
          summarize: (result) => ({
            count: result.length,
            source: route.sourceLabel('cbsAndLuaProxy'),
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'documentHighlight',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.luaLsFallbackService.provideDocumentHighlightCbsOnly(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
