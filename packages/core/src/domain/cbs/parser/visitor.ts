import {
  CBSNode,
  PlainTextNode,
  MacroCallNode,
  BlockNode,
  CommentNode,
  MathExprNode,
} from './ast'

export interface CBSVisitor {
  visitPlainText?(node: PlainTextNode): void
  visitMacroCall?(node: MacroCallNode): void
  visitBlock?(node: BlockNode): void
  visitComment?(node: CommentNode): void
  visitMathExpr?(node: MathExprNode): void
}

export function walkAST(nodes: CBSNode[], visitor: CBSVisitor): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'PlainText':
        visitor.visitPlainText?.(node)
        break
      case 'MacroCall':
        visitor.visitMacroCall?.(node)
        for (const arg of node.arguments) {
          walkAST(arg, visitor)
        }
        break
      case 'Block':
        visitor.visitBlock?.(node)
        walkAST(node.condition, visitor)
        walkAST(node.body, visitor)
        if (node.elseBody) {
          walkAST(node.elseBody, visitor)
        }
        break
      case 'Comment':
        visitor.visitComment?.(node)
        break
      case 'MathExpr':
        visitor.visitMathExpr?.(node)
        walkAST(node.children, visitor)
        break
    }
  }
}
