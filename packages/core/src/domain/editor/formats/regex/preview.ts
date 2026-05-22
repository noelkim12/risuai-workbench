/**
 * .risuregex 문서의 Main Editor preview를 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/formats/regex/preview.ts
 */

import type { CbsSimulationContextInput } from '../../../../simulator';
import { simulateRisuRegexPreview } from '../../../../simulator/regex';
import type { SimulatorDiagnostic, SimulatorTraceEvent } from '../../../../simulator/regex';
import type { RegexEditorState } from '../../document-model/types';

export interface RegexMainEditorPreviewInput {
  sampleInput?: string;
  variables?: CbsSimulationContextInput;
}

export interface RegexMainEditorPreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  title: string;
  output: string;
  diagnostics: SimulatorDiagnostic[];
  trace: SimulatorTraceEvent[];
  metadata: {
    format: 'regex';
    matchCount: string;
    directiveCount: string;
  };
}

/**
 * createRegexMainEditorPreview 함수.
 * Regex editor state를 `.risuregex` 문서로 직렬화하고 simulator preview를 생성합니다.
 *
 * @param state - preview할 regex frontmatter, IN, OUT을 담은 Main Editor structured state입니다.
 * @param input - native match와 replacement preview에 사용할 sample input과 CBS 변수 context입니다.
 * @returns Main Editor preview panel용 regex preview 결과입니다.
 */
export function createRegexMainEditorPreview(
  state: RegexEditorState,
  input: RegexMainEditorPreviewInput = {},
): RegexMainEditorPreviewResult {
  const preview = simulateRisuRegexPreview({
    rawDocument: serializeRegexStateForPreview(state),
    sampleInput: input.sampleInput ?? '',
    context: input.variables,
  });

  return {
    status: preview.status,
    title: '.risuregex Preview',
    output: preview.replacementPreview.output,
    diagnostics: preview.diagnostics,
    trace: preview.trace,
    metadata: {
      format: 'regex',
      matchCount: String(preview.nativePreview.matches.length),
      directiveCount: String(preview.flags?.directives.length ?? 0),
    },
  };
}

/**
 * serializeRegexStateForPreview 함수.
 * Regex simulator가 읽을 canonical `.risuregex` source를 생성합니다.
 *
 * @param state - raw 문서로 되돌릴 regex structured state입니다.
 * @returns preview 전용 raw `.risuregex` 문서입니다.
 */
function serializeRegexStateForPreview(state: RegexEditorState): string {
  const frontmatterLines = Object.entries(state.frontmatter).map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`);
  return ['---', ...frontmatterLines, '---', '@@@ IN', state.inText, '@@@ OUT', state.outText, ''].join('\n');
}

/**
 * formatFrontmatterValue 함수.
 * 문자열 frontmatter 값을 preview parser 친화적인 한 줄 값으로 정규화합니다.
 *
 * @param value - YAML-like frontmatter line에 넣을 field value입니다.
 * @returns raw YAML-like scalar 문자열입니다.
 */
function formatFrontmatterValue(value: string): string {
  if (value === '') return '""';
  if (/[:#\n\r]|^\s|\s$/.test(value)) return JSON.stringify(value);
  return value;
}
