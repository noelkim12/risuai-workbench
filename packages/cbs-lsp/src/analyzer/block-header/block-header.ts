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
  iteratorRange: Range;
  bindingName: string;
  bindingRange: Range;
}

interface EachLoopHeaderParts {
  iteratorExpression: string;
  iteratorStartIndex: number;
  iteratorEndIndex: number;
  bindingName: string;
  bindingStartIndex: number;
  bindingEndIndex: number;
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

  return splitTopLevelBlockHeaderSegments(trimmedStart.slice(2)).map((segment) => segment.trim());
}

/**
 * splitTopLevelBlockHeaderSegments 함수.
 * 중첩 CBS macro 내부의 `::`는 보존하고 header 최상위 구분자만 분리함.
 *
 * @param tail - 선행 `::`를 제거한 block header tail 문자열
 * @returns 최상위 `::` 기준으로 분리된 header 세그먼트 배열
 */
function splitTopLevelBlockHeaderSegments(tail: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let segmentStart = 0;

  for (let index = 0; index < tail.length; index += 1) {
    const pair = tail.slice(index, index + 2);
    if (pair === '{{') {
      depth += 1;
      index += 1;
      continue;
    }

    if (pair === '}}') {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (pair === '::' && depth === 0) {
      segments.push(tail.slice(segmentStart, index));
      segmentStart = index + 2;
      index += 1;
    }
  }

  segments.push(tail.slice(segmentStart));

  return segments;
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

  const parts = parseEachLoopHeaderParts(headerText);
  if (!parts) {
    return null;
  }

  const { iteratorExpression, bindingName } = parts;
  if (
    iteratorExpression.length === 0 ||
    bindingName.length === 0 ||
    bindingName.toLowerCase() === 'as' ||
    !LOOP_VARIABLE_NAME_PATTERN.test(bindingName)
  ) {
    return null;
  }

  const rawHeader = CbsLspTextHelper.extractRangeText(sourceText, node.openRange);
  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const headerTextStartIndex = rawHeader.indexOf(headerText);
  if (headerTextStartIndex === -1) {
    return null;
  }

  const iteratorStartIndex = headerTextStartIndex + parts.iteratorStartIndex;
  const iteratorEndIndex = headerTextStartIndex + parts.iteratorEndIndex;
  const bindingStartIndex = headerTextStartIndex + parts.bindingStartIndex;
  const bindingEndIndex = headerTextStartIndex + parts.bindingEndIndex;
  if (rawHeader.slice(bindingStartIndex, bindingEndIndex) !== bindingName) {
    return null;
  }

  const iteratorStartOffset = openOffset + iteratorStartIndex;
  const iteratorEndOffset = openOffset + iteratorEndIndex;
  const bindingStartOffset = openOffset + bindingStartIndex;
  const bindingEndOffset = openOffset + bindingEndIndex;

  return {
    iteratorExpression,
    iteratorRange: {
      start: offsetToPosition(sourceText, iteratorStartOffset),
      end: offsetToPosition(sourceText, iteratorEndOffset),
    },
    bindingName,
    bindingRange: {
      start: offsetToPosition(sourceText, bindingStartOffset),
      end: offsetToPosition(sourceText, bindingEndOffset),
    },
  };
}

/**
 * parseEachLoopHeaderParts 함수.
 * `#each` header tail에서 iterator 표현식과 alias의 header-local 범위를 분리함.
 *
 * @param headerText - mode/operator를 제거한 `#each` header tail
 * @returns iterator/alias 텍스트와 header-local offset 묶음, 파싱 불가 시 null
 */
function parseEachLoopHeaderParts(headerText: string): EachLoopHeaderParts | null {
  const asMatch = headerText.match(/^(.*?)\s+as\s+(.+)$/iu);
  if (asMatch?.[1] && asMatch[2]) {
    const rawIterator = asMatch[1];
    const rawBinding = asMatch[2];
    const iteratorLeading = rawIterator.length - rawIterator.trimStart().length;
    const iteratorTrailing = rawIterator.length - rawIterator.trimEnd().length;
    const bindingLeading = rawBinding.length - rawBinding.trimStart().length;
    const bindingTrailing = rawBinding.length - rawBinding.trimEnd().length;
    const bindingSegmentStart = asMatch[0].length - rawBinding.length;

    return {
      iteratorExpression: rawIterator.trim(),
      iteratorStartIndex: iteratorLeading,
      iteratorEndIndex: rawIterator.length - iteratorTrailing,
      bindingName: rawBinding.trim(),
      bindingStartIndex: bindingSegmentStart + bindingLeading,
      bindingEndIndex: bindingSegmentStart + rawBinding.length - bindingTrailing,
    };
  }

  const shorthandMatch = headerText.match(/^(\S+)\s+(\S+)$/u);
  if (!shorthandMatch?.[1] || !shorthandMatch[2]) {
    return null;
  }

  const iteratorStartIndex = headerText.indexOf(shorthandMatch[1]);
  const bindingStartIndex = headerText.lastIndexOf(shorthandMatch[2]);
  if (iteratorStartIndex === -1 || bindingStartIndex === -1) {
    return null;
  }

  return {
    iteratorExpression: shorthandMatch[1],
    iteratorStartIndex,
    iteratorEndIndex: iteratorStartIndex + shorthandMatch[1].length,
    bindingName: shorthandMatch[2],
    bindingStartIndex,
    bindingEndIndex: bindingStartIndex + shorthandMatch[2].length,
  };
}

/**
 * isStaticEachIteratorIdentifier 함수.
 * `#each` iterator source를 chat variable read로 안전하게 볼 수 있는지 판별함.
 *
 * @param iteratorExpression - `#each` header에서 추출한 iterator source 표현식
 * @returns 단일 정적 identifier이면 true
 */
export function isStaticEachIteratorIdentifier(iteratorExpression: string): boolean {
  return LOOP_VARIABLE_NAME_PATTERN.test(iteratorExpression.trim());
}
