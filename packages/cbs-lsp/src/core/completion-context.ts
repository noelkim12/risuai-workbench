/**
 * CBS fragment cursor 위치에서 completion trigger context를 판별하는 유틸.
 * @file packages/cbs-lsp/src/core/completion-context.ts
 */

import { TokenType, type Range as CBSRange } from 'risu-workbench-core';
import { normalizeLookupKey } from '../analyzer/scope/lookup-key';
import {
  getVariableMacroArgumentKind,
  type ScopeVariableArgumentKind,
} from '../analyzer/scope/scope-macro-rules';
import { positionToOffset } from '../utils/position';
import { getCalcExpressionCompletionTarget, getCalcExpressionZone } from './calc-expression';
import type { FragmentCursorLookupResult } from './fragment-locator';
import { resolveActiveLocalFunctionContext } from './local-functions';

/**
 * Completion trigger context 판별 결과.
 * Completion provider가 어떤 후보군을 제공하고 어떤 범위를 교체할지 정의함.
 */
export type CompletionTriggerContext =
  | { type: 'all-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'block-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'else-keyword'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'close-tag'; prefix: string; startOffset: number; endOffset: number; blockKind: string }
  | {
      type: 'variable-names';
      prefix: string;
      startOffset: number;
      endOffset: number;
      kind: ScopeVariableArgumentKind;
    }
  | { type: 'metadata-keys'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'function-names'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'argument-indices'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'slot-aliases'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'when-operators'; prefix: string; startOffset: number; endOffset: number }
  | {
      type: 'calc-expression';
      prefix: string;
      startOffset: number;
      endOffset: number;
      referenceKind: 'chat' | 'global' | null;
    }
  | { type: 'none' };

/**
 * detectCompletionTriggerContext 함수.
 * fragment cursor lookup을 해석해 현재 위치에 맞는 completion 후보군을 결정함.
 *
 * @param lookup - fragment locator가 계산한 cursor lookup 결과
 * @returns cursor 위치에서 사용할 completion trigger context
 */
