/**
 * LuaLS proxy request gating helpers for server feature handlers.
 * @file packages/cbs-lsp/src/helpers/server/lua/LuaLsRequestGate.ts
 */

import type { Range as LSPRange } from 'vscode-languageserver/node';

import type { FragmentAnalysisRequest } from '../../../core';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../../../indexer';
import { shouldRouteDocumentToLuaLs as resolveShouldRouteDocumentToLuaLs } from '../../../providers/lua/lualsDocuments';
import { isLuaArtifactPath } from '../../../utils/oversized-lua';
import { CbsLspPathHelper } from '../../path-helper';

export type LuaLsRequestResolver = (uri: string) => FragmentAnalysisRequest | null;

export interface LuaLsRoutingContext {
  filePath: string;
  request: FragmentAnalysisRequest | null;
  routedToLuaLs: boolean;
  skipLuaLsProxy: boolean;
  uri: string;
  isInsideCbsMacro(position: LSPRange['start']): boolean;
  sourceLabel(proxySource: string): string;
}

/**
 * shouldSkipLuaLsProxyForRequest 함수.
 * oversized `.risulua` request에서 LuaLS proxy timeout 경로를 막음.
 *
 * @param request - 현재 문서의 fragment analysis request
 * @returns LuaLS proxy 호출을 건너뛰어야 하면 true
 */
export function shouldSkipLuaLsProxyForRequest(
  request: FragmentAnalysisRequest | null,
  filePath?: string,
): boolean {
  if (!request) {
    return filePath ? isLuaArtifactPath(filePath) : false;
  }

  return request.text.length > MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH;
}

/**
 * isPositionInsideCbsMacro 함수.
 * 현재 위치가 `.risulua` 안의 CBS macro 범위 안에 있는지 판별함.
 *
 * @param text - 검사할 host 문서 텍스트
 * @param position - 검사할 host 문서 위치
 * @returns CBS macro 내부 위치면 true
 */
export function isPositionInsideCbsMacro(text: string, position: LSPRange['start']): boolean {
  const lines = text.split(/\n/u);
  const line = lines[position.line];
  if (line === undefined || position.character > line.length) {
    return false;
  }

  const prefix = line.slice(0, position.character);
  const macroStart = prefix.lastIndexOf('{{');
  if (macroStart === -1) {
    return false;
  }

  const closeBeforeMacro = prefix.lastIndexOf('}}');
  if (closeBeforeMacro > macroStart) {
    return false;
  }

  const macroEnd = line.indexOf('}}', macroStart + 2);
  return macroEnd === -1 || position.character <= macroEnd + 2;
}

/**
 * LuaLsRequestGate 클래스.
 * LuaLS 관련 handler가 공유하는 URI 라우팅과 proxy skip 계산을 한 곳에서 처리함.
 */
export class LuaLsRequestGate {
  private readonly resolveRequest: LuaLsRequestResolver;

  /**
   * constructor 함수.
   * request resolver를 보관해 LuaLS 라우팅된 문서에서만 분석 request를 해석함.
   *
   * @param resolveRequest - 문서 URI를 fragment analysis request로 변환하는 함수
   */
  constructor(resolveRequest: LuaLsRequestResolver) {
    this.resolveRequest = resolveRequest;
  }

  /**
   * resolve 함수.
   * URI에서 LuaLS 라우팅 context를 만들고 기존 proxy skip/source 규칙을 보존함.
   *
   * @param uri - LSP 요청 대상 문서 URI
   * @returns LuaLS handler에서 재사용할 routing context
   */
  resolve(uri: string): LuaLsRoutingContext {
    const filePath = CbsLspPathHelper.getFilePathFromUri(uri);
    const routedToLuaLs = this.shouldRouteDocumentToLuaLs(filePath);
    const request = routedToLuaLs ? this.resolveRequest(uri) : null;
    const skipLuaLsProxy = routedToLuaLs && shouldSkipLuaLsProxyForRequest(request, filePath);

    return {
      filePath,
      request,
      routedToLuaLs,
      skipLuaLsProxy,
      uri,
      isInsideCbsMacro: (position) => (request ? isPositionInsideCbsMacro(request.text, position) : false),
      sourceLabel: (proxySource) => (skipLuaLsProxy ? 'luaProxySkipped' : proxySource),
    };
  }

  /**
   * shouldRouteDocumentToLuaLs 함수.
   * filePath 기반 LuaLS 라우팅 판정을 gate API로 노출함.
   *
   * @param filePath - URI에서 해석한 파일 경로
   * @returns LuaLS proxy 대상 문서이면 true
   */
  shouldRouteDocumentToLuaLs(filePath: string): boolean {
    return resolveShouldRouteDocumentToLuaLs(filePath);
  }
}
