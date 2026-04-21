/**
 * `#func` block 선언 파싱 유틸 모음.
 * @file packages/cbs-lsp/src/analyzer/block-header/function-declaration.ts
 */

import { type BlockNode, type Range } from 'risu-workbench-core';

import { CbsLspTextHelper } from '../../helpers/text-helper';
import { offsetToPosition, positionToOffset } from '../../utils/position';
import { extractBlockHeaderInfo } from './block-header';

export interface FunctionDeclaration {
  name: string;
  range: Range;
  parameters: string[];
}

/**
 * extractFunctionDeclaration 함수.
 * `#func` open tag에서 함수 이름과 파라미터 목록, 이름 range를 추출함.
 *
 * @param node - function declaration을 담고 있는 func block
 * @param sourceText - open tag text와 range 계산에 쓸 fragment 원문
 * @returns 추출된 함수 선언 정보, header가 malformed면 null
 */
export function extractFunctionDeclaration(
  node: BlockNode,
  sourceText: string,
): FunctionDeclaration | null {
  const header = extractBlockHeaderInfo(node, sourceText);
  if (!header || header.rawName.toLowerCase() !== '#func') {
    return null;
  }

  const tokens = header.tail
    .trim()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const name = tokens[0];
  if (!name) {
    return null;
  }

  const rawHeader = CbsLspTextHelper.extractRangeText(sourceText, node.openRange);
  const nameStartIndex = rawHeader.indexOf(name);
  if (nameStartIndex === -1) {
    return null;
  }

  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const nameStartOffset = openOffset + nameStartIndex;

  return {
    name,
    range: {
      start: offsetToPosition(sourceText, nameStartOffset),
      end: offsetToPosition(sourceText, nameStartOffset + name.length),
    },
    parameters: tokens.slice(1),
  };
}
