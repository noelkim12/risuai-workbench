/**
 * Tokenized keyword and function-name completion detectors.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/token-keyword-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { routeMacroArgumentContext } from './macro-argument-context';

/**
 * detectElseKeywordContext 함수.
 * ElseKeyword token 위치를 else keyword completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns else keyword completion context 또는 null
 */
export function detectElseKeywordContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token } = state;
  if (!token || token.token.type !== TokenType.ElseKeyword) {
    return null;
  }

  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  return {
    type: 'else-keyword',
    prefix: '',
    startOffset: openBrace.offset + 3,
    endOffset: fragmentLocalOffset,
  };
}

/**
 * detectBlockStartContext 함수.
 * BlockStart token 위치를 block function completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns block function completion context 또는 null
 */
export function detectBlockStartContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token } = state;
  if (!token || token.token.type !== TokenType.BlockStart) {
    return null;
  }

  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  return {
    type: 'block-functions',
    prefix: token.token.value.slice(0, Math.max(0, fragmentLocalOffset - token.localStartOffset)),
    startOffset: openBrace.offset + 3,
    endOffset: fragmentLocalOffset,
  };
}

/**
 * detectFunctionNameContext 함수.
 * FunctionName token 위치를 argument completion 또는 all-functions completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns function-name completion context 또는 null
 */
export function detectFunctionNameContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token, tokens } = state;
  if (!token || token.token.type !== TokenType.FunctionName) {
    return null;
  }

  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  const funcName = token.token.value.toLowerCase();
  const nextTokenIndex = token.tokenIndex + 1;
  const separatorToken = tokens[nextTokenIndex];

  if (separatorToken?.type === TokenType.ArgumentSeparator) {
    const sepEnd = state.offsetOf(separatorToken.range.end);

    if (fragmentLocalOffset >= sepEnd) {
      const macroArgumentContext = routeMacroArgumentContext(state, {
        macroName: funcName,
        argumentIndex: state.inferArgumentIndexFromOpenBrace(openBrace.index),
        prefix: '',
        startOffset: sepEnd,
        endOffset: fragmentLocalOffset,
        metadataPolicy: 'any',
      });
      if (macroArgumentContext) {
        return macroArgumentContext;
      }
    }
  }

  return {
    type: 'all-functions',
    prefix: '',
    startOffset: openBrace.offset + 2,
    endOffset: fragmentLocalOffset,
  };
}
