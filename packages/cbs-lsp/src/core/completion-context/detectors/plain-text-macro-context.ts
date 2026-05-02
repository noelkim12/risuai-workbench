/**
 * PlainText incomplete macro completion detector.
 * @file packages/cbs-lsp/src/core/completion-context/detectors/plain-text-macro-context.ts
 */

import { TokenType } from 'risu-workbench-core';
import type { CompletionTriggerContext } from '../../completion-context';
import type { CompletionDetectionState } from '../detection-state';
import { routeMacroArgumentContext } from './macro-argument-context';

/**
 * detectPlainTextMacroContext 함수.
 * tokenizer가 아직 macro로 분리하지 못한 PlainText incomplete syntax를 복원함.
 *
 * @param state - completion detector가 공유하는 cursor/token/node 상태
 * @returns PlainText 기반 completion context 또는 null
 */
export function detectPlainTextMacroContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token, tokens } = state;
  if (!token || token.token.type !== TokenType.PlainText) {
    return null;
  }

  const embeddedMacroContext = detectEmbeddedPlainTextMacroPrefixContext(state);
  if (embeddedMacroContext) {
    return embeddedMacroContext;
  }

  const openBrace = state.findOpenBraceToken();
  if (openBrace === null) {
    return null;
  }

  const nextToken = tokens[openBrace.index + 1];
  if (nextToken) {
    if (nextToken.type === TokenType.BlockStart) {
      return {
        type: 'block-functions',
        prefix: '',
        startOffset: openBrace.offset + 3,
        endOffset: fragmentLocalOffset,
      };
    }
    if (nextToken.type === TokenType.BlockEnd) {
      const blockKind = state.findOpenBlockKind();
      return {
        type: 'close-tag',
        prefix: '',
        startOffset: openBrace.offset + 3,
        endOffset: fragmentLocalOffset,
        blockKind: blockKind ?? '',
      };
    }
    if (nextToken.type === TokenType.ElseKeyword) {
      return {
        type: 'else-keyword',
        prefix: '',
        startOffset: openBrace.offset + 3,
        endOffset: fragmentLocalOffset,
      };
    }
    if (nextToken.type === TokenType.FunctionName) {
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
            calcPolicy: 'any',
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

function detectEmbeddedPlainTextMacroPrefixContext(
  state: CompletionDetectionState,
): CompletionTriggerContext | null {
  const { fragmentLocalOffset, token } = state;
  if (!token || token.token.type !== TokenType.PlainText) {
    return null;
  }

  const typedLength = Math.min(
    token.token.value.length,
    Math.max(0, fragmentLocalOffset - token.localStartOffset),
  );
  const typedText = token.token.value.slice(0, typedLength);
  const macroStart = typedText.lastIndexOf('{{');
  if (macroStart === -1) {
    return null;
  }

  const prefix = typedText.slice(macroStart + 2);
  const startOffset = token.localStartOffset + macroStart;
  const argumentSeparatorIndex = prefix.indexOf('::');
  if (argumentSeparatorIndex !== -1) {
    const functionName = prefix.slice(0, argumentSeparatorIndex).trim().toLowerCase();
    const lastArgumentSeparatorIndex = prefix.lastIndexOf('::');
    const argumentPrefix = prefix.slice(lastArgumentSeparatorIndex + 2);
    const argumentStartOffset = startOffset + 2 + lastArgumentSeparatorIndex + 2;
    const argumentIndex = prefix.slice(0, lastArgumentSeparatorIndex).split('::').length - 1;

    const macroArgumentContext = routeMacroArgumentContext(state, {
      macroName: functionName,
      argumentIndex,
      prefix: argumentPrefix,
      startOffset: argumentStartOffset,
      endOffset: fragmentLocalOffset,
      calcPolicy: 'first',
      whenPolicy: 'any',
      metadataPolicy: 'first',
      callPolicy: 'first',
      runCalcBeforeVariable: true,
      runWhenBeforeVariable: true,
    });
    if (macroArgumentContext) {
      return macroArgumentContext;
    }
  }

  if (prefix.startsWith('#')) {
    return {
      type: 'block-functions',
      prefix: prefix.slice(1),
      startOffset: startOffset + 2,
      endOffset: fragmentLocalOffset,
    };
  }

  if (prefix.startsWith('/')) {
    return {
      type: 'close-tag',
      prefix: prefix.slice(1),
      startOffset: startOffset + 3,
      endOffset: fragmentLocalOffset,
      blockKind: state.findOpenBlockKind() ?? '',
    };
  }

  return {
    type: 'all-functions',
    prefix,
    startOffset: startOffset + 2,
    endOffset: fragmentLocalOffset,
  };
}
