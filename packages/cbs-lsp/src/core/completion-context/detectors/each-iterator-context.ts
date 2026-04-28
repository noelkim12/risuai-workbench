/**
 * #each block header iterator completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/each-iterator-context.ts
 */

import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';

/**
 * detectEachIteratorContext 함수.
 * #each header iterator 위치를 chat variable completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns #each iterator completion context 또는 null
 */
export function detectEachIteratorContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { content, fragmentLocalOffset, nodePath, nodeSpan } = state;

  if (nodeSpan?.category !== 'block-header') {
    return null;
  }

  let eachBlock = nodeSpan.owner.type === 'Block' && nodeSpan.owner.kind === 'each'
    ? nodeSpan.owner
    : null;
  if (!eachBlock) {
    for (let index = nodePath.length - 1; index >= 0; index -= 1) {
      const candidate = nodePath[index];
      if (candidate.type === 'Block' && candidate.kind === 'each') {
        eachBlock = candidate;
        break;
      }
    }
  }

  if (!eachBlock) {
    return null;
  }

  const openStartOffset = state.offsetOf(eachBlock.openRange.start);
  const openEndOffset = state.offsetOf(eachBlock.openRange.end);
  const headerStartOffset = openStartOffset + 2;
  const headerEndOffset = Math.max(headerStartOffset, openEndOffset - 2);
  if (fragmentLocalOffset < headerStartOffset || fragmentLocalOffset > headerEndOffset) {
    return null;
  }

  const headerRaw = content.slice(headerStartOffset, headerEndOffset);
  const headerMatch = /^(\s*#each\b)/iu.exec(headerRaw);
  if (!headerMatch) {
    return null;
  }

  const blockNameEnd = headerMatch[1]?.length ?? 0;
  const cursorOffsetInHeader = Math.max(0, fragmentLocalOffset - headerStartOffset);
  if (cursorOffsetInHeader < blockNameEnd) {
    return null;
  }

  const tailBeforeCursor = headerRaw.slice(blockNameEnd, cursorOffsetInHeader);
  const iteratorMatch = /^(\s*)(\S*)$/u.exec(tailBeforeCursor);
  if (!iteratorMatch) {
    return null;
  }

  const leadingWhitespaceLength = iteratorMatch[1]?.length ?? 0;
  const prefix = iteratorMatch[2] ?? '';
  const startOffset = headerStartOffset + blockNameEnd + leadingWhitespaceLength;

  return {
    type: 'variable-names',
    prefix,
    startOffset,
    endOffset: fragmentLocalOffset,
    kind: 'chat',
  };
}
