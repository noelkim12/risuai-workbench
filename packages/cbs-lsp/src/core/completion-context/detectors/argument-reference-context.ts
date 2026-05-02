/**
 * arg macro first-argument parameter-index completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/argument-reference-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { resolveActiveLocalFunctionContext } from '../../local-functions';
import { detectFirstArgumentContext } from './first-argument-context';

/**
 * detectArgumentReferenceContext 함수.
 * active local function 안의 arg macro 첫 argument를 argument-index completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns argument-index completion context, guarded none context, 또는 null
 */
export function detectArgumentReferenceContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const firstArgumentContext = detectFirstArgumentContext(state, {
    macroName: 'arg',
    resultType: 'argument-indices',
  });
  if (!firstArgumentContext) {
    return null;
  }

  const activeFunctionContext = resolveActiveLocalFunctionContext(state.lookup);
  if (!activeFunctionContext || activeFunctionContext.declaration.parameters.length === 0) {
    return { type: 'none' };
  }

  return firstArgumentContext;
}
