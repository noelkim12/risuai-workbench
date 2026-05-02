/**
 * references handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/ReferencesRegistrar.ts
 */

import type { Connection, Location, ReferenceParams } from 'vscode-languageserver/node';

import type { ReferencesProvider } from '../../../features/navigation';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface ReferencesRegistrarContext {
  connection: Connection;
  createReferencesProvider: (uri: string) => ReferencesProvider;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
}

/**
 * ReferencesRegistrar 클래스.
 * CBS references와 LuaLS fallback registration을 server helper에서 분리함.
 */
export class ReferencesRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly createReferencesProvider: ReferencesRegistrarContext['createReferencesProvider'];
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * references handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - references registrar 의존성 모음
   */
  constructor(context: ReferencesRegistrarContext) {
    this.connection = context.connection;
    this.createReferencesProvider = context.createReferencesProvider;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/references handler를 등록함.
   */
  register(): void {
    this.connection.onReferences((params: ReferenceParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<ReferenceParams, Location[]>({
          empty: [],
          feature: 'references',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideReferencesWithFallback(params, route, cancellationToken),
          summarize: (result) => ({
            count: result.length,
            source: route.sourceLabel('cbsAndLuaProxy'),
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: [],
        feature: 'references',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.createReferencesProvider(params.textDocument.uri).provide(params, cancellationToken),
        summarize: (result) => ({ count: result.length }),
        token: cancellationToken,
      });
    });
  }
}
