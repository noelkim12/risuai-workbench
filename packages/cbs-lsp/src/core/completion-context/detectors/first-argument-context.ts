/**
 * macro first-argument completion detector helper.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/first-argument-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';

export type FirstArgumentResultType = 'function-names' | 'argument-indices' | 'slot-aliases';

interface DetectFirstArgumentContextOptions {
  macroName: string;
  resultType: FirstArgumentResultType;
}

/**
 * detectFirstArgumentContext 함수.
 * macro 첫 argument 위치를 지정된 completion result type으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @param options - macro 이름과 반환할 completion context type
 * @returns first-argument completion context 또는 null
 */
export function detectFirstArgumentContext(
  state: CompletionDetectionState,
  options: DetectFirstArgumentContextOptions,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, nodeSpan, token, tokens } = state;
  const openBrace = state.findOpenBraceToken();
  if (!openBrace) {
    return null;
  }

  const functionNameToken = tokens[openBrace.index + 1];
  const separatorToken = tokens[openBrace.index + 2];
  if (
    functionNameToken?.type !== TokenType.FunctionName ||
    functionNameToken.value.toLowerCase() !== options.macroName ||
    separatorToken?.type !== TokenType.ArgumentSeparator
  ) {
    return null;
  }

  const separatorEnd = state.offsetOf(separatorToken.range.end);
  if (fragmentLocalOffset < separatorEnd) {
    return null;
  }

  const separatorCount = tokens.filter((candidate) => {
    if (candidate.type !== TokenType.ArgumentSeparator) {
      return false;
    }

    const candidateStart = state.offsetOf(candidate.range.start);
    return candidateStart >= openBrace.offset && candidateStart < fragmentLocalOffset;
  }).length;
  if (separatorCount > 1) {
    return null;
  }

  if (
    token?.token.type === TokenType.Argument &&
    nodeSpan?.category === 'argument' &&
    nodeSpan.owner.type === 'MacroCall' &&
    nodeSpan.owner.name.toLowerCase() === options.macroName &&
    nodeSpan.argumentIndex === 0
  ) {
    return {
      type: options.resultType,
      prefix: state.getTypedTokenPrefix(),
      startOffset: token.localStartOffset,
      endOffset: fragmentLocalOffset,
    };
  }

  return {
    type: options.resultType,
    prefix: '',
    startOffset: separatorEnd,
    endOffset: fragmentLocalOffset,
  };
}
