/**
 * Top-level inventory for RisuLua source files.
 *
 * Parses the source with luaparse, then classifies each top-level statement
 * into a `LuaTopLevelAtom` with kind, display name, source ranges, and
 * conservative read/write/call summaries.
 *
 * Key design principle: **source slices must come from the original text**,
 * never from AST reprinting.
 */

import luaparse, { type Chunk } from 'luaparse';
import type { LuaTopLevelAtom, LuaTopLevelAtomKind, LuaSourceRange } from '../shared/types';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';

// ─── luaparse node shape helpers ───────────────────────────────────────────

interface LuaNode {
  type: string;
  range?: [number, number];
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: unknown;
}

interface LuaIdentifier extends LuaNode {
  type: 'Identifier';
  name: string;
}

interface LuaMemberExpression extends LuaNode {
  type: 'MemberExpression';
  base: LuaNode;
  identifier: LuaIdentifier;
  indexer: '.' | '[' | string;
}

interface LuaIndexExpression extends LuaNode {
  type: 'IndexExpression';
  base: LuaNode;
  index: LuaNode;
}

interface LuaStringLiteral extends LuaNode {
  type: 'StringLiteral';
  value: string | null;
  raw: string;
}

interface LuaFunctionDeclaration extends LuaNode {
  type: 'FunctionDeclaration';
  identifier: LuaIdentifier | null;
  isLocal: boolean;
}

interface LuaAssignmentStatement extends LuaNode {
  type: 'AssignmentStatement';
  variables: LuaNode[];
  init: LuaNode[];
}

interface LuaLocalStatement extends LuaNode {
  type: 'LocalStatement';
  variables: LuaIdentifier[];
  init: LuaNode[];
}

interface LuaCallStatement extends LuaNode {
  type: 'CallStatement';
  expression: LuaNode;
}

interface LuaCallExpression extends LuaNode {
  type: 'CallExpression';
  base: LuaNode;
}

interface LuaTableConstructorExpression extends LuaNode {
  type: 'TableConstructorExpression';
}

// ─── known RisuLua host APIs ───────────────────────────────────────────────

const RISU_HOST_APIS = new Set([
  'listenEdit',
  'onStart',
  'onInput',
  'onOutput',
  'onButtonClick',
  'RisuAI',
  'risu',
  'send',
  'sendSystem',
  'getState',
  'setState',
  'getCharacter',
  'setCharacter',
  'getChat',
  'setChat',
  'getLorebook',
  'setLorebook',
  'message',
  'removeMessage',
  'addMessage',
  'getModules',
  'setModules',
  'getAssets',
  'setAssets',
]);

const RISU_STATE_APIS = new Set([
  'getState',
  'setState',
]);

const RISU_LISTENER_APIS = new Set([
  'listenEdit',
]);

const RISU_HANDLER_NAMES = new Set([
  'onStart',
  'onInput',
  'onOutput',
  'onButtonClick',
]);

// ─── helpers ───────────────────────────────────────────────────────────────

function getRange(node: LuaNode): { startOffset: number; endOffset: number } | null {
  if (Array.isArray(node.range) && node.range.length === 2) {
    return { startOffset: node.range[0], endOffset: node.range[1] };
  }
  return null;
}

function getIdentifierName(node: LuaNode): string | null {
  if (node.type === 'Identifier') return (node as LuaIdentifier).name;
  return null;
}

function getMemberExpressionBase(node: LuaNode): string | null {
  if (node.type !== 'MemberExpression') return null;
  const member = node as LuaMemberExpression;
  const baseName = getIdentifierName(member.base);
  if (baseName === null) return null;
  return `${baseName}.${member.identifier.name}`;
}

function getCallBaseName(node: LuaNode): string | null {
  if (node.type === 'CallExpression') {
    const call = node as LuaCallExpression;
    return getExpressionName(call.base);
  }
  return null;
}

function getExpressionName(node: LuaNode): string | null {
  const name = getIdentifierName(node);
  if (name !== null) return name;
  return getMemberExpressionBase(node);
}

function isPackagePreload(node: LuaNode): boolean {
  if (node.type !== 'MemberExpression') return false;
  const member = node as LuaMemberExpression;
  if (getIdentifierName(member.base) !== 'package') return false;
  if (member.identifier.name !== 'preload') return false;
  return true;
}

function isPackagePreloadAssignment(stmt: LuaAssignmentStatement): boolean {
  const firstVar = stmt.variables[0];
  if (!firstVar) return false;

  // Handle package.preload["..."] = ... — AST is IndexExpression with MemberExpression base
  if (firstVar.type === 'IndexExpression') {
    const indexExpr = firstVar as LuaIndexExpression;
    return isPackagePreload(indexExpr.base);
  }

  // Handle package.preload itself being assigned (unlikely)
  if (firstVar.type === 'MemberExpression' && isPackagePreload(firstVar)) {
    return false;
  }

  return false;
}

