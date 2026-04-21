/**
 * `#each` body 재파싱과 range rebasing을 담당하는 resolver.
 * @file packages/cbs-lsp/src/analyzer/scope/analyzable-body-resolver.ts
 */

import {
  CBSParser,
  type BlockNode,
  type CBSNode,
  type Range,
} from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../../utils/position';

/**
 * AnalyzableBodyResolver 클래스.
 * `#each` body를 recoverable AST로 다시 읽고 host 좌표계로 rebasing함.
 */
export class AnalyzableBodyResolver {
  private readonly parser = new CBSParser();

  private readonly cache = new Map<string, readonly CBSNode[]>();

  /**
   * getBodyNodes 함수.
   * block body 분석에 사용할 AST 노드 목록을 돌려줌.
   *
   * @param node - body를 읽을 block 노드
   * @param sourceText - body literal 재파싱에 쓸 fragment 원문
   * @returns 현재 block body 분석에 사용할 AST 노드 목록
   */
  getBodyNodes(node: BlockNode, sourceText: string): readonly CBSNode[] {
    if (node.kind !== 'each' || sourceText.length === 0) {
      return node.body;
    }

    const cacheKey = this.getCacheKey(node);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolved = this.reparseLiteralBody(node.body, sourceText) ?? node.body;
    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * getCacheKey 함수.
   * block range를 기반으로 reparsed body cache key를 생성함.
   *
   * @param node - cache key를 계산할 block 노드
   * @returns host range 기반 cache key 문자열
   */
  private getCacheKey(node: BlockNode): string {
    return [
      node.range.start.line,
      node.range.start.character,
      node.range.end.line,
      node.range.end.character,
    ].join(':');
  }

  /**
   * reparseLiteralBody 함수.
   * host source에서 body text를 잘라 다시 파싱한 뒤 원래 host 좌표로 rebasing함.
   *
   * @param body - 재파싱할 block body 노드 목록
   * @param sourceText - body text를 잘라낼 host fragment 원문
   * @returns rebased body AST, 복원할 range가 없으면 기존 body 또는 null
   */
  private reparseLiteralBody(body: readonly CBSNode[], sourceText: string): readonly CBSNode[] | null {
    const bodyRange = this.getNodesRange(body);
    if (!bodyRange) {
      return body;
    }

    const startOffset = positionToOffset(sourceText, bodyRange.start);
    const endOffset = positionToOffset(sourceText, bodyRange.end);
    const bodyText = sourceText.slice(startOffset, endOffset);
    if (bodyText.length === 0) {
      return [];
    }

    const reparsed = this.parser.parse(bodyText);
    return reparsed.nodes.map((node) => this.rebaseNode(node, bodyText, sourceText, startOffset));
  }

  /**
   * getNodesRange 함수.
   * 연속된 node 배열의 시작/끝 range를 하나의 범위로 합침.
   *
   * @param nodes - 공통 범위를 계산할 AST 노드 목록
   * @returns 첫 노드 start와 마지막 노드 end를 잇는 range, 비어 있으면 null
   */
  private getNodesRange(nodes: readonly CBSNode[]): Range | null {
    if (nodes.length === 0) {
      return null;
    }

    return {
      start: nodes[0].range.start,
      end: nodes[nodes.length - 1].range.end,
    };
  }

  /**
   * rebaseNode 함수.
   * local body parse 결과 노드를 host document offset 기준 좌표로 다시 올림.
   *
   * @param node - host 좌표로 rebasing할 AST 노드
   * @param localSource - 재파싱에 사용한 body local source text
   * @param hostSource - 원래 fragment의 host source text
   * @param startOffset - local source가 host source에서 시작하는 offset
   * @returns host coordinate로 rebasing된 AST 노드
   */
  private rebaseNode(
    node: CBSNode,
    localSource: string,
    hostSource: string,
    startOffset: number,
  ): CBSNode {
    switch (node.type) {
      case 'PlainText':
      case 'Comment':
      case 'MathExpr':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
        };
      case 'MacroCall':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
          nameRange: this.rebaseRange(node.nameRange, localSource, hostSource, startOffset),
          arguments: node.arguments.map((argument) =>
            argument.map((child) => this.rebaseNode(child, localSource, hostSource, startOffset)),
          ),
        };
      case 'Block':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
          openRange: this.rebaseRange(node.openRange, localSource, hostSource, startOffset),
          closeRange: node.closeRange
            ? this.rebaseRange(node.closeRange, localSource, hostSource, startOffset)
            : undefined,
          condition: node.condition.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
          body: node.body.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
          elseBody: node.elseBody?.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
        };
    }
  }

  /**
   * rebaseRange 함수.
   * local source range를 host source offset 기준 range로 변환함.
   *
   * @param range - local source 기준 range
   * @param localSource - local range offset 계산에 쓸 source text
   * @param hostSource - host position 계산에 쓸 source text
   * @param startOffset - local source가 host source에서 시작하는 offset
   * @returns host source 기준으로 환산된 range
   */
  private rebaseRange(
    range: Range,
    localSource: string,
    hostSource: string,
    startOffset: number,
  ): Range {
    const localStartOffset = positionToOffset(localSource, range.start);
    const localEndOffset = positionToOffset(localSource, range.end);

    return {
      start: offsetToPosition(hostSource, startOffset + localStartOffset),
      end: offsetToPosition(hostSource, startOffset + localEndOffset),
    };
  }
}
