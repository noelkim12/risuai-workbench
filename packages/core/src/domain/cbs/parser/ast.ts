import type { Range } from './tokens';

export type CBSNode = PlainTextNode | MacroCallNode | BlockNode | CommentNode | MathExprNode;

export interface PlainTextNode {
  type: 'PlainText';
  value: string;
  range: Range;
}

export interface MacroCallNode {
  type: 'MacroCall';
  name: string;
  arguments: CBSNode[][]; // Each argument is a sequence of nodes (supports nesting)
  range: Range;
  nameRange: Range;
}

export type BlockKind =
  | 'when'
  | 'each'
  | 'if'
  | 'if_pure'
  | 'escape'
  | 'puredisplay'
  | 'pure'
  | 'func';

export interface BlockNode {
  type: 'Block';
  kind: BlockKind;
  operators: string[]; // keep, legacy, etc.
  condition: CBSNode[];
  body: CBSNode[];
  elseBody?: CBSNode[];
  range: Range;
  openRange: Range; // {{#when ...}} range
  closeRange?: Range; // {{/when}} range (undefined if unclosed)
}

export interface CommentNode {
  type: 'Comment';
  value: string;
  range: Range;
}

export interface MathExprNode {
  type: 'MathExpr';
  expression: string;
  range: Range;
}

export interface CBSDocument {
  nodes: CBSNode[];
  diagnostics: DiagnosticInfo[];
}

export interface DiagnosticInfo {
  message: string;
  range: Range;
  severity: 'error' | 'warning' | 'info';
  code: string;
}
