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

type SpanRelation = 'strict' | 'boundary' | 'outside';

interface OffsetSpan {
  localRange: Range;
  localStartOffset: number;
  localEndOffset: number;
}

interface NodePathLookup {
  path: readonly CBSNode[];
  relation: Exclude<SpanRelation, 'outside'>;
}

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

export type FragmentNodeSpanCategory =
  | 'macro-name'
  | 'argument'
  | 'argument-reference'
  | 'block-header'
  | 'block-close'
  | 'block-else'
  | 'local-function-reference'
  | 'node-range';

export interface FragmentTokenLookup extends OffsetSpan {
  token: Token;
  tokenIndex: number;
  category: FragmentTokenSpanCategory;
}

export interface FragmentNodeSpanLookup extends OffsetSpan {
  owner: CBSNode;
  category: FragmentNodeSpanCategory;
  argumentIndex?: number;
}

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

function rangeToOffsetSpan(text: string, range: Range): OffsetSpan {
  return {
    localRange: range,
    localStartOffset: positionToOffset(text, range.start),
    localEndOffset: positionToOffset(text, range.end),
  };
}

function getSpanRelation(startOffset: number, endOffset: number, offset: number): SpanRelation {
  if (offset >= startOffset && offset < endOffset) {
    return 'strict';
  }

  if (startOffset < endOffset && endOffset === offset) {
    return 'boundary';
  }

  return 'outside';
}

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

function findNearestBlock(path: readonly CBSNode[]): BlockNode | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const node = path[index];
    if (node.type === 'Block') {
      return node;
    }
  }

  return null;
}

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
