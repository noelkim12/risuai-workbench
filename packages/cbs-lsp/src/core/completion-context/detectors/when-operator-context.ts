/**
 * #when block operator completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/when-operator-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';

interface DetectWhenOperatorContextOptions {
  useSeparatorPrefix: boolean;
}

/**
 * detectWhenOperatorContext 함수.
 * #when header 안의 마지막 separator 뒤를 operator completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @param options - token 위치와 token-between fallback의 prefix 정책
 * @returns when operator completion context 또는 null
 */
export function detectWhenOperatorContext(
  state: CompletionDetectionState,
  options: DetectWhenOperatorContextOptions,
): CompletionTriggerContext | null {
  const whenBlock = state.findWhenBlock();
  if (!whenBlock) {
    return null;
  }

  const headerEnd = state.offsetOf(whenBlock.openRange.end);
  const headerStart = state.offsetOf(whenBlock.openRange.start);
  if (state.fragmentLocalOffset > headerEnd || state.fragmentLocalOffset < headerStart) {
    return null;
  }

  const lastSeparator = state.findLastSeparatorBeforeCursor();
  if (lastSeparator === null || lastSeparator.offset < headerStart) {
    return null;
  }

  const sepEnd = state.offsetOf(lastSeparator.token.range.end);
  if (state.fragmentLocalOffset < sepEnd) {
    return null;
  }

  return {
    type: 'when-operators',
    prefix: options.useSeparatorPrefix ? state.getPrefixFromTokenEnd(lastSeparator.token) : '',
    startOffset: sepEnd,
    endOffset: state.fragmentLocalOffset,
  };
}
