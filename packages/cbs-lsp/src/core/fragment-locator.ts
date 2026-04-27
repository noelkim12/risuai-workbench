/**
 * CBS routed fragment에서 host cursor를 token, node, span 문맥으로 해석하는 locator 유틸 모음.
 * @file packages/cbs-lsp/src/core/fragment-locator.ts
 */

import type {
  BlockNode,
  CBSNode,
  MacroCallNode,
  Position,
  Range,
  Token,
} from 'risu-workbench-core';
import { TokenType } from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../utils/position';
import type {
  DocumentFragmentAnalysis,
  FragmentDocumentAnalysis,
} from './fragment-analysis-service';
import type { FragmentRecoveryState } from './recovery-contract';

/** offset이 span 내부, 끝 경계, 외부 중 어디에 놓이는지 나타내는 분류. */
type SpanRelation = 'strict' | 'boundary' | 'outside';

/** fragment-local range와 offset span을 함께 보관하는 내부 lookup 단위. */
interface OffsetSpan {
  localRange: Range;
  localStartOffset: number;
  localEndOffset: number;
}

/** AST node path 탐색 결과와 cursor/span 관계를 함께 담는 내부 lookup 결과. */
interface NodePathLookup {
  path: readonly CBSNode[];
  relation: Exclude<SpanRelation, 'outside'>;
}

/**
 * FragmentTokenSpanCategory 타입.
 * Fragment token이 LSP feature에서 어떤 문맥으로 소비될지 분류함.
 */
export type FragmentTokenSpanCategory =
  | 'macro-name'
  | 'argument'
  | 'block-header'
  | 'block-close'
  | 'else'
  | 'comment'
  | 'math-expression'
  | 'angle-bracket-macro'
  | 'plain-text'
  | 'punctuation';

/**
 * FragmentNodeSpanCategory 타입.
 * Fragment AST node span이 symbol, highlight, selection feature에서 어떤 역할인지 분류함.
 */
export type FragmentNodeSpanCategory =
  | 'macro-name'
  | 'argument'
  | 'argument-reference'
  | 'block-header'
  | 'block-close'
  | 'block-else'
  | 'local-function-reference'
  | 'node-range';

/**
 * FragmentTokenLookup 인터페이스.
 * 현재 cursor와 맞닿은 token의 fragment-local 위치와 feature category를 보관함.
 */
export interface FragmentTokenLookup extends OffsetSpan {
  token: Token;
  tokenIndex: number;
  category: FragmentTokenSpanCategory;
}

/**
 * FragmentNodeSpanLookup 인터페이스.
 * 현재 cursor가 의미적으로 가리키는 AST owner와 해당 span category를 보관함.
 */
export interface FragmentNodeSpanLookup extends OffsetSpan {
  owner: CBSNode;
  category: FragmentNodeSpanCategory;
  argumentIndex?: number;
}

/**
 * FragmentCursorLookupResult 인터페이스.
 * Host document cursor를 routed CBS fragment의 local token/node 문맥으로 정규화한 결과.
 */
export interface FragmentCursorLookupResult {
  fragmentAnalysis: FragmentDocumentAnalysis;
  fragment: FragmentDocumentAnalysis['fragment'];
  fragmentIndex: number;
  section: string;
  fragmentLocalPosition: Position;
  fragmentLocalOffset: number;
  hostPosition: Position;
  hostOffset: number;
  recovery: FragmentRecoveryState;
  token: FragmentTokenLookup | null;
  node: CBSNode | null;
  nodePath: readonly CBSNode[];
  nodeSpan: FragmentNodeSpanLookup | null;
}

/**
 * rangeToOffsetSpan 함수.
 * Range를 fragment-local offset span으로 변환함.
 *
 * @param text - offset 계산 기준이 되는 fragment 원문
 * @param range - offset span으로 변환할 local range
 * @returns local range와 시작, 끝 offset을 함께 담은 span
 */
function rangeToOffsetSpan(text: string, range: Range): OffsetSpan {
  return {
    localRange: range,
    localStartOffset: positionToOffset(text, range.start),
    localEndOffset: positionToOffset(text, range.end),
  };
}

/**
 * getSpanRelation 함수.
 * offset이 span 내부인지, 끝 경계인지, 외부인지 판정함.
 *
 * @param startOffset - span 시작 offset
 * @param endOffset - span 끝 offset
 * @param offset - 검사할 cursor offset
 * @returns offset과 span의 관계 분류
 */
