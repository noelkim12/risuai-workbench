/**
 * scope analyzer용 정적 macro argument 추출 유틸.
 * @file packages/cbs-lsp/src/analyzer/scope/static-argument.ts
 */

import { type MacroCallNode, type Range } from 'risu-workbench-core';

import { positionToOffset, offsetToPosition } from '../../utils/position';

export interface StaticArgument {
  text: string;
  range: Range;
}

/**
 * extractStaticArgument 함수.
 * 주어진 argument가 plain text literal만으로 이뤄졌는지 확인하고 trimmed text/range를 돌려줌.
 *
 * @param node - argument를 읽을 macro call 노드
 * @param argumentIndex - 정적 literal 여부를 검사할 인수 위치
 * @param sourceText - trim-aware range 계산에 쓸 fragment 원문
 * @returns 정적 literal text와 trimmed range, 동적 표현식이면 null
 */
export function extractStaticArgument(
  node: MacroCallNode,
  argumentIndex: number,
  sourceText: string,
): StaticArgument | null {
  const argument = node.arguments[argumentIndex];
  if (!argument || argument.length === 0) {
    return null;
  }

  const literalParts: string[] = [];
  let mergedRange: Range | null = null;

  for (const child of argument) {
    if (child.type === 'Comment') {
      continue;
    }

    if (child.type !== 'PlainText') {
      return null;
    }

    literalParts.push(child.value);
    mergedRange = mergedRange
      ? {
          start: mergedRange.start,
          end: child.range.end,
        }
      : child.range;
  }

  if (!mergedRange) {
    return null;
  }

  const rawText = literalParts.join('');
  const leadingTrim = rawText.length - rawText.trimStart().length;
  const trimmedText = rawText.trim();
  if (trimmedText.length === 0) {
    return null;
  }

  const startOffset = positionToOffset(sourceText, mergedRange.start) + leadingTrim;
  const endOffset = startOffset + trimmedText.length;

  return {
    text: trimmedText,
    range: {
      start: offsetToPosition(sourceText, startOffset),
      end: offsetToPosition(sourceText, endOffset),
    },
  };
}
