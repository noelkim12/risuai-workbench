/**
 * VS Code webview CSP nonce 생성 유틸.
 * CSP nonce는 보안 목적이므로 CSPRNG로 생성함.
 * @file packages/vscode/src/shared/webviewNonce.ts
 */

import { randomBytes } from 'node:crypto';

/**
 * createWebviewNonce 함수.
 * VS Code webview CSP `script-src 'nonce-...'`에 사용할 암호학적으로 안전한 nonce를 생성함.
 * Node `crypto.randomBytes`를 사용해 예측 불가능성을 보장함.
 *
 * @returns base64 인코딩된 16바이트 무작위 nonce 문자열
 */
export function createWebviewNonce(): string {
  return randomBytes(16).toString('base64');
}
