/**
 * LSP request cancellation helpers.
 * @file packages/cbs-lsp/src/utils/request-cancellation.ts
 */

import type { CancellationToken } from 'vscode-languageserver/node';

/**
 * isRequestCancelled 함수.
 * 취소 토큰이 이미 취소된 상태인지 안전하게 확인함.
 *
 * @param token - LSP handler에서 전달받은 취소 토큰
 * @returns 취소가 요청되었으면 true
 */
export function isRequestCancelled(token?: CancellationToken | null): boolean {
  return token?.isCancellationRequested ?? false;
}
