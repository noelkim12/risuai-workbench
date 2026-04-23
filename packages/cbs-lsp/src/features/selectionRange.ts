/**
 * CBS selection range provider.
 * Expands selection within a single CBS fragment following the hierarchy:
 * token span -> macro call -> nearest parent block body -> nearest parent block whole.
 * @file packages/cbs-lsp/src/features/selectionRange.ts
 */

import {
  type CancellationToken,
  SelectionRange,
  SelectionRangeParams,
} from 'vscode-languageserver/node';
import type { BlockNode, CBSNode, MacroCallNode, Range } from 'risu-workbench-core';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import { isRequestCancelled } from '../utils/request-cancellation';
import { positionToOffset } from '../utils/position';

export type SelectionRangeRequestResolver = (
  params: SelectionRangeParams,
) => FragmentAnalysisRequest | null;

export interface SelectionRangeProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: SelectionRangeRequestResolver;
}

export const SELECTION_RANGE_PROVIDER_AVAILABILITY: AgentMetadataAvailabilityContract =
  ACTIVE_FEATURE_AVAILABILITY.selectionRange;

/**
 * rangeEquals 함수.
 * 두 range가 동일한 좌표를 가지는지 비교함.
 *
 * @param left - 비교할 왼쪽 range
 * @param right - 비교할 오른쪽 range
 * @returns 동일하면 true
 */
function rangeEquals(left: Range | undefined, right: Range | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}

/**
 * isOffsetInRange 함수.
 * 주어진 offset이 range 안에 엄격하게 들어오는지 판별함.
 *
 * @param offset - 검사할 fragment-local offset
 * @param range - 검사할 range
 * @param sourceText - fragment 원문 텍스트
 * @returns offset이 range 안에 있으면 true
 */
function isOffsetInRange(offset: number, range: Range, sourceText: string): boolean {
  const startOffset = positionToOffset(sourceText, range.start);
  const endOffset = positionToOffset(sourceText, range.end);
  return offset >= startOffset && offset < endOffset;
}

/**
 * computeBlockBodyRange 함수.
 * BlockNode의 body region range를 계산함.
 * open tag 끝에서 close tag 시작까지, close tag가 없으면 마지막 body node 끝까지.
 *
 * @param block - 대상 block 노드
 * @param sourceText - fragment 원문 텍스트
 * @returns 유효한 body range, 없으면 null
 */
function computeBlockBodyRange(block: BlockNode, sourceText: string): Range | null {
  const start = block.openRange.end;
  let end: Range['end'];

  if (block.closeRange) {
    end = block.closeRange.start;
  } else if (block.body.length > 0) {
    end = block.body[block.body.length - 1].range.end;
  } else {
    return null;
  }

  const startOffset = positionToOffset(sourceText, start);
  const endOffset = positionToOffset(sourceText, end);
  if (startOffset >= endOffset) {
    return null;
  }

  return { start, end };
}

/**
 * findEnclosingMacroCall 함수.
 * node path에서 가장 안쪽의 MacroCall 노드를 찾음.
 *
 * @param nodePath - 현재 커서의 AST node path
 * @returns enclosing macro call, 없으면 null
 */
function findEnclosingMacroCall(nodePath: readonly CBSNode[]): MacroCallNode | null {
  for (let index = nodePath.length - 1; index >= 0; index -= 1) {
    const node = nodePath[index];
    if (node?.type === 'MacroCall') {
      return node;
    }
  }

  return null;
}

/**
 * findEnclosingBlock 함수.
 * node path에서 가장 안쪽의 Block 노드를 찾음.
 *
 * @param nodePath - 현재 커서의 AST node path
 * @returns enclosing block, 없으면 null
 */
function findEnclosingBlock(nodePath: readonly CBSNode[]): BlockNode | null {
  for (let index = nodePath.length - 1; index >= 0; index -= 1) {
    const node = nodePath[index];
    if (node?.type === 'Block') {
      return node;
    }
  }

  return null;
}

