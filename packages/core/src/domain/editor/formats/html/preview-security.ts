/**
 * HTML preview의 CSP와 sandbox 정책을 관리하는 security module.
 * @file packages/core/src/domain/editor/formats/html/preview-security.ts
 */

/** HTML preview iframe에 적용하는 Content-Security-Policy. */
export const HTML_PREVIEW_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'";

/** HTML preview iframe sandbox attribute 값. */
export type HtmlPreviewSandboxMode = '' | 'allow-scripts';

/**
 * resolveHtmlPreviewSandboxMode 함수.
 * scriptsEnabled 설정에 따라 iframe sandbox attribute 값을 결정합니다.
 *
 * @param scriptsEnabled - 사용자가 script 실행을 허용했는지 여부
 * @returns sandbox attribute에 넣을 문자열
 */
export function resolveHtmlPreviewSandboxMode(scriptsEnabled?: boolean): HtmlPreviewSandboxMode {
  return scriptsEnabled ? 'allow-scripts' : '';
}

/**
 * createSandboxedHtmlSrcdoc 함수.
 * iframe srcdoc 안에서 실제로 적용될 CSP meta를 포함한 문서를 생성합니다.
 *
 * @param bodyHtml - CBS preview 적용이 끝난 뒤 iframe body로 넣을 untrusted HTML
 * @param csp - iframe 문서 자체에 적용할 Content-Security-Policy 문자열
 * @returns iframe srcdoc에 넣을 전체 HTML 문서
 */
export function createSandboxedHtmlSrcdoc(bodyHtml: string, csp: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('');
}

/**
 * escapeHtmlAttribute 함수.
 * srcdoc meta attribute에 들어갈 정책 문자열을 HTML attribute 안전 문자열로 변환합니다.
 *
 * @param value - meta tag attribute에 삽입할 원문 문자열
 * @returns HTML attribute에서 안전하게 사용할 escaped value
 */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
