import luaparse, { type Chunk } from 'luaparse';

import type { RisuLuaModuleTableWrapperKind } from './module-table-analyzer-types';

export interface LuaNode {
  type: string;
  range?: [number, number];
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: unknown;
}

export interface LuaIdentifier extends LuaNode {
  type: 'Identifier';
  name: string;
}

export interface LuaFunctionDeclaration extends LuaNode {
  type: 'FunctionDeclaration';
  identifier: LuaIdentifier | LuaMemberExpression | null;
  isLocal: boolean;
  parameters: LuaIdentifier[];
  body: LuaNode[];
}

export interface LuaAssignmentStatement extends LuaNode {
  type: 'AssignmentStatement';
  variables: LuaNode[];
  init: LuaNode[];
}

export interface LuaLocalStatement extends LuaNode {
  type: 'LocalStatement';
  variables: LuaIdentifier[];
  init: LuaNode[];
}

export interface LuaCallStatement extends LuaNode {
  type: 'CallStatement';
  expression: LuaCallExpression;
}

export interface LuaCallExpression extends LuaNode {
  type: 'CallExpression';
  base: LuaNode;
  arguments: LuaNode[];
}

export interface LuaMemberExpression extends LuaNode {
  type: 'MemberExpression';
  base: LuaNode;
  identifier: LuaIdentifier;
  indexer: string;
}

export interface LuaIndexExpression extends LuaNode {
  type: 'IndexExpression';
  base: LuaNode;
  index: LuaNode;
}

export function parseLuaBody(source: string): LuaNode[] {
  const ast = luaparse.parse(source, {
    comments: false,
    locations: true,
    ranges: true,
    scope: true,
    luaVersion: '5.3',
  }) as unknown as Chunk;
  return (ast.body as LuaNode[]) ?? [];
}

export function functionLikeInitializer(node: LuaNode | undefined): { functionNode: LuaFunctionDeclaration; wrapperKind: RisuLuaModuleTableWrapperKind } | undefined {
  if (node === undefined) return undefined;
  if (isFunctionDeclaration(node)) return { functionNode: node, wrapperKind: 'plain-function' };
  if (node.type === 'CallExpression') {
    const call = node as LuaCallExpression;
    if (expressionName(call.base) === 'async') {
      const functionNode = call.arguments.find(isFunctionDeclaration);
      if (functionNode !== undefined) return { functionNode, wrapperKind: 'async-wrapper' };
    }
  }
  return undefined;
}

export function isFunctionDeclaration(node: LuaNode): node is LuaFunctionDeclaration {
  return node.type === 'FunctionDeclaration';
}

export function expressionName(node: LuaNode | null | undefined): string | undefined {
  if (node === null || node === undefined) return undefined;
  if (node.type === 'Identifier') return (node as LuaIdentifier).name;
  if (node.type === 'MemberExpression') {
    const member = node as LuaMemberExpression;
    const base = expressionName(member.base);
    return base === undefined ? undefined : `${base}.${member.identifier.name}`;
  }
  if (node.type === 'IndexExpression') return expressionName((node as LuaIndexExpression).base);
  return undefined;
}

export function baseIdentifierName(node: LuaNode | undefined): string | undefined {
  if (node === undefined) return undefined;
  if (node.type === 'Identifier') return (node as LuaIdentifier).name;
  if (node.type === 'MemberExpression') return baseIdentifierName((node as LuaMemberExpression).base);
  if (node.type === 'IndexExpression') return baseIdentifierName((node as LuaIndexExpression).base);
  return undefined;
}

export function childrenOf(node: LuaNode): LuaNode[] {
  const children: LuaNode[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isLuaNode(item)) children.push(item);
    } else if (isLuaNode(value)) {
      children.push(value);
    }
  }
  return children;
}

export function getNodeRange(node: LuaNode): { startOffset: number; endOffset: number } | undefined {
  if (!Array.isArray(node.range) || node.range.length !== 2) return undefined;
  return { startOffset: node.range[0], endOffset: node.range[1] };
}

function isLuaNode(value: unknown): value is LuaNode {
  return typeof value === 'object' && value !== null && typeof (value as LuaNode).type === 'string';
}
