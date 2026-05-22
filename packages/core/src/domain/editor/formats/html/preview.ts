/**
 * .risuhtml 문서의 sandboxed iframe preview를 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/formats/html/preview.ts
 */

import type { CbsSimulationContextInput, CbsSimulationTraceEvent } from '../../../../simulator';
import { simulateCbsText } from '../../../../simulator';
import type { HtmlEditorState } from '../../document-model/types';
import type { EditorPreviewDiagnostic } from '../../preview/types';
import { createPreviewDiagnostic } from '../../preview/create-preview-diagnostic';
import { HTML_PREVIEW_CSP, createSandboxedHtmlSrcdoc, resolveHtmlPreviewSandboxMode } from './preview-security';

export interface HtmlMainEditorPreviewInput {
  profile?: { variables?: CbsSimulationContextInput };
  variables?: CbsSimulationContextInput;
  scriptsEnabled?: boolean;
}

export interface HtmlMainEditorPreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  title: string;
  output: string;
  diagnostics: EditorPreviewDiagnostic[];
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
    diagnostics: simulation.diagnostics.map(createPreviewDiagnostic),
    trace: simulation.trace,
    metadata: {
      format: 'html',
      sandbox: resolveHtmlPreviewSandboxMode(input.scriptsEnabled),
      csp: HTML_PREVIEW_CSP,
      renderMode: 'iframe-srcdoc',
    },
  };
}
