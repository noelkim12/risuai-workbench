/**
 * definition handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/DefinitionRegistrar.ts
 */

import type { Connection, DefinitionParams } from 'vscode-languageserver/node';

import type { DefinitionProvider } from '../../../features/definition';
import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { DefinitionResponse } from '../lua/LuaLsResponseMerge';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface DefinitionRegistrarContext {
  connection: Connection;
  createDefinitionProvider: (uri: string) => DefinitionProvider;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
}

/**
 * DefinitionRegistrar 클래스.
 * CBS definition과 LuaLS fallback registration을 server helper에서 분리함.
 */
export class DefinitionRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly createDefinitionProvider: DefinitionRegistrarContext['createDefinitionProvider'];
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * definition handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - definition registrar 의존성 모음
   */
  constructor(context: DefinitionRegistrarContext) {
    this.connection = context.connection;
    this.createDefinitionProvider = context.createDefinitionProvider;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/definition handler를 등록함.
   */
  register(): void {
    this.connection.onDefinition((params: DefinitionParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<DefinitionParams, DefinitionResponse | null>({
          empty: null,
          feature: 'definition',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideDefinitionWithFallback(params, route, cancellationToken),
          summarize: (result) => ({
            count: Array.isArray(result) ? result.length : result ? 1 : 0,
            source: route.sourceLabel('cbsAndLuaProxy'),
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: null,
        feature: 'definition',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.createDefinitionProvider(params.textDocument.uri).provide(params, cancellationToken),
        summarize: (result) => ({
          count: Array.isArray(result) ? result.length : result ? 1 : 0,
        }),
        token: cancellationToken,
      });
    });
  }
}