/**
 * SelectionRangeProvider 클래스.
 * CBS fragment 내에서 커서 위치를 기준으로 단일 fragment 안에서만 selection range를 계산함.
 */
export class SelectionRangeProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: SelectionRangeRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = SELECTION_RANGE_PROVIDER_AVAILABILITY;

  /**
   * constructor 함수.
   * selection range 계산에 필요한 fragment analysis seam을 보관함.
   *
   * @param options - analysis service와 request resolver override
   */
  constructor(options: SelectionRangeProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * 현재 문서의 여러 커서 position 각각에 대해 fragment-safe selection range를 계산함.
   * non-CBS 문서나 지원하지 않는 구조에서는 빈 배열을 반환함.
   *
   * @param params - 현재 selection range 요청
   * @param cancellationToken - 요청 취소 여부를 확인할 토큰
   * @returns fragment-safe selection range 목록
   */
  provide(params: SelectionRangeParams, cancellationToken?: CancellationToken): SelectionRange[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const results: SelectionRange[] = [];

    for (const position of params.positions) {
      if (isRequestCancelled(cancellationToken)) {
        return results;
      }

      const lookup = this.analysisService.locatePosition(
        request,
        position,
        cancellationToken,
      );
      if (!lookup) {
        continue;
      }

      if (!lookup.recovery.tokenContextReliable || !lookup.recovery.structureReliable) {
        continue;
      }

      const chain = this.buildSelectionChain(lookup, request.text);
      if (chain.length > 0) {
        results.push(this.linkSelectionRanges(chain));
      }
    }

    return results;
  }

  /**
   * buildSelectionChain 함수.
   * 커서 위치를 기준으로 fragment-local range chain을 조립함.
   * chain 순서: token span -> macro call -> block body (커서가 body 안에 있을 때) -> block whole.
   *
   * @param lookup - fragment cursor lookup 결과
   * @param documentContent - host document 원문
   * @returns host document 기준 range chain
   */
  private buildSelectionChain(
    lookup: FragmentCursorLookupResult,
    documentContent: string,
  ): Range[] {
    const ranges: Range[] = [];
    const { nodeSpan, nodePath, fragmentLocalOffset, fragmentAnalysis, fragment } = lookup;

    if (!nodeSpan) {
      return ranges;
    }

    const pushRange = (localRange: Range): void => {
      const hostRange = fragmentAnalysis.mapper.toHostRange(documentContent, localRange);
      if (!hostRange) {
        return;
      }

      if (!rangeEquals(ranges[ranges.length - 1], hostRange)) {
        ranges.push(hostRange);
      }
    };

    // 1. Token span
    pushRange(nodeSpan.localRange);

    // 2. Macro call whole
    const macroCall = findEnclosingMacroCall(nodePath);
    if (macroCall) {
      pushRange(macroCall.range);
    }

    // 3. Nearest parent block body (only when cursor is inside the body region)
    const enclosingBlock = findEnclosingBlock(nodePath);
    if (enclosingBlock) {
      const bodyRange = computeBlockBodyRange(enclosingBlock, fragment.content);
      if (bodyRange && isOffsetInRange(fragmentLocalOffset, bodyRange, fragment.content)) {
        pushRange(bodyRange);
      }

      // 4. Block whole
      pushRange(enclosingBlock.range);
    }

    return ranges;
  }

  /**
   * linkSelectionRanges 함수.
   * flat range 배열을 SelectionRange parent chain으로 연결함.
   * 배열의 첫 번째 요소가 가장 안쪽, 마지막 요소가 가장 바깥쪽 range.
   *
   * @param ranges - innermost-to-outermost 순서의 range 배열
   * @returns parent-linked SelectionRange
   */
  private linkSelectionRanges(ranges: readonly Range[]): SelectionRange {
    let current: SelectionRange | undefined;
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      current = { range: ranges[index], parent: current };
    }
    return current!;
  }
}
