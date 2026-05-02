/**
 * OpenBrace token-stream fallback completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/fallback-open-brace-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { routeMacroArgumentContext } from './macro-argument-context';
import { detectWhenOperatorContext } from './when-operator-context';

/**
 * detectFallbackOpenBraceContext 함수.
 * 더 구체적인 detector가 실패한 뒤 OpenBrace 주변 token stream으로 문맥을 복원함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns fallback completion context 또는 null
 */
export function detectFallbackOpenBraceContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, tokens } = state;
  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  const whenOperatorContext = detectWhenOperatorContext(state, { useSeparatorPrefix: false });
  if (whenOperatorContext) {
    return whenOperatorContext;
  }

  const nextToken = tokens[openBrace.index + 1];
  if (nextToken) {
    const nextType = nextToken.type;
    const nextStart = state.offsetOf(nextToken.range.start);
    const nextEnd = state.offsetOf(nextToken.range.end);

    if (fragmentLocalOffset >= openBrace.offset && fragmentLocalOffset <= nextStart) {
      if (nextType === TokenType.BlockStart) {
        return {
          type: 'block-functions',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
      if (nextType === TokenType.BlockEnd) {
        const blockKind = state.findOpenBlockKind();
        return {
          type: 'close-tag',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
          blockKind: blockKind ?? '',
        };
      }
      if (nextType === TokenType.ElseKeyword) {
        return {
          type: 'else-keyword',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
      if (nextType === TokenType.FunctionName) {
        return {
          type: 'all-functions',
          prefix: '',
          startOffset: openBrace.offset + 2,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    if (fragmentLocalOffset > nextEnd && nextType === TokenType.FunctionName) {
      const funcName = nextToken.value.toLowerCase();
      const separatorToken = tokens[openBrace.index + 2];
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
            callPolicy: 'any',
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
  }

  return {
    type: 'all-functions',
    prefix: '',
    startOffset: openBrace.offset + 2,
    endOffset: fragmentLocalOffset,
  };
}
