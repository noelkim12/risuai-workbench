/**
 * calc expression completion context detector and shared argument context helper.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/calc-expression-context.ts
 */

import { getCalcExpressionCompletionTarget, getCalcExpressionZone } from '../../calc-expression';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';

/**
 * createCalcArgumentContext 함수.
 * calc macro argument completion context shape를 한 곳에서 생성함.
 *
 * @param prefix - 현재 calc argument 입력 prefix
 * @param startOffset - 교체 범위 시작 offset
 * @param endOffset - 교체 범위 끝 offset
 * @returns calc expression completion context
 */
export function createCalcArgumentContext(
  prefix: string,
  startOffset: number,
  endOffset: number,
): CompletionTriggerContext {
  return {
    type: 'calc-expression',
    prefix,
    startOffset,
    endOffset,
    referenceKind: null,
  };
}

/**
 * detectCalcExpressionZoneContext 함수.
 * cursor가 calc sublanguage zone 안이면 최우선 calc completion context를 반환함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns calc expression zone completion context 또는 null
 */
export function detectCalcExpressionZoneContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const calcExpressionZone = getCalcExpressionZone(state.lookup);
  if (!calcExpressionZone) {
    return null;
  }

  const target = getCalcExpressionCompletionTarget(calcExpressionZone, state.fragmentLocalOffset);
  return {
    type: 'calc-expression',
    prefix: target.prefix,
    startOffset: target.startOffset,
    endOffset: target.endOffset,
    referenceKind: target.referenceKind,
  };
}