function getSpanRelation(startOffset: number, endOffset: number, offset: number): SpanRelation {
  if (offset >= startOffset && offset < endOffset) {
    return 'strict';
  }

  if (startOffset < endOffset && endOffset === offset) {
    return 'boundary';
  }

  return 'outside';
}

/**
 * classifyTokenCategory 함수.
 * parser token type을 feature 소비용 token category로 변환함.
 *
 * @param token - 분류할 CBS token
 * @returns token의 feature category
 */
function classifyTokenCategory(token: Token): FragmentTokenSpanCategory {
  switch (token.type) {
    case TokenType.FunctionName:
      return 'macro-name';
    case TokenType.Argument:
      return 'argument';
    case TokenType.BlockStart:
      return 'block-header';
    case TokenType.BlockEnd:
      return 'block-close';
    case TokenType.ElseKeyword:
      return 'else';
    case TokenType.Comment:
      return 'comment';
    case TokenType.MathExpression:
      return 'math-expression';
    case TokenType.AngleBracketMacro:
      return 'angle-bracket-macro';
    case TokenType.PlainText:
      return 'plain-text';
    case TokenType.OpenBrace:
    case TokenType.CloseBrace:
    case TokenType.ArgumentSeparator:
      return 'punctuation';
    default:
      return 'plain-text';
  }
}

/**
 * getMacroArgumentSpan 함수.
 * macro call 인수 중 cursor offset이 포함된 argument span을 찾음.
 *
 * @param content - offset 계산 기준이 되는 fragment 원문
 * @param node - argument span을 찾을 macro call node
 * @param offset - 검사할 fragment-local cursor offset
 * @returns argument span과 index, span 관계. 없으면 null
 */
function getMacroArgumentSpan(
  content: string,
  node: MacroCallNode,
  offset: number,
): (OffsetSpan & { argumentIndex: number; relation: Exclude<SpanRelation, 'outside'> }) | null {
  let boundaryMatch:
    | (OffsetSpan & {
        argumentIndex: number;
        relation: Exclude<SpanRelation, 'outside'>;
      })
    | null = null;

  for (const [argumentIndex, segment] of node.arguments.entries()) {
    const firstNode = segment[0];
    const lastNode = segment[segment.length - 1];

    if (!firstNode || !lastNode) {
      continue;
    }

    const span = rangeToOffsetSpan(content, {
      start: firstNode.range.start,
      end: lastNode.range.end,
    });
    const relation = getSpanRelation(span.localStartOffset, span.localEndOffset, offset);

    if (relation === 'strict') {
      return { ...span, argumentIndex, relation };
    }

    if (relation === 'boundary' && boundaryMatch === null) {
      boundaryMatch = { ...span, argumentIndex, relation };
    }
  }

  return boundaryMatch;
}

/**
 * getChildNodeGroups 함수.
 * node type별로 재귀 탐색해야 하는 child node 그룹을 반환함.
 *
 * @param node - child group을 조회할 CBS AST node
 * @returns 재귀 탐색 대상 child node 그룹 목록
 */
function getChildNodeGroups(node: CBSNode): readonly (readonly CBSNode[])[] {
  switch (node.type) {
    case 'MacroCall':
      return node.arguments;
    case 'Block':
      return node.elseBody
        ? [node.condition, node.body, node.elseBody]
        : [node.condition, node.body];
    case 'MathExpr':
      return [node.children];
    default:
      return [];
  }
}

/**
 * findInnermostNodePath 함수.
 * cursor offset을 포함하는 가장 안쪽 AST node path를 찾음.
 *
 * @param content - offset 계산 기준이 되는 fragment 원문
 * @param nodes - 탐색할 sibling node 목록
 * @param offset - 검사할 fragment-local cursor offset
 * @param path - 상위 호출에서 누적한 node path
 * @returns 가장 안쪽 node path와 span 관계. 없으면 null
 */
