/**
 * Webview request/correlation ID 생성 유틸.
 * @file packages/webview/src/lib/requestIds.ts
 */

/**
 * generateRandomSuffix 함수.
 * Browser-safe crypto로 8자리 무작위 접미사를 생성함.
 * `crypto.randomUUID`를 우선 사용하고, 미지원 시 `getRandomValues`로 대체함.
 *
 * @returns 16진수 무작위 문자열
 */
function generateRandomSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * createRequestId 함수.
 * Extension host와의 request/correlation 식별용 고유 ID를 생성함.
 * 선택적 kind 접두사를 붙여 요청 종류를 식별 가능하게 유지함.
 *
 * @param kind - 요청 종류 접두사 (예: 'preview', 'completion', 'edit'). 생략 시 타임스탬프-랜덤 형식만 사용
 * @returns `${kind}-${timestamp}-${random}` 형식의 고유 요청 ID
 */
export function createRequestId(kind?: string): string {
  const suffix = generateRandomSuffix();
  if (kind) {
    return `${kind}-${Date.now()}-${suffix}`;
  }
  return `${Date.now()}-${suffix}`;
}
