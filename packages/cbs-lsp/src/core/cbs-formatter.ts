/**
 * CBS AST를 canonical fragment text로 직렬화하는 formatter 유틸.
 * 현재 contract는 pretty formatter가 아니라 canonical serializer이며,
 * 들여쓰기/줄바꿈/tabSize 옵션 반영 같은 editor polish는 보장하지 않는다.
 * @file packages/cbs-lsp/src/core/cbs-formatter.ts
 */

import type { BlockKind, BlockNode, CBSDocument, CBSNode } from 'risu-workbench-core';

/**
 * getCanonicalBlockName 함수.
 * block kind를 formatter가 재출력할 canonical 이름으로 변환함.
 *
 * @param kind - AST block kind
 * @returns canonical block header/close 이름
 */
function getCanonicalBlockName(kind: BlockKind): string {
  return kind;
}

/**
 * printNodes 함수.
 * CBS node 배열을 canonical fragment text로 직렬화함.
 *
 * @param nodes - 직렬화할 CBS AST node 목록
 * @returns canonical fragment text
 */
function printNodes(nodes: readonly CBSNode[]): string {
  return nodes.map((node) => printNode(node)).join('');
}

/**
 * printBlockOpen 함수.
 * block node의 open macro를 canonical header 문자열로 만듦.
 *
 * @param node - 직렬화할 block node
 * @returns canonical open block macro
 */
function printBlockOpen(node: BlockNode): string {
  const blockName = getCanonicalBlockName(node.kind);
  const segments = [...node.operators];
  const conditionText = printNodes(node.condition);

  if (conditionText.length > 0) {
    segments.push(conditionText);
  }

  const suffix = segments.length > 0 ? `::${segments.join('::')}` : '';
  return `{{#${blockName}${suffix}}}`;
}

/**
 * printNode 함수.
 * CBS node 하나를 canonical text로 직렬화함.
 *
 * @param node - 직렬화할 AST node
 * @returns node의 canonical text
 */
function printNode(node: CBSNode): string {
  switch (node.type) {
    case 'PlainText':
      return node.value;
    case 'MacroCall': {
      const argumentsText = node.arguments.map((segment) => printNodes(segment));
      const suffix = argumentsText.length > 0 ? `::${argumentsText.join('::')}` : '';
      return `{{${node.name}${suffix}}}`;
    }
    case 'Block': {
      const body = printNodes(node.body);
      const elseBody = node.elseBody ? `{{:else}}${printNodes(node.elseBody)}` : '';
      return `${printBlockOpen(node)}${body}${elseBody}{{/${getCanonicalBlockName(node.kind)}}}`;
    }
    case 'Comment':
      return node.value.trim().length > 0 ? `{{// ${node.value.trim()}}}` : '{{//}}';
    case 'MathExpr':
      return node.expression.trim().length > 0 ? `{{? ${node.expression.trim()}}}` : '{{?}}';
  }
}

/**
 * formatCbsDocument 함수.
 * parser가 만든 CBS document를 canonical fragment text로 재직렬화함.
 * macro spacing, shorthand close tag 같은 구조적 표기만 canonicalize하며,
 * block indentation이나 option-aware pretty layout은 의도적으로 수행하지 않음.
 *
 * @param document - format 대상 CBS document
 * @returns canonical CBS fragment text
 */
export function formatCbsDocument(document: CBSDocument): string {
  return printNodes(document.nodes);
}