function findInnermostNodePath(
  content: string,
  nodes: readonly CBSNode[],
  offset: number,
  path: readonly CBSNode[] = [],
): NodePathLookup | null {
  let boundaryMatch: NodePathLookup | null = null;

  for (const node of nodes) {
    const nodeSpan = rangeToOffsetSpan(content, node.range);
    const relation = getSpanRelation(nodeSpan.localStartOffset, nodeSpan.localEndOffset, offset);

    if (relation === 'outside') {
      continue;
    }

    const nextPath = [...path, node];
    const childMatch = getChildNodeGroups(node)
      .map((group) => findInnermostNodePath(content, group, offset, nextPath))
      .find((candidate) => candidate !== null);

    if (childMatch?.relation === 'strict') {
      return childMatch;
    }

    if (relation === 'strict') {
      return childMatch ?? { path: nextPath, relation };
    }

    boundaryMatch = childMatch ?? { path: nextPath, relation };
  }

  return boundaryMatch;
}

/**
 * findNearestBlock 함수.
 * node path에서 cursor와 가장 가까운 block node를 찾음.
 *
 * @param path - innermost node까지 이어지는 AST node path
 * @returns 가장 가까운 block node. 없으면 null
 */
function findNearestBlock(path: readonly CBSNode[]): BlockNode | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const node = path[index];
    if (node.type === 'Block') {
      return node;
    }
  }

  return null;
}

/**
 * buildNodeSpanLookup 함수.
 * token lookup과 AST path를 조합해 feature가 소유해야 할 node span을 계산함.
 *
 * @param content - offset 계산 기준이 되는 fragment 원문
 * @param path - innermost node까지 이어지는 AST node path
 * @param token - cursor와 맞닿은 token lookup
 * @param offset - 검사할 fragment-local cursor offset
 * @returns node span lookup. 의미 있는 owner가 없으면 null
 */
function buildNodeSpanLookup(
  content: string,
  path: readonly CBSNode[],
  token: FragmentTokenLookup | null,
  offset: number,
): FragmentNodeSpanLookup | null {
  const innermostNode = path[path.length - 1];
  if (!innermostNode) {
    return null;
  }

  if (token?.category === 'else') {
    const owner = findNearestBlock(path);
    if (owner?.elseBody) {
      return {
        owner,
        category: 'block-else',
        localRange: token.localRange,
        localStartOffset: token.localStartOffset,
        localEndOffset: token.localEndOffset,
      };
    }
  }

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const candidate = path[index];

    if (candidate.type === 'MacroCall') {
      const nameSpan = rangeToOffsetSpan(content, candidate.nameRange);
      const nameRelation = getSpanRelation(
        nameSpan.localStartOffset,
        nameSpan.localEndOffset,
        offset,
      );
      if (nameRelation !== 'outside') {
        return {
          owner: candidate,
          category: 'macro-name',
          ...nameSpan,
        };
      }

      const argumentSpan = getMacroArgumentSpan(content, candidate, offset);
      if (argumentSpan) {
        const normalizedMacroName = candidate.name.toLowerCase().replace(/[\s_-]/gu, '');
        return {
          owner: candidate,
          category:
            argumentSpan.argumentIndex === 0 && normalizedMacroName === 'call'
              ? 'local-function-reference'
              : argumentSpan.argumentIndex === 0 && normalizedMacroName === 'arg'
                ? 'argument-reference'
                : 'argument',
          localRange: argumentSpan.localRange,
          localStartOffset: argumentSpan.localStartOffset,
          localEndOffset: argumentSpan.localEndOffset,
          argumentIndex: argumentSpan.argumentIndex,
        };
      }

      continue;
    }

    if (candidate.type === 'Block') {
      const openSpan = rangeToOffsetSpan(content, candidate.openRange);
      const openRelation = getSpanRelation(
        openSpan.localStartOffset,
        openSpan.localEndOffset,
        offset,
      );
      if (openRelation !== 'outside') {
        return {
          owner: candidate,
          category: 'block-header',
          ...openSpan,
        };
      }

      if (candidate.closeRange) {
        const closeSpan = rangeToOffsetSpan(content, candidate.closeRange);
        const closeRelation = getSpanRelation(
          closeSpan.localStartOffset,
          closeSpan.localEndOffset,
          offset,
        );
        if (closeRelation !== 'outside') {
          return {
            owner: candidate,
            category: 'block-close',
            ...closeSpan,
          };
        }
      }
    }
  }

  return {
    owner: innermostNode,
    category: 'node-range',
    ...rangeToOffsetSpan(content, innermostNode.range),
  };
}

