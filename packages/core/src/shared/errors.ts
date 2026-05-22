/**
 * Core domain에서 공통으로 쓰는 error message 변환 유틸.
 * CLI 계층 의존성을 갖지 않는 pure helper임.
 * @file packages/core/src/shared/errors.ts
 */

/**
 * getErrorMessage 함수.
 * catch 블록에서 받은 unknown error 값을 사용자에게 보여줄 문자열로 변환함.
 *
 * @param error - catch 블록에서 전달된 unknown error 값
 * @returns error message 문자열
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.toString();
  }

  return String(error);
}