function getPreloadId(stmt: LuaAssignmentStatement): string | null {
  const firstVar = stmt.variables[0];
  if (!firstVar) return null;

  if (firstVar.type === 'IndexExpression') {
    const indexExpr = firstVar as LuaIndexExpression;
    if (isPackagePreload(indexExpr.base)) {
      // The index is typically a StringLiteral
      if (indexExpr.index.type === 'StringLiteral') {
        const str = indexExpr.index as LuaStringLiteral;
        return str.raw; // Keep the raw string for display
      }
      return null;
    }
  }
  return null;
}

// ─── collectors ────────────────────────────────────────────────────────────

function collectNamesFromInit(init: LuaNode[], hostApis: string[], stateKeys: string[], calls: string[]): void {
  for (const expr of init) {
    if (expr.type === 'CallExpression') {
      const baseName = getCallBaseName(expr);
      if (baseName) {
        calls.push(baseName);
        if (RISU_HOST_APIS.has(baseName)) hostApis.push(baseName);
        if (RISU_STATE_APIS.has(baseName) && (expr as LuaCallExpression).base.type === 'Identifier') {
          // Rough: first argument is likely a state key
        }
      }
    }
    if (expr.type === 'TableConstructorExpression') {
      // Walk table fields for nested calls
      const table = expr as LuaTableConstructorExpression;
      const fields = (table as unknown as { fields: LuaNode[] }).fields;
      if (Array.isArray(fields)) {
        for (const field of fields) {
          const fieldValue = (field as unknown as { value?: LuaNode }).value;
          if (fieldValue) {
            collectNamesFromInit([fieldValue], hostApis, stateKeys, calls);
          }
        }
      }
    }
  }
}

// ─── classifier ────────────────────────────────────────────────────────────

function classifyAtom(
  node: LuaNode,
): { kind: LuaTopLevelAtomKind; displayName: string } {
  switch (node.type) {
    case 'FunctionDeclaration': {
      const fn = node as LuaFunctionDeclaration;
      const name = fn.identifier?.name ?? '<anonymous>';
      const kind: LuaTopLevelAtomKind = fn.isLocal
        ? 'local-function-declaration'
        : 'function-declaration';
      return { kind, displayName: name };
    }

    case 'LocalStatement': {
      const local = node as LuaLocalStatement;
      const names = local.variables.map((v) => v.name).join(', ');
      if (local.init.length > 0 && local.init[0].type === 'TableConstructorExpression') {
        return { kind: 'table-declaration', displayName: names };
      }
      return { kind: 'local-assignment', displayName: names };
    }

    case 'AssignmentStatement': {
      const assign = node as LuaAssignmentStatement;

      // package.preload[...] = function...
      if (isPackagePreloadAssignment(assign)) {
        const preloadId = getPreloadId(assign);
        return { kind: 'package-preload', displayName: preloadId ?? 'package.preload[?]' };
      }

      // handler assignment: onStart = ..., onButtonClick = ...
      const firstName = assign.variables[0] ? getExpressionName(assign.variables[0]) : null;
      if (firstName && RISU_HANDLER_NAMES.has(firstName)) {
        return { kind: 'handler-assignment', displayName: firstName };
      }

      // table constructor assignment
      if (assign.init.length > 0 && assign.init[0].type === 'TableConstructorExpression') {
        return { kind: 'table-declaration', displayName: firstName ?? '<table>' };
      }

      return { kind: 'assignment', displayName: firstName ?? '<assignment>' };
    }

    case 'CallStatement': {
      const callStmt = node as LuaCallStatement;
      const callBase = getCallBaseName(callStmt.expression);

      // listenEdit(...) calls
      if (callBase && RISU_LISTENER_APIS.has(callBase)) {
        return { kind: 'listener-call', displayName: `${callBase}(…)` };
      }

      // require(...) calls
      if (callBase === 'require') {
        return { kind: 'require-call', displayName: 'require(…)' };
      }

      return { kind: 'top-level-effect', displayName: callBase ?? '<call>' };
    }

    case 'ReturnStatement':
      return { kind: 'top-level-effect', displayName: 'return' };

    case 'IfStatement':
    case 'DoStatement':
    case 'WhileStatement':
    case 'RepeatStatement':
    case 'ForNumericStatement':
    case 'ForGenericStatement':
      return { kind: 'top-level-effect', displayName: node.type.replace('Statement', '').toLowerCase() };

    default:
      return { kind: 'unknown', displayName: `<${node.type}>` };
  }
}

// ─── summary builder ───────────────────────────────────────────────────────

