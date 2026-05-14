/**
 * .risulorebook CONTENT 섹션의 빠른 preview를 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/lorebook-preview.ts
 */

import { simulateCbsText, type CbsSimulationContextInput } from '../../simulator';

export interface LorebookContentPreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  output: string;
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>;
  coverageSummary: string;
}

/**
 * createLorebookContentPreview 함수.
 * `.risulorebook @@@ CONTENT` CBS source를 변경 없는 dry-run preview로 변환합니다.
 *
 * @param contentText - preview output으로 렌더링할 CONTENT 섹션 원문입니다.
 * @param context - caller가 preview 평가에 필요한 변수와 실행 문맥을 주입하기 위한 context입니다.
 * @returns preview output, diagnostics, coverage summary를 담은 결과입니다.
 */
export function createLorebookContentPreview(
  contentText: string,
  context: CbsSimulationContextInput = {},
): LorebookContentPreviewResult {
  const result = simulateCbsText(contentText, { ...context, executionMode: 'preview' });
  return {
    status: result.status,
    output: result.output,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      message: diagnostic.message,
      code: diagnostic.code,
    })),
    coverageSummary: `${result.coverage.totalMacros} macros, ${result.coverage.unknownMacros.length} unknown`,
  };
}
