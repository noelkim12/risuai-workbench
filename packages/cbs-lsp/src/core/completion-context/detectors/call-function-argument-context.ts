/**
 * call macro first-argument function-name completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/call-function-argument-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { detectFirstArgumentContext } from './first-argument-context';

/**
 * detectCallFunctionContext 함수.
 * call macro 첫 argument 위치를 function-name completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns call function-name completion context 또는 null
 */
export function detectCallFunctionContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  return detectFirstArgumentContext(state, {
    macroName: 'call',
    resultType: 'function-names',
  });
}
