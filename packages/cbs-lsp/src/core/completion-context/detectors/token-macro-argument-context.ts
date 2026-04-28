/**
 * Tokenized macro argument completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/token-macro-argument-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { routeMacroArgumentContext } from './macro-argument-context';

/**
 * detectTokenMacroArgumentContext 함수.
 * tokenized macro argument 위치를 variable 또는 macro-specific completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns macro argument completion context 또는 null
 */
export function detectTokenMacroArgumentContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, nodeSpan, token } = state;
  if (
    !token ||
    (token.token.type !== TokenType.Argument &&
      token.token.type !== TokenType.FunctionName &&
      token.token.type !== TokenType.ArgumentSeparator)
  ) {
    return null;
  }

  const parentMacro = state.findParentMacro();
  if (!parentMacro) {
    return null;
  }

  const macroName = parentMacro.name.toLowerCase();
  const macroNameStart = state.offsetOf(parentMacro.range.start);
  if (fragmentLocalOffset <= macroNameStart) {
    return null;
  }

  const tokenStart = state.offsetOf(token.token.range.start);
  const tokenEnd = state.offsetOf(token.token.range.end);

  if (
    nodeSpan?.category === 'argument' &&
    nodeSpan.owner.type === 'MacroCall' &&
    typeof nodeSpan.argumentIndex === 'number'
  ) {
    const prefixStart = token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
    return routeMacroArgumentContext(state, {
      macroName,
      argumentIndex: nodeSpan.argumentIndex,
      prefix: token.token.type === TokenType.Argument ? state.getTypedTokenPrefix() : '',
      startOffset: prefixStart,
      endOffset: fragmentLocalOffset,
      metadataPolicy: 'any',
      callPolicy: 'first',
      metadataPrefix: '',
      callPrefix: token.token.type === TokenType.Argument ? token.token.value.trim() : '',
    });
  }

  if (macroName !== 'metadata') {
    return null;
  }

  const prefixStart = token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
  return routeMacroArgumentContext(state, {
    macroName,
    argumentIndex: null,
    prefix: '',
    startOffset: prefixStart,
    endOffset: fragmentLocalOffset,
    metadataPolicy: 'any',
  });
}