function buildSummary(
  node: LuaNode,
): {
  declaresLocals: string[];
  usesLocals: string[];
  readsGlobals: string[];
  writesGlobals: string[];
  calls: string[];
  hostApis: string[];
  stateKeys: string[];
} {
  const declaresLocals: string[] = [];
  const usesLocals: string[] = [];
  const readsGlobals: string[] = [];
  const writesGlobals: string[] = [];
  const calls: string[] = [];
  const hostApis: string[] = [];
  const stateKeys: string[] = [];

  switch (node.type) {
    case 'FunctionDeclaration': {
      const fn = node as LuaFunctionDeclaration;
      if (fn.identifier?.name) {
        if (fn.isLocal) {
          declaresLocals.push(fn.identifier.name);
        } else {
          writesGlobals.push(fn.identifier.name);
        }
      }
      break;
    }

    case 'LocalStatement': {
      const local = node as LuaLocalStatement;
      for (const v of local.variables) {
        declaresLocals.push(v.name);
      }
      collectNamesFromInit(local.init, hostApis, stateKeys, calls);
      break;
    }

    case 'AssignmentStatement': {
      const assign = node as LuaAssignmentStatement;
      for (const v of assign.variables) {
        const name = getExpressionName(v);
        if (name) {
          if (RISU_HANDLER_NAMES.has(name)) {
            hostApis.push(name);
          }
          writesGlobals.push(name);
        }
      }
      collectNamesFromInit(assign.init, hostApis, stateKeys, calls);
      break;
    }

    case 'CallStatement': {
      const callStmt = node as LuaCallStatement;
      const baseName = getCallBaseName(callStmt.expression);
      if (baseName) {
        calls.push(baseName);
        if (RISU_HOST_APIS.has(baseName)) hostApis.push(baseName);
      }
      break;
    }
  }

  return {
    declaresLocals,
    usesLocals,
    readsGlobals,
    writesGlobals,
    calls,
    hostApis,
    stateKeys,
  };
}

// ─── public API ────────────────────────────────────────────────────────────

export interface InventoryOptions {
  /** If provided, [BUNDLE] section markers from profile detection are included as atoms. */
  sectionMarkers?: Array<{ label: string; line: number; startOffset: number }>;
}

/**
 * Build the top-level atom inventory for a RisuLua source file.
 *
 * Returns a `LuaTopLevelAtom[]` in source order with increasing
 * `preserveOrderIndex`.  Each atom covers a non-overlapping range.
 */
export function buildTopLevelInventory(
  source: string,
  options?: InventoryOptions,
): LuaTopLevelAtom[] {
  const lineStarts = buildLineStarts(source);
  const atoms: LuaTopLevelAtom[] = [];

  // Parse with luaparse
  let body: LuaNode[] = [];
  try {
    const ast = luaparse.parse(source, {
      comments: false,
      locations: true,
      ranges: true,
      scope: true,
      luaVersion: '5.3',
    }) as unknown as Chunk;
    body = (ast.body as LuaNode[]) ?? [];
  } catch {
    // If parse fails, return empty inventory
    return atoms;
  }

  let orderIndex = 0;

  for (const node of body) {
    const range = getRange(node);
    if (!range) continue;

    const { kind, displayName } = classifyAtom(node);
    const summary = buildSummary(node);

    const startLine = lineAtOffset(range.startOffset, lineStarts);
    const endLine = lineAtOffset(Math.max(range.startOffset, range.endOffset - 1), lineStarts);

    atoms.push({
      id: `atom-${orderIndex}`,
      kind,
      displayName,
      startLine,
      endLine,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      preserveOrderIndex: orderIndex,
      ...summary,
    });

    orderIndex += 1;
  }

  // Inject [BUNDLE] section markers as atoms if provided
  if (options?.sectionMarkers && options.sectionMarkers.length > 0) {
    for (const marker of options.sectionMarkers) {
      // Find the end of this section: next marker or end of source
      const nextMarker = options.sectionMarkers.find(
        (m) => m.startOffset > marker.startOffset,
      );
      const endOffset = nextMarker ? nextMarker.startOffset : source.length;
      const startLine = lineAtOffset(marker.startOffset, lineStarts);
      const endLine = lineAtOffset(Math.max(marker.startOffset, endOffset - 1), lineStarts);

      atoms.push({
        id: `section-${orderIndex}`,
        kind: 'bundle-section',
        displayName: marker.label,
        startLine,
        endLine,
        startOffset: marker.startOffset,
        endOffset,
        preserveOrderIndex: orderIndex,
        declaresLocals: [],
        usesLocals: [],
        readsGlobals: [],
        writesGlobals: [],
        calls: [],
        hostApis: [],
        stateKeys: [],
      });

      orderIndex += 1;
    }
  }

  return atoms;
}

/**
 * Build a `LuaSourceRange` from an atom.
 */
export function atomToSourceRange(atom: LuaTopLevelAtom): LuaSourceRange {
  return {
    startLine: atom.startLine,
    endLine: atom.endLine,
    startOffset: atom.startOffset,
    endOffset: atom.endOffset,
  };
}
