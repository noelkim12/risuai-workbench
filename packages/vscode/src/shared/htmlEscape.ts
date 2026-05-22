/**
 * VS Code webview HTML 출력에 쓰는 text/attribute escape helper 모음.
 * @file packages/vscode/src/shared/htmlEscape.ts
 */

/**
 * escapeHtmlText 함수.
 * HTML text node에 들어갈 문자열에서 `&`와 `<`를 escape함.
 * text context에서는 `"`를 escape하지 않음.
 *
 * @param value - HTML text node에 삽입할 문자열
 * @returns text-safe 문자열
 */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/**
 * escapeHtmlAttribute 함수.
 * HTML attribute value(`"..."`)에 들어갈 문자열에서 `&`, `"`, `<`를 escape함.
 * text escaping과 달리 `"`까지 보호해야 attribute 경계가 깨지지 않음.
 *
 * @param value - HTML attribute value에 삽입할 문자열
 * @returns attribute-safe 문자열
 */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