/**
 * locateTokenAtLocalOffset 함수.
 * fragment-local offset과 맞닿은 token을 token stream에서 찾음.
 *
 * @param fragmentAnalysis - token stream과 fragment 정보를 가진 분석 결과
 * @param localOffset - 검사할 fragment-local cursor offset
 * @returns token lookup. 맞닿은 token이 없으면 null
 */
function locateTokenAtLocalOffset(
  fragmentAnalysis: FragmentDocumentAnalysis,
  localOffset: number,
): FragmentTokenLookup | null {
  let boundaryMatch: FragmentTokenLookup | null = null;

  for (const [tokenIndex, token] of fragmentAnalysis.tokens.entries()) {
    if (token.type === TokenType.EOF) {
      continue;
    }

    const span = rangeToOffsetSpan(fragmentAnalysis.fragment.content, token.range);
    const relation = getSpanRelation(span.localStartOffset, span.localEndOffset, localOffset);
    if (relation === 'strict') {
      return {
        token,
        tokenIndex,
        category: classifyTokenCategory(token),
        ...span,
      };
    }

    if (relation === 'boundary') {
      boundaryMatch = {
        token,
        tokenIndex,
        category: classifyTokenCategory(token),
        ...span,
      };
    }
  }

  return boundaryMatch;
}

/**
 * findFragmentAtHostOffset 함수.
 * host document offset을 포함하는 routed fragment 분석 결과를 찾음.
 *
 * @param documentAnalysis - host 문서 전체 fragment 분석 결과
 * @param hostOffset - 검사할 host document offset
 * @returns host offset을 소유한 fragment 분석 결과. 없으면 null
 */
function findFragmentAtHostOffset(
  documentAnalysis: DocumentFragmentAnalysis,
  hostOffset: number,
): FragmentDocumentAnalysis | null {
  for (const fragmentAnalysis of documentAnalysis.fragmentAnalyses) {
    if (fragmentAnalysis.mapper.containsHostOffset(hostOffset)) {
      return fragmentAnalysis;
    }
  }

  return null;
}

/**
 * locateFragmentAtHostPosition 함수.
 * Host position을 routed CBS fragment의 token, node, recovery 문맥으로 변환함.
 *
 * @param documentAnalysis - host 문서 전체 fragment 분석 결과
 * @param documentContent - host document 전체 원문
 * @param hostPosition - lookup할 host document position
 * @returns fragment cursor lookup 결과. routed fragment 밖이면 null
 */
export function locateFragmentAtHostPosition(
  documentAnalysis: DocumentFragmentAnalysis,
  documentContent: string,
  hostPosition: Position,
): FragmentCursorLookupResult | null {
  const hostOffset = positionToOffset(documentContent, hostPosition);
  const fragmentAnalysis = findFragmentAtHostOffset(documentAnalysis, hostOffset);
  if (!fragmentAnalysis) {
    return null;
  }

  const fragmentLocalOffset = fragmentAnalysis.mapper.toLocalOffset(hostOffset);
  if (fragmentLocalOffset === null) {
    return null;
  }

  const fragmentLocalPosition =
    fragmentAnalysis.mapper.toLocalPosition(documentContent, hostPosition) ??
    offsetToPosition(fragmentAnalysis.fragment.content, fragmentLocalOffset);
  const token = locateTokenAtLocalOffset(fragmentAnalysis, fragmentLocalOffset);
  const nodeLookup = findInnermostNodePath(
    fragmentAnalysis.fragment.content,
    fragmentAnalysis.document.nodes,
    fragmentLocalOffset,
  );
  const nodePath = nodeLookup?.path ?? [];

  return {
    fragmentAnalysis,
    fragment: fragmentAnalysis.fragment,
    fragmentIndex: fragmentAnalysis.fragmentIndex,
    section: fragmentAnalysis.fragment.section,
    fragmentLocalPosition,
    fragmentLocalOffset,
    hostPosition,
    hostOffset,
    recovery: fragmentAnalysis.recovery,
    token,
    node: nodePath[nodePath.length - 1] ?? null,
    nodePath,
    nodeSpan: buildNodeSpanLookup(
      fragmentAnalysis.fragment.content,
      nodePath,
      token,
      fragmentLocalOffset,
    ),
  };
}
