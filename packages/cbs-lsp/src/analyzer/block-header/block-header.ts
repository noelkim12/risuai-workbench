/**
 * CBS block header 파싱과 binding 추출 공용 유틸 모음.
 * @file packages/cbs-lsp/src/analyzer/block-header/block-header.ts
 */

import { type BlockNode, type Range } from 'risu-workbench-core';

import { CbsLspTextHelper } from '../../helpers/text-helper';
import { offsetToPosition, positionToOffset } from '../../utils/position';

export const WHEN_MODE_OPERATORS = new Set(['keep', 'legacy']);
export const WHEN_UNARY_OPERATORS = new Set(['not', 'toggle', 'var']);
export const WHEN_BINARY_OPERATORS = new Set([
  'and',
  'or',
  'is',
  'isnot',
  '>',
  '<',
  '>=',
  '<=',
  'vis',
  'visnot',
  'tis',
  'tisnot',
]);
export const EACH_MODE_OPERATORS = new Set(['keep']);

const LOOP_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export interface BlockHeaderInfo {
  rawName: string;
  tail: string;
}

export interface EachLoopBinding {
  iteratorExpression: string;
  bindingName: string;
  bindingRange: Range;
}

/**
 * parseBlockHeaderSegments 함수.
 * block header tail을 `::` 단위 세그먼트 목록으로 정규화함.
 *
 * @param rawTail - block 이름 뒤에 이어진 raw header text
 * @returns trim 처리된 header 세그먼트 배열
 */
export function parseBlockHeaderSegments(rawTail: string): string[] {
  const trimmedStart = rawTail.trimStart();
  if (trimmedStart.length === 0) {
    return [];
  }

  if (!trimmedStart.startsWith('::')) {
    return [trimmedStart.trim()];
  }

  return trimmedStart
    .slice(2)
    .split('::')
    .map((segment) => segment.trim());
}

/**
 * stripLeadingBlockHeaderOperators 함수.
 * 허용된 mode/operator prefix를 앞에서부터 제거한 나머지 세그먼트를 돌려줌.
 *
 * @param segments - block header를 `::` 기준으로 나눈 세그먼트 목록
 * @param allowed - 앞부분에서 건너뛸 수 있는 operator 집합
 * @returns 선행 operator를 제거한 세그먼트 배열
 */
export function stripLeadingBlockHeaderOperators(
  segments: string[],
  allowed: ReadonlySet<string>,
): string[] {
  let index = 0;

  while (index < segments.length && allowed.has(segments[index].toLowerCase())) {
    index += 1;
  }

  return segments.slice(index);
}

/**
 * extractBlockHeaderInfo 함수.
 * block open range 원문에서 raw block 이름과 나머지 tail text를 분리함.
 *
 * @param node - header를 읽어올 block AST 노드
 * @param sourceText - block header slice를 추출할 fragment 원문
 * @returns raw block 이름과 tail 정보, 파싱 불가 시 null
 */
export function extractBlockHeaderInfo(
  node: BlockNode,
  sourceText: string,
): BlockHeaderInfo | null {
  const rawHeader = CbsLspTextHelper.extractRangeText(sourceText, node.openRange);
  const inner = rawHeader
    .replace(/^\{\{\s*/, '')
    .replace(/\}\}\s*$/, '')
    .trim();
  const match = inner.match(/^([^\s:]+)([\s\S]*)$/);
  if (!match) {
    return null;
  }

  return {
    rawName: match[1],
    tail: match[2] ?? '',
  };
}

/**
 * extractBlockNameRange 함수.
 * block open header 안에서 block 이름 토큰이 차지하는 정확한 range를 계산함.
 *
 * @param node - 이름 range를 계산할 block AST 노드
 * @param sourceText - header 원문을 잘라낼 fragment 텍스트
 * @returns block 이름 range, header 해석이 불가능하면 null
 */
export function extractBlockNameRange(node: BlockNode, sourceText: string): Range | null {
  const rawHeader = CbsLspTextHelper.extractRangeText(sourceText, node.openRange);
  const nameMatch = rawHeader.match(/^\{\{\s*([^\s:}]+)/u);
  if (!nameMatch?.[1]) {
    return null;
  }

  const nameStartIndex = rawHeader.indexOf(nameMatch[1]);
  if (nameStartIndex === -1) {
    return null;
  }

  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const nameStartOffset = openOffset + nameStartIndex;
  const nameEndOffset = nameStartOffset + nameMatch[1].length;

  return {
    start: offsetToPosition(sourceText, nameStartOffset),
    end: offsetToPosition(sourceText, nameEndOffset),
  };
}

/**
 * extractEachLoopBinding 함수.
 * `#each ... as alias` header에서 loop binding 이름과 range를 복원함.
 *
 * @param node - binding을 읽어올 `#each` block 노드
 * @param sourceText - binding range를 계산할 fragment 원문
 * @returns 파싱된 loop binding 정보, 없으면 null
 */
export function extractEachLoopBinding(
  node: BlockNode,
  sourceText: string,
): EachLoopBinding | null {
  const header = extractBlockHeaderInfo(node, sourceText);
  if (!header || header.rawName.toLowerCase() !== '#each') {
    return null;
  }

  const segments = stripLeadingBlockHeaderOperators(
    parseBlockHeaderSegments(header.tail),
    EACH_MODE_OPERATORS,
  );
  const headerText = segments.join('::').trim();
  if (headerText.length === 0) {
    return null;
  }

  const asMatch = headerText.match(/^(.*?)\s+as\s+(.+)$/i);
  if (!asMatch) {
    return null;
  }

  const iteratorExpression = asMatch[1]?.trim() ?? '';
  const bindingName = asMatch[2]?.trim() ?? '';
  if (
    iteratorExpression.length === 0 ||
    bindingName.length === 0 ||
    !LOOP_VARIABLE_NAME_PATTERN.test(bindingName)
  ) {
    return null;
  }

  const rawHeader = CbsLspTextHelper.extractRangeText(sourceText, node.openRange);
  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const bindingStartIndex = rawHeader.lastIndexOf(bindingName);
  if (bindingStartIndex === -1) {
    return null;
  }

  const bindingStartOffset = openOffset + bindingStartIndex;
  const bindingEndOffset = bindingStartOffset + bindingName.length;

  return {
    iteratorExpression,
    bindingName,
    bindingRange: {
      start: offsetToPosition(sourceText, bindingStartOffset),
      end: offsetToPosition(sourceText, bindingEndOffset),
    },
  };
}
