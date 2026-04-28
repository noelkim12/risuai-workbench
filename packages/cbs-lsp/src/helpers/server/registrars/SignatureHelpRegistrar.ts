/**
 * signature help handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/SignatureHelpRegistrar.ts
 */

import type { Connection, SignatureHelp, SignatureHelpParams } from 'vscode-languageserver/node';

import type { RequestHandlerRunner } from '../../../handlers/RequestHandlerRunner';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface SignatureHelpRegistrarContext {
  connection: Connection;
  luaLsFallbackService: LuaLsFallbackService;
  requestRunner: RequestHandlerRunner;
}

/**
 * SignatureHelpRegistrar 클래스.
 * CBS signature help와 LuaLS fallback registration을 server helper에서 분리함.
 */
export class SignatureHelpRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly luaLsFallbackService: LuaLsFallbackService;
  private readonly requestRunner: RequestHandlerRunner;

  /**
   * constructor 함수.
   * signature help handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - signature help registrar 의존성 모음
   */
  constructor(context: SignatureHelpRegistrarContext) {
    this.connection = context.connection;
    this.luaLsFallbackService = context.luaLsFallbackService;
    this.requestRunner = context.requestRunner;
  }

  /**
   * register 함수.
   * textDocument/signatureHelp handler를 등록함.
   */
  register(): void {
    this.connection.onSignatureHelp((params: SignatureHelpParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);

      if (route.routedToLuaLs) {
        return this.requestRunner.runAsync<SignatureHelpParams, SignatureHelp | null>({
          empty: null,
          feature: 'signature',
          getUri: (requestParams) => requestParams.textDocument.uri,
          params,
          recoverOnError: true,
          run: () => this.luaLsFallbackService.provideSignatureHelpWithFallback(params, route, cancellationToken),
          summarize: (result) => ({
            hasResult: result !== null,
            source: route.sourceLabel('cbsAndLuaProxy'),
          }),
          token: cancellationToken,
        });
      }

      return this.requestRunner.runSync({
        empty: null,
        feature: 'signature',
        getUri: (requestParams) => requestParams.textDocument.uri,
        params,
        run: () => this.luaLsFallbackService.provideSignatureHelpCbsOnly(params, cancellationToken),
        summarize: (result) => ({ hasResult: result !== null }),
        token: cancellationToken,
      });
    });
  }
}