export function detectCompletionTriggerContext(
  lookup: FragmentCursorLookupResult,
): CompletionTriggerContext {
  const { fragmentLocalOffset, token, nodePath, nodeSpan, fragmentAnalysis } = lookup;
  const tokens = fragmentAnalysis.tokens;
  const calcExpressionZone = getCalcExpressionZone(lookup);

  if (calcExpressionZone) {
    const target = getCalcExpressionCompletionTarget(calcExpressionZone, fragmentLocalOffset);
    return {
      type: 'calc-expression',
      prefix: target.prefix,
      startOffset: target.startOffset,
      endOffset: target.endOffset,
      referenceKind: target.referenceKind,
    };
  }

  // nodePath를 뒤에서부터 훑어 cursor가 속한 가장 가까운 macro context를 찾음.
  const findParentMacro = (): { name: string; range: CBSRange } | null => {
    for (let i = nodePath.length - 1; i >= 0; i--) {
      const node = nodePath[i];
      if (node?.type === 'MacroCall') {
        return node as unknown as { name: string; range: CBSRange };
      }
    }
    return null;
  };

  // close-tag 후보를 좁히기 위해 현재 열려 있는 block kind를 nodePath에서 찾음.
  const findOpenBlockKind = (): string | null => {
    for (let i = nodePath.length - 1; i >= 0; i--) {
      const node = nodePath[i];
      if (node?.type === 'Block') {
        return node.kind;
      }
    }
    return null;
  };

  // #when header 안의 operator completion 여부를 판단할 때 쓸 block span을 찾음.
  const findWhenBlock = (): { openRange: CBSRange } | null => {
    for (const n of nodePath) {
      if (n.type === 'Block' && n.kind === 'when') {
        return n as { openRange: CBSRange };
      }
    }
    return null;
  };

  // cursor 이전의 마지막 유효 OpenBrace를 찾아 현재 macro context의 시작점을 고정함.
  const findOpenBraceToken = (): { index: number; offset: number } | null => {
    let startIndex = tokens.length - 1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const tStart = positionToOffset(fragmentAnalysis.fragment.content, t.range.start);
      const tEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);

      if (
        tEnd <= fragmentLocalOffset ||
        (tStart <= fragmentLocalOffset && tEnd > fragmentLocalOffset)
      ) {
        startIndex = i;
        break;
      }
    }

    for (let i = startIndex; i >= 0; i--) {
      const t = tokens[i];
      const tStart = positionToOffset(fragmentAnalysis.fragment.content, t.range.start);

      if (t.type === TokenType.OpenBrace) {
        return { index: i, offset: tStart };
      }
      if (t.type === TokenType.CloseBrace && i < startIndex) {
        return null;
      }
    }
    return null;
  };

  // cursor 앞의 마지막 ArgumentSeparator를 찾아 argument 기반 completion 범위를 계산함.
  const findLastSeparatorBeforeCursor = (): {
    token: (typeof tokens)[0];
    offset: number;
  } | null => {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const tEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);
      if (t.type === TokenType.ArgumentSeparator && tEnd <= fragmentLocalOffset) {
        return {
          token: t,
          offset: positionToOffset(fragmentAnalysis.fragment.content, t.range.start),
        };
      }
    }
    return null;
  };

  // raw text 재파싱 없이 token 끝부터 cursor까지의 prefix 역할을 보수적으로 계산함.
  const getPrefixFromTokenEnd = (t: (typeof tokens)[0]): string => {
    const tokenEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);
    if (fragmentLocalOffset <= tokenEnd) return '';
    // 불완전한 syntax는 raw slice에 의존하지 않고 전체 후보를 보여 주도록 빈 prefix로 둠.
    return '';
  };

  const getTypedTokenPrefix = (): string => {
    if (!token || fragmentLocalOffset <= token.localStartOffset) {
      return '';
    }

    const typedLength = Math.min(
      token.token.value.length,
      Math.max(0, fragmentLocalOffset - token.localStartOffset),
    );
    return token.token.value.slice(0, typedLength).trim();
  };

  const createVariableArgumentContext = (
    macroName: string,
    argumentIndex: number,
    prefix: string,
    startOffset: number,
    endOffset: number,
  ): CompletionTriggerContext | null => {
    const kind = getVariableMacroArgumentKind(normalizeLookupKey(macroName), argumentIndex);
    if (!kind) {
      return null;
    }

    return {
      type: 'variable-names',
      prefix,
      startOffset,
      endOffset,
      kind,
    };
  };

  const detectEachIteratorContext = (): CompletionTriggerContext | null => {
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

    const openStartOffset = positionToOffset(fragmentAnalysis.fragment.content, eachBlock.openRange.start);
    const openEndOffset = positionToOffset(fragmentAnalysis.fragment.content, eachBlock.openRange.end);
    const headerStartOffset = openStartOffset + 2;
    const headerEndOffset = Math.max(headerStartOffset, openEndOffset - 2);
    if (fragmentLocalOffset < headerStartOffset || fragmentLocalOffset > headerEndOffset) {
      return null;
    }

    const headerRaw = fragmentAnalysis.fragment.content.slice(headerStartOffset, headerEndOffset);
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
  };

  const inferArgumentIndexFromOpenBrace = (openBraceIndex: number): number => {
    const openBrace = tokens[openBraceIndex];
    if (!openBrace) {
      return 0;
    }

    const openBraceOffset = positionToOffset(fragmentAnalysis.fragment.content, openBrace.range.start);
    const separatorCount = tokens.filter((candidate) => {
      if (candidate.type !== TokenType.ArgumentSeparator) {
        return false;
      }

      const candidateStart = positionToOffset(fragmentAnalysis.fragment.content, candidate.range.start);
      return candidateStart >= openBraceOffset && candidateStart < fragmentLocalOffset;
    }).length;

    return Math.max(0, separatorCount - 1);
  };

  const detectPlainTextMacroPrefixContext = (): CompletionTriggerContext | null => {
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

      if (functionName === 'calc' && argumentIndex === 0) {
        return {
          type: 'calc-expression',
          prefix: argumentPrefix,
          startOffset: argumentStartOffset,
          endOffset: fragmentLocalOffset,
          referenceKind: null,
        };
      }

      if (functionName === '#when') {
        return {
          type: 'when-operators',
          prefix: argumentPrefix,
          startOffset: argumentStartOffset,
          endOffset: fragmentLocalOffset,
        };
      }

      const variableContext = createVariableArgumentContext(
        functionName,
        argumentIndex,
        argumentPrefix,
        argumentStartOffset,
        fragmentLocalOffset,
      );

      if (variableContext) {
        return variableContext;
      }

      if (functionName === 'metadata' && argumentIndex === 0) {
        return {
          type: 'metadata-keys',
          prefix: argumentPrefix,
          startOffset: argumentStartOffset,
          endOffset: fragmentLocalOffset,
        };
      }

      if (functionName === 'call' && argumentIndex === 0) {
        return {
          type: 'function-names',
          prefix: argumentPrefix,
          startOffset: argumentStartOffset,
          endOffset: fragmentLocalOffset,
        };
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
        blockKind: findOpenBlockKind() ?? '',
      };
    }

    return {
      type: 'all-functions',
      prefix,
      startOffset: startOffset + 2,
      endOffset: fragmentLocalOffset,
    };
  };

  const detectCallFunctionContext = (): CompletionTriggerContext | null => {
    const openBrace = findOpenBraceToken();
    if (!openBrace) {
      return null;
    }

    const functionNameToken = tokens[openBrace.index + 1];
    const separatorToken = tokens[openBrace.index + 2];
    if (
      functionNameToken?.type !== TokenType.FunctionName ||
      functionNameToken.value.toLowerCase() !== 'call' ||
      separatorToken?.type !== TokenType.ArgumentSeparator
    ) {
      return null;
    }

    const separatorEnd = positionToOffset(fragmentAnalysis.fragment.content, separatorToken.range.end);
    if (fragmentLocalOffset < separatorEnd) {
      return null;
    }

    const separatorCount = tokens.filter((candidate) => {
      if (candidate.type !== TokenType.ArgumentSeparator) {
        return false;
      }

      const candidateStart = positionToOffset(fragmentAnalysis.fragment.content, candidate.range.start);
      return candidateStart >= openBrace.offset && candidateStart < fragmentLocalOffset;
    }).length;
    if (separatorCount > 1) {
      return null;
    }

    if (
      token?.token.type === TokenType.Argument &&
      nodeSpan?.category === 'argument' &&
      nodeSpan.owner.type === 'MacroCall' &&
      nodeSpan.owner.name.toLowerCase() === 'call' &&
      nodeSpan.argumentIndex === 0
    ) {
      return {
        type: 'function-names',
        prefix: getTypedTokenPrefix(),
        startOffset: token.localStartOffset,
        endOffset: fragmentLocalOffset,
      };
    }

    return {
      type: 'function-names',
      prefix: '',
      startOffset: separatorEnd,
      endOffset: fragmentLocalOffset,
    };
  };

  const detectArgumentReferenceContext = (): CompletionTriggerContext | null => {
    const openBrace = findOpenBraceToken();
    if (!openBrace) {
      return null;
    }

    const functionNameToken = tokens[openBrace.index + 1];
    const separatorToken = tokens[openBrace.index + 2];
    if (
      functionNameToken?.type !== TokenType.FunctionName ||
      functionNameToken.value.toLowerCase() !== 'arg' ||
      separatorToken?.type !== TokenType.ArgumentSeparator
    ) {
      return null;
    }

    const separatorEnd = positionToOffset(fragmentAnalysis.fragment.content, separatorToken.range.end);
    if (fragmentLocalOffset < separatorEnd) {
      return null;
    }

    const separatorCount = tokens.filter((candidate) => {
      if (candidate.type !== TokenType.ArgumentSeparator) {
        return false;
      }

      const candidateStart = positionToOffset(fragmentAnalysis.fragment.content, candidate.range.start);
      return candidateStart >= openBrace.offset && candidateStart < fragmentLocalOffset;
    }).length;
    if (separatorCount > 1) {
      return null;
    }

    const activeFunctionContext = resolveActiveLocalFunctionContext(lookup);
    if (!activeFunctionContext || activeFunctionContext.declaration.parameters.length === 0) {
      return { type: 'none' };
    }

    if (
      token?.token.type === TokenType.Argument &&
      nodeSpan?.owner.type === 'MacroCall' &&
      nodeSpan.owner.name.toLowerCase() === 'arg' &&
      nodeSpan.argumentIndex === 0
    ) {
      return {
        type: 'argument-indices',
        prefix: getTypedTokenPrefix(),
        startOffset: token.localStartOffset,
        endOffset: fragmentLocalOffset,
      };
    }

    return {
      type: 'argument-indices',
      prefix: '',
      startOffset: separatorEnd,
      endOffset: fragmentLocalOffset,
    };
  };

  const detectSlotAliasContext = (): CompletionTriggerContext | null => {
    const openBrace = findOpenBraceToken();
    if (!openBrace) {
      return null;
    }

    const functionNameToken = tokens[openBrace.index + 1];
    const separatorToken = tokens[openBrace.index + 2];
    if (
      functionNameToken?.type !== TokenType.FunctionName ||
      functionNameToken.value.toLowerCase() !== 'slot' ||
      separatorToken?.type !== TokenType.ArgumentSeparator
    ) {
      return null;
    }

    const separatorEnd = positionToOffset(fragmentAnalysis.fragment.content, separatorToken.range.end);
    if (fragmentLocalOffset < separatorEnd) {
      return null;
    }

    const separatorCount = tokens.filter((candidate) => {
      if (candidate.type !== TokenType.ArgumentSeparator) {
        return false;
      }

      const candidateStart = positionToOffset(fragmentAnalysis.fragment.content, candidate.range.start);
      return candidateStart >= openBrace.offset && candidateStart < fragmentLocalOffset;
    }).length;
    if (separatorCount > 1) {
      return null;
    }

    if (
      token?.token.type === TokenType.Argument &&
      nodeSpan?.category === 'argument' &&
      nodeSpan.owner.type === 'MacroCall' &&
      nodeSpan.owner.name.toLowerCase() === 'slot' &&
      nodeSpan.argumentIndex === 0
    ) {
      return {
        type: 'slot-aliases',
        prefix: getTypedTokenPrefix(),
        startOffset: token.localStartOffset,
        endOffset: fragmentLocalOffset,
      };
    }

    return {
      type: 'slot-aliases',
      prefix: '',
      startOffset: separatorEnd,
      endOffset: fragmentLocalOffset,
    };
  };

  const slotAliasContext = detectSlotAliasContext();
  if (slotAliasContext) {
    return slotAliasContext;
  }

  const callFunctionContext = detectCallFunctionContext();
  if (callFunctionContext) {
    return callFunctionContext;
  }

  const argumentReferenceContext = detectArgumentReferenceContext();
  if (argumentReferenceContext) {
    return argumentReferenceContext;
  }

  const eachIteratorContext = detectEachIteratorContext();
  if (eachIteratorContext) {
    return eachIteratorContext;
  }

  // token type과 AST node span을 함께 사용해 cursor가 포함된 문맥을 우선 판별함.
  if (token) {
    const tokenStart = positionToOffset(fragmentAnalysis.fragment.content, token.token.range.start);
    const tokenEnd = positionToOffset(fragmentAnalysis.fragment.content, token.token.range.end);

    // Case 1: #when block header의 ArgumentSeparator 뒤에서는 operator completion을 제공함.
    const whenBlock = findWhenBlock();
    if (whenBlock) {
      const headerEnd = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlock.openRange.end,
      );
      const headerStart = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlock.openRange.start,
      );
      if (fragmentLocalOffset <= headerEnd && fragmentLocalOffset >= headerStart) {
        const lastSeparator = findLastSeparatorBeforeCursor();
        if (lastSeparator !== null && lastSeparator.offset >= headerStart) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            lastSeparator.token.range.end,
          );
          if (fragmentLocalOffset >= sepEnd) {
            return {
              type: 'when-operators',
              prefix: getPrefixFromTokenEnd(lastSeparator.token),
              startOffset: sepEnd,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // Case 2: 변수 macro의 argument 위치에서는 scope variable completion으로 라우팅함.
    if (
      token.token.type === TokenType.Argument ||
      token.token.type === TokenType.FunctionName ||
      token.token.type === TokenType.ArgumentSeparator
    ) {
      const parentMacro = findParentMacro();
      if (parentMacro) {
        const macroName = parentMacro.name.toLowerCase();
        const macroNameStart = positionToOffset(
          fragmentAnalysis.fragment.content,
          parentMacro.range.start,
        );

        if (fragmentLocalOffset > macroNameStart) {
          if (
            nodeSpan?.category === 'argument' &&
            nodeSpan.owner.type === 'MacroCall' &&
            typeof nodeSpan.argumentIndex === 'number'
          ) {
            const argumentIndex = nodeSpan.argumentIndex;
            const prefixStart = token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
            const variableContext = createVariableArgumentContext(
              macroName,
              argumentIndex,
              token.token.type === TokenType.Argument ? getTypedTokenPrefix() : '',
              prefixStart,
              fragmentLocalOffset,
            );
            if (variableContext) {
              return variableContext;
            }
          }

          if (macroName === 'metadata') {
            const prefixStart =
              token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
            return {
              type: 'metadata-keys',
              prefix: '',
              startOffset: prefixStart,
              endOffset: fragmentLocalOffset,
            };
          }

          if (
            macroName === 'call' &&
            nodeSpan?.category === 'argument' &&
            nodeSpan.owner.type === 'MacroCall' &&
            nodeSpan.argumentIndex === 0
          ) {
            return {
              type: 'function-names',
              prefix: token.token.type === TokenType.Argument ? token.token.value.trim() : '',
              startOffset: token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // Case 3: BlockEnd token 위에서는 현재 block에 맞는 close tag를 제안함.
    if (token.token.type === TokenType.BlockEnd) {
      const blockKind = findOpenBlockKind();
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'close-tag',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
          blockKind: blockKind ?? '',
        };
      }
    }

    // Case 4: CloseBrace token에서는 argument completion을 먼저 확인하고 close tag로 fallback함.
    if (token.token.type === TokenType.CloseBrace) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        const previousToken = tokens[token.tokenIndex - 1];
        const blockStartToken = tokens[openBrace.index + 1];
        if (previousToken?.type === TokenType.BlockStart) {
          const blockStartEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            previousToken.range.end,
          );
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
          const previousTokenEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            previousToken.range.end,
          );
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

        // macro argument 끝에서 호출된 completion은 macro별 argument 후보를 먼저 확인함.
        const parentMacro = findParentMacro();
        if (parentMacro) {
          const macroName = parentMacro.name.toLowerCase();
          const macroNameStart = positionToOffset(
            fragmentAnalysis.fragment.content,
            parentMacro.range.start,
          );

          if (fragmentLocalOffset > macroNameStart) {
            const openBraceIndex = openBrace.index;
            const variableContext = createVariableArgumentContext(
              macroName,
              inferArgumentIndexFromOpenBrace(openBraceIndex),
              '',
              fragmentLocalOffset,
              fragmentLocalOffset,
            );
            if (variableContext) {
              return variableContext;
            }

            if (macroName === 'calc') {
              return {
                type: 'calc-expression',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
                referenceKind: null,
              };
            }

            // metadata macro는 첫 argument 위치에서 metadata key 후보로 좁힘.
            if (macroName === 'metadata') {
              return {
                type: 'metadata-keys',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
              };
            }

            if (macroName === 'call') {
              return {
                type: 'function-names',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
              };
            }

            if (macroName === 'calc') {
              return {
                type: 'calc-expression',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
                referenceKind: null,
              };
            }
          }
        }

        // argument 후보가 없으면 block context의 close-tag completion으로 낮춤.
        const blockKind = findOpenBlockKind();
        return {
          type: 'close-tag',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
          blockKind: blockKind ?? '',
        };
      }
    }

    // Case 5: PlainText token은 tokenizer가 아직 macro로 분리하지 못한 incomplete syntax일 수 있음.
    // OpenBrace가 이미 있거나 PlainText 자체가 `{{`를 포함하는 두 경로를 모두 처리함.
    if (token.token.type === TokenType.PlainText) {
      const plainTextMacroPrefixContext = detectPlainTextMacroPrefixContext();
      if (plainTextMacroPrefixContext) {
        return plainTextMacroPrefixContext;
      }

      // Scenario 1: PlainText 앞의 OpenBrace를 기준으로 incomplete macro context를 복원함.
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        // Look at the next token after OpenBrace to determine context
        const nextToken = tokens[openBrace.index + 1];
        if (nextToken) {
          // Check for BlockStart ({{#...)
          if (nextToken.type === TokenType.BlockStart) {
            return {
              type: 'block-functions',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
            };
          }
          // Check for BlockEnd ({{/...)
          if (nextToken.type === TokenType.BlockEnd) {
            const blockKind = findOpenBlockKind();
            return {
              type: 'close-tag',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
              blockKind: blockKind ?? '',
            };
          }
          // Check for ElseKeyword ({{:...)
          if (nextToken.type === TokenType.ElseKeyword) {
            return {
              type: 'else-keyword',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
            };
          }
          // FunctionName 뒤 separator가 있으면 macro별 argument completion으로 전환함.
          if (nextToken.type === TokenType.FunctionName) {
            const funcName = nextToken.value.toLowerCase();
            const separatorToken = tokens[openBrace.index + 2];

            if (separatorToken?.type === TokenType.ArgumentSeparator) {
              const sepEnd = positionToOffset(
                fragmentAnalysis.fragment.content,
                separatorToken.range.end,
              );

              if (fragmentLocalOffset >= sepEnd) {
                const variableContext = createVariableArgumentContext(
                  funcName,
                  inferArgumentIndexFromOpenBrace(openBrace.index),
                  '',
                  sepEnd,
                  fragmentLocalOffset,
                );
                if (variableContext) {
                  return variableContext;
                }
              }

              if (funcName === 'calc' && fragmentLocalOffset >= sepEnd) {
                return {
                  type: 'calc-expression',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                  referenceKind: null,
                };
              }

              if (funcName === 'metadata') {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'metadata-keys',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                  };
                }
              }

              if (funcName === 'call') {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'function-names',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                  };
                }
              }

              if (funcName === 'calc') {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'calc-expression',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                    referenceKind: null,
                  };
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

        // 다음 token이 없으면 `{{`만 입력된 상태로 보고 전체 함수 후보를 제공함.
        return {
          type: 'all-functions',
          prefix: '',
          startOffset: openBrace.offset + 2,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 6: ElseKeyword token 위치에서는 else keyword 후보만 유지함.
    if (token.token.type === TokenType.ElseKeyword) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'else-keyword',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 7: BlockStart token 위치에서는 block 함수 후보를 제공함.
    if (token.token.type === TokenType.BlockStart) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'block-functions',
          prefix: token.token.value.slice(0, Math.max(0, fragmentLocalOffset - token.localStartOffset)),
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 8: FunctionName token은 separator 이후 macro별 completion, 아니면 전체 함수 후보로 처리함.
    if (token.token.type === TokenType.FunctionName) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        const funcName = token.token.value.toLowerCase();
        const nextTokenIndex = token.tokenIndex + 1;
        const separatorToken = tokens[nextTokenIndex];

        if (separatorToken?.type === TokenType.ArgumentSeparator) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            separatorToken.range.end,
          );

          if (fragmentLocalOffset >= sepEnd) {
            const variableContext = createVariableArgumentContext(
              funcName,
              inferArgumentIndexFromOpenBrace(openBrace.index),
              '',
              sepEnd,
              fragmentLocalOffset,
            );
            if (variableContext) {
              return variableContext;
            }
          }

          if (funcName === 'metadata') {
            if (fragmentLocalOffset >= sepEnd) {
              return {
                type: 'metadata-keys',
                prefix: '',
                startOffset: sepEnd,
                endOffset: fragmentLocalOffset,
              };
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
  }

  // Fallback: cursor가 token 사이에 있을 때는 OpenBrace 주변 token stream만으로 문맥을 복원함.
  const openBrace = findOpenBraceToken();
  if (openBrace !== null) {
    // #when header 내부의 token 사이 위치도 operator completion으로 복구함.
    const whenBlockInPath = findWhenBlock();
    if (whenBlockInPath) {
      const headerEnd = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlockInPath.openRange.end,
      );
      const headerStart = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlockInPath.openRange.start,
      );
      if (fragmentLocalOffset <= headerEnd && fragmentLocalOffset >= headerStart) {
        const lastSeparator = findLastSeparatorBeforeCursor();
        if (lastSeparator !== null && lastSeparator.offset >= headerStart) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            lastSeparator.token.range.end,
          );
          if (fragmentLocalOffset >= sepEnd) {
            return {
              type: 'when-operators',
              prefix: '',
              startOffset: sepEnd,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // OpenBrace 바로 뒤 token을 기준으로 incomplete macro 종류를 판별함.
    const nextToken = tokens[openBrace.index + 1];
    if (nextToken) {
      const nextType = nextToken.type;
      const nextStart = positionToOffset(fragmentAnalysis.fragment.content, nextToken.range.start);
      const nextEnd = positionToOffset(fragmentAnalysis.fragment.content, nextToken.range.end);

      // cursor가 `{{`와 다음 token 사이에 있으면 다음 token 종류만으로 후보군을 결정함.
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
          const blockKind = findOpenBlockKind();
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

      // cursor가 다음 token 뒤에 있으면 separator 존재 여부로 argument completion을 판별함.
      if (fragmentLocalOffset > nextEnd) {
        if (nextType === TokenType.FunctionName) {
          const funcName = nextToken.value.toLowerCase();
          const separatorToken = tokens[openBrace.index + 2];
          if (separatorToken?.type === TokenType.ArgumentSeparator) {
            const sepEnd = positionToOffset(
              fragmentAnalysis.fragment.content,
              separatorToken.range.end,
            );

            if (fragmentLocalOffset >= sepEnd) {
              const variableContext = createVariableArgumentContext(
                funcName,
                inferArgumentIndexFromOpenBrace(openBrace.index),
                '',
                sepEnd,
                fragmentLocalOffset,
              );
              if (variableContext) {
                return variableContext;
              }
              if (funcName === 'metadata') {
                return {
                  type: 'metadata-keys',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                };
              }

              if (funcName === 'call') {
                return {
                  type: 'function-names',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                };
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
    }

    // 순수 `{{` 상태에서는 전체 함수 completion을 기본값으로 사용함.
    return {
      type: 'all-functions',
      prefix: '',
      startOffset: openBrace.offset + 2,
      endOffset: fragmentLocalOffset,
    };
  }

  return { type: 'none' };
}
