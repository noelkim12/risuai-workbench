/**
 * .risuhtml 문서의 sandboxed iframe preview를 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/html-preview-adapter.ts
 */

import type { CbsSimulationContextInput, CbsSimulationDiagnostic, CbsSimulationTraceEvent } from '../../simulator';
import { simulateCbsText } from '../../simulator';
import type { HtmlEditorState } from './document-model-types';

const HTML_PREVIEW_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'";

export interface HtmlMainEditorPreviewInput {
  profile?: { variables?: CbsSimulationContextInput };
  variables?: CbsSimulationContextInput;
  scriptsEnabled?: boolean;
}

export interface HtmlMainEditorPreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  title: string;
  output: string;
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>;
  trace: CbsSimulationTraceEvent[];
  metadata: {
    format: 'html';
    sandbox: '' | 'allow-scripts';
    csp: string;
    renderMode: 'iframe-srcdoc';
  };
}

/**
 * createHtmlMainEditorPreview 함수.
 * HTML source를 CBS preview로 치환하고 sandboxed iframe srcdoc metadata를 반환합니다.
 *
 * @param state - preview할 HTML 전체 원문을 담은 editor state입니다.
 * @param input - CBS 평가 변수와 script sandbox 허용 여부를 지정하기 위한 입력값입니다.
 * @returns iframe srcdoc에 넣을 HTML preview payload입니다.
 */
export function createHtmlMainEditorPreview(
  state: HtmlEditorState,
  input: HtmlMainEditorPreviewInput = {},
): HtmlMainEditorPreviewResult {
  const simulation = simulateCbsText(state.contentText, input.profile?.variables ?? input.variables);
  return {
    status: simulation.status,
    title: '.risuhtml Preview',
    output: createSandboxedHtmlSrcdoc(simulation.output, HTML_PREVIEW_CSP),
    diagnostics: simulation.diagnostics.map(toHtmlDiagnostic),
    trace: simulation.trace,
    metadata: {
      format: 'html',
      sandbox: input.scriptsEnabled ? 'allow-scripts' : '',
      csp: HTML_PREVIEW_CSP,
      renderMode: 'iframe-srcdoc',
    },
  };
}

/**
 * createSandboxedHtmlSrcdoc 함수.
 * iframe srcdoc 안에서 실제로 적용될 CSP meta를 포함한 문서를 생성합니다.
 *
 * @param bodyHtml - CBS preview 적용이 끝난 뒤 iframe body로 넣을 untrusted HTML입니다.
 * @param csp - iframe 문서 자체에 적용할 Content-Security-Policy 문자열입니다.
 * @returns iframe srcdoc에 넣을 전체 HTML 문서입니다.
 */
function createSandboxedHtmlSrcdoc(bodyHtml: string, csp: string): string {
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
 * @param value - meta tag attribute에 삽입할 원문 문자열입니다.
 * @returns HTML attribute에서 안전하게 사용할 escaped value입니다.
 */
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * toHtmlDiagnostic 함수.
 * CBS simulator diagnostic을 HTML preview DTO가 쓰는 최소 형태로 축약합니다.
 *
 * @param diagnostic - HTML source의 CBS 평가 중 simulator가 생성한 diagnostic입니다.
 * @returns HTML preview 결과에 포함할 diagnostic DTO입니다.
 */
function toHtmlDiagnostic(diagnostic: CbsSimulationDiagnostic): { severity: 'error' | 'warning' | 'info'; message: string; code?: string } {
  return {
    severity: diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
  };
}
