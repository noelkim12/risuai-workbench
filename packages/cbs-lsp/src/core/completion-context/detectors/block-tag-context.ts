/**
 * Block close tag and close-brace completion detectors.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/block-tag-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { routeMacroArgumentContext } from './macro-argument-context';

/**
 * detectBlockEndContext 함수.
 * BlockEnd token 위치를 현재 block close-tag completion으로 라우팅함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns close-tag completion context 또는 null
 */
export function detectBlockEndContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token } = state;
  if (!token || token.token.type !== TokenType.BlockEnd) {
    return null;
  }

  const blockKind = state.findOpenBlockKind();
  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  return {
    type: 'close-tag',
    prefix: '',
    startOffset: openBrace.offset + 3,
    endOffset: fragmentLocalOffset,
    blockKind: blockKind ?? '',
  };
}

/**
 * detectCloseBraceContext 함수.
 * CloseBrace token에서는 argument completion을 우선하고 close-tag로 fallback함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns close-brace completion context 또는 null
 */
export function detectCloseBraceContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token, tokens } = state;
  if (!token || token.token.type !== TokenType.CloseBrace) {
    return null;
  }

  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  const tokenStart = state.offsetOf(token.token.range.start);
  const previousToken = tokens[token.tokenIndex - 1];
  const blockStartToken = tokens[openBrace.index + 1];
  if (previousToken?.type === TokenType.BlockStart) {
    const blockStartEnd = state.offsetOf(previousToken.range.end);
    if (fragmentLocalOffset === blockStartEnd) {
      return {
        type: 'block-functions',
        prefix: previousToken.value,
        startOffset: openBrace.offset + 3,
        endOffset: fragmentLocalOffset,
      };
    }
  }

  if (blockStartToken?.type === TokenType.BlockStart && previousToken?.type === TokenType.FunctionName) {
    const previousTokenEnd = state.offsetOf(previousToken.range.end);
    if (fragmentLocalOffset === previousTokenEnd) {
      return {
        type: 'block-functions',
        prefix: `${blockStartToken.value}${previousToken.value}`,
        startOffset: openBrace.offset + 3,
        endOffset: fragmentLocalOffset,
      };
    }
  }

  if (fragmentLocalOffset === openBrace.offset + 2 && fragmentLocalOffset <= tokenStart) {
    return {
      type: 'all-functions',
      prefix: '',
      startOffset: openBrace.offset + 2,
      endOffset: fragmentLocalOffset,
    };
  }

  const parentMacro = state.findParentMacro();
  if (parentMacro) {
    const macroName = parentMacro.name.toLowerCase();
    const macroNameStart = state.offsetOf(parentMacro.range.start);

    if (fragmentLocalOffset > macroNameStart) {
      const macroArgumentContext = routeMacroArgumentContext(state, {
        macroName,
        argumentIndex: state.inferArgumentIndexFromOpenBrace(openBrace.index),
        prefix: '',
        startOffset: fragmentLocalOffset,
        endOffset: fragmentLocalOffset,
        calcPolicy: 'any',
        metadataPolicy: 'any',
        callPolicy: 'any',
      });
      if (macroArgumentContext) {
        return macroArgumentContext;
      }
    }
  }

  const blockKind = state.findOpenBlockKind();
  return {
    type: 'close-tag',
    prefix: '',
    startOffset: openBrace.offset + 3,
    endOffset: fragmentLocalOffset,
    blockKind: blockKind ?? '',
  };
}
