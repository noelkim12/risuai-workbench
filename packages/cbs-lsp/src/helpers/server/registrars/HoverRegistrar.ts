/**
 * hover handler 등록을 담당하는 server registrar.
 * @file packages/cbs-lsp/src/helpers/server/registrars/HoverRegistrar.ts
 */

import type { CancellationToken, Connection, HoverParams } from 'vscode-languageserver/node';

import type { HoverProvider } from '../../../features/hover';
import { traceFeatureRequest, traceFeatureResult } from '../../../utils/server-tracing';
import type { LuaLsFallbackService } from '../lua/LuaLsFallbackService';
import type { FeatureRegistrar } from './FeatureRegistrar';

interface HoverRegistrarContext {
  connection: Connection;
  createHoverProvider: (uri: string) => HoverProvider;
  luaLsFallbackService: LuaLsFallbackService;
}

/**
 * shouldSkipRequest 함수.
 * 취소 토큰이 이미 취소된 요청인지 hover 공통 규칙으로 판별함.
 *
 * @param cancellationToken - 현재 callback에 전달된 취소 토큰
 * @returns 요청 처리를 바로 중단해야 하면 true
 */
function shouldSkipRequest(cancellationToken: CancellationToken | undefined): boolean {
  return cancellationToken?.isCancellationRequested ?? false;
}

/**
 * HoverRegistrar 클래스.
 * CBS hover와 LuaLS fallback registration을 server helper에서 분리함.
 */
export class HoverRegistrar implements FeatureRegistrar {
  private readonly connection: Connection;
  private readonly createHoverProvider: HoverRegistrarContext['createHoverProvider'];
  private readonly luaLsFallbackService: LuaLsFallbackService;

  /**
   * constructor 함수.
   * hover handler 등록에 필요한 의존성을 보관함.
   *
   * @param context - hover registrar 의존성 모음
   */
  constructor(context: HoverRegistrarContext) {
    this.connection = context.connection;
    this.createHoverProvider = context.createHoverProvider;
    this.luaLsFallbackService = context.luaLsFallbackService;
  }

  /**
   * register 함수.
   * textDocument/hover handler를 등록함.
   */
  register(): void {
    this.connection.onHover((params: HoverParams, cancellationToken) => {
      const route = this.luaLsFallbackService.resolveRoute(params.textDocument.uri);
      traceFeatureRequest(this.connection, 'hover', 'start', {
        uri: params.textDocument.uri,
        cancelled: shouldSkipRequest(cancellationToken),
        luaProxySkipped: route.skipLuaLsProxy,
      });
      if (shouldSkipRequest(cancellationToken)) {
        traceFeatureResult(this.connection, 'hover', 'cancelled', { uri: params.textDocument.uri });
        return null;
      }

      if (route.routedToLuaLs) {
        return this.luaLsFallbackService.provideHoverWithFallback(params, route, cancellationToken);
      }

      const result = this.createHoverProvider(params.textDocument.uri).provide(
        params,
        cancellationToken,
      );
      traceFeatureResult(this.connection, 'hover', 'end', {
        uri: params.textDocument.uri,
        hasResult: result !== null,
      });
      return result;
    });
  }
}
