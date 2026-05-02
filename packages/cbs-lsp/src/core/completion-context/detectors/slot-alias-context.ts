/**
 * slot macro first-argument alias completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/slot-alias-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { detectFirstArgumentContext } from './first-argument-context';

/**
 * detectSlotAliasContext 함수.
 * slot macro 첫 argument 위치를 slot alias completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns slot alias completion context 또는 null
 */
export function detectSlotAliasContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  return detectFirstArgumentContext(state, {
    macroName: 'slot',
    resultType: 'slot-aliases',
  });
}
