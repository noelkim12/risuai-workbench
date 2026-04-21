/**
 * LuaLS request/response proxy seam for read-only Lua language features.
 * @file packages/cbs-lsp/src/providers/lua/lualsProxy.ts
 */

import type { CancellationToken, Hover, HoverParams } from 'vscode-languageserver/node';

import type { LuaLsCompanionRuntime } from '../../core';
import { CbsLspPathHelper } from '../../helpers/path-helper';
import { createLuaLsTransportUri } from './lualsDocuments';

const DEFAULT_LUALS_HOVER_TIMEOUT_MS = 1_500;

export interface LuaLsRequestClient {
  getRuntime(): LuaLsCompanionRuntime;
  request<TResult>(method: string, params: unknown, timeoutMs?: number): Promise<TResult | null>;
}

/**
 * LuaLsProxy 클래스.
 * mirrored `.risulua` 문서를 대상으로 read-only LuaLS 요청을 프록시함.
 */
export class LuaLsProxy {
  constructor(private readonly client: LuaLsRequestClient) {}

  /**
   * getRuntime 함수.
   * 현재 LuaLS companion runtime 상태를 외부 trace/availability에서 읽을 수 있게 노출함.
   *
   * @returns 현재 LuaLS runtime snapshot
   */
  getRuntime(): LuaLsCompanionRuntime {
    return this.client.getRuntime();
  }

  /**
   * provideHover 함수.
   * source `.risulua` URI를 mirrored Lua URI로 바꿔 LuaLS `textDocument/hover` 요청을 전달함.
   *
   * @param params - host LSP hover params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS hover 결과, 준비되지 않았거나 실패하면 null
   */
  async provideHover(
    params: HoverParams,
    cancellationToken?: CancellationToken,
  ): Promise<Hover | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const transportUri = createLuaLsTransportUri(
      CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri),
    );

    try {
      return await this.client.request<Hover>(
        'textDocument/hover',
        {
          ...params,
          textDocument: {
            uri: transportUri,
          },
        },
        DEFAULT_LUALS_HOVER_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  }
}

/**
 * createLuaLsProxy 함수.
 * server wiring이 재사용할 기본 LuaLS proxy seam을 생성함.
 *
 * @param client - LuaLS request/response를 수행할 companion client
 * @returns Lua hover proxy provider seam
 */
export function createLuaLsProxy(client: LuaLsRequestClient): LuaLsProxy {
  return new LuaLsProxy(client);
}
