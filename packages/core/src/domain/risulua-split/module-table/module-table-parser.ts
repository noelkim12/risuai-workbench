import Parser from 'tree-sitter';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';
import type { LuaSourceRange } from '../shared/types';
import {
  createRisuLuaUtf8ByteStringMap,
  type RisuLuaStringIndexRange,
  type RisuLuaUtf8ByteRange,
  type RisuLuaUtf8ByteStringMap,
} from '../shared/utf8-byte-range-map';

type LuaGrammarModule = typeof import('@tree-sitter-grammars/tree-sitter-lua');
type DynamicImport = (specifier: string) => Promise<LuaGrammarModule>;

export interface RisuLuaTreeSitterPoint {
  row: number;
  column: number;
}

export interface RisuLuaTreeSitterPointRange {
  startPoint: RisuLuaTreeSitterPoint;
  endPoint: RisuLuaTreeSitterPoint;
}

export type RisuLuaModuleTableRangeKind = 'executable-candidate' | 'non-executable';

export interface RisuLuaModuleTableParserRange {
  kind: RisuLuaModuleTableRangeKind;
  nodeType: string;
  byteRange: RisuLuaUtf8ByteRange;
  pointRange: RisuLuaTreeSitterPointRange;
  stringRange: RisuLuaStringIndexRange;
  sourceRange: LuaSourceRange;
  text: string;
}

export interface RisuLuaModuleTableSyntaxError {
  nodeType: string;
  byteRange: RisuLuaUtf8ByteRange;
  pointRange: RisuLuaTreeSitterPointRange;
  stringRange: RisuLuaStringIndexRange;
  message: string;
}

export interface RisuLuaModuleTableParseMetrics {
  lineStartsBuildCount: number;
}

export interface RisuLuaModuleTableParseFailure {
  ok: false;
  parser: 'tree-sitter-lua';
  rewriteEligible: false;
  byteStringMap: RisuLuaUtf8ByteStringMap;
  syntaxErrors: RisuLuaModuleTableSyntaxError[];
  executableRanges: [];
  nonExecutableRanges: RisuLuaModuleTableParserRange[];
  metrics: RisuLuaModuleTableParseMetrics;
}

export interface RisuLuaModuleTableParseSuccess {
  ok: true;
  parser: 'tree-sitter-lua';
  rewriteEligible: true;
  byteStringMap: RisuLuaUtf8ByteStringMap;
  syntaxErrors: [];
  executableRanges: RisuLuaModuleTableParserRange[];
  nonExecutableRanges: RisuLuaModuleTableParserRange[];
  metrics: RisuLuaModuleTableParseMetrics;
}

export type RisuLuaModuleTableParseResult = RisuLuaModuleTableParseSuccess | RisuLuaModuleTableParseFailure;

const EXECUTABLE_CANDIDATE_NODE_TYPES = new Set([
  'assignment_statement',
  'dot_index_expression',
  'function_call',
  'function_declaration',
  'function_definition',
  'identifier',
  'method_index_expression',
  'table_constructor',
  'variable_declaration',
]);

const NON_EXECUTABLE_NODE_TYPES = new Set([
  'comment',
  'string',
]);

const LUA_GRAMMAR_RUNTIME_SPECIFIER = '@tree-sitter-grammars/tree-sitter-lua/bindings/node/index.js';

let parserPromise: Promise<Parser> | undefined;

export async function parseRisuLuaModuleTableSource(source: string): Promise<RisuLuaModuleTableParseResult> {
  const lineStarts = buildLineStarts(source);
  const byteStringMap = createRisuLuaUtf8ByteStringMap(source);
  const parser = await getRisuLuaTreeSitterParser();
  const tree = parser.parse(source);
  const root = tree.rootNode;
  const nonExecutableRanges: RisuLuaModuleTableParserRange[] = [];
  const executableRanges: RisuLuaModuleTableParserRange[] = [];
  const syntaxErrors: RisuLuaModuleTableSyntaxError[] = [];

  collectRanges(root, source, lineStarts, byteStringMap, executableRanges, nonExecutableRanges, syntaxErrors, false);

  if (root.hasError || syntaxErrors.length > 0) {
    return {
      ok: false,
      parser: 'tree-sitter-lua',
      rewriteEligible: false,
      byteStringMap,
      syntaxErrors,
      executableRanges: [],
      nonExecutableRanges,
      metrics: { lineStartsBuildCount: 1 },
    };
  }

  return {
    ok: true,
    parser: 'tree-sitter-lua',
    rewriteEligible: true,
    byteStringMap,
    syntaxErrors: [],
    executableRanges,
    nonExecutableRanges,
    metrics: { lineStartsBuildCount: 1 },
  };
}

async function getRisuLuaTreeSitterParser(): Promise<Parser> {
  if (parserPromise === undefined) {
    parserPromise = createRisuLuaTreeSitterParser();
  }
  return parserPromise;
}

async function createRisuLuaTreeSitterParser(): Promise<Parser> {
  const lua = await importLuaGrammarModule();
  const parser = new Parser();
  parser.setLanguage(lua.default as Parser.Language);
  return parser;
}

async function importLuaGrammarModule(): Promise<LuaGrammarModule> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as DynamicImport;
  try {
    return await dynamicImport(LUA_GRAMMAR_RUNTIME_SPECIFIER);
  } catch (error) {
    if (!isVmDynamicImportCallbackError(error)) throw error;
    return import('@tree-sitter-grammars/tree-sitter-lua');
  }
}

function isVmDynamicImportCallbackError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('dynamic import callback');
}

function collectRanges(
  node: Parser.SyntaxNode,
  source: string,
  lineStarts: number[],
  byteStringMap: RisuLuaUtf8ByteStringMap,
  executableRanges: RisuLuaModuleTableParserRange[],
  nonExecutableRanges: RisuLuaModuleTableParserRange[],
  syntaxErrors: RisuLuaModuleTableSyntaxError[],
  insideNonExecutable: boolean,
): boolean {
  const currentIsNonExecutable = NON_EXECUTABLE_NODE_TYPES.has(node.type);
  const excludedFromExecutable = insideNonExecutable || currentIsNonExecutable;

  if (node.isError || node.isMissing || node.type === 'ERROR') {
    syntaxErrors.push(buildSyntaxError(node, byteStringMap));
  }

  // If current node is non-executable, record it and process children
  if (currentIsNonExecutable) {
    nonExecutableRanges.push(buildParserRange('non-executable', node, source, lineStarts, byteStringMap));
    // Process children - they are inside non-executable context
    for (const child of node.children) {
      collectRanges(
        child,
        source,
        lineStarts,
        byteStringMap,
        executableRanges,
        nonExecutableRanges,
        syntaxErrors,
        true, // children are inside non-executable
      );
    }
    return true; // This node is non-executable
  }

  // For executable nodes: process children first (post-order) to detect non-executable descendants
  let hasNonExecutableDescendant = false;
  for (const child of node.children) {
    const childHasNonExecutable = collectRanges(
      child,
      source,
      lineStarts,
      byteStringMap,
      executableRanges,
      nonExecutableRanges,
      syntaxErrors,
      excludedFromExecutable,
    );
    if (childHasNonExecutable) {
      hasNonExecutableDescendant = true;
    }
  }

  // After processing children, decide if this node is an executable candidate
  if (
    !excludedFromExecutable
    && EXECUTABLE_CANDIDATE_NODE_TYPES.has(node.type)
    && !hasNonExecutableDescendant
  ) {
    executableRanges.push(buildParserRange('executable-candidate', node, source, lineStarts, byteStringMap));
  }

  return hasNonExecutableDescendant;
}

function buildParserRange(
  kind: RisuLuaModuleTableRangeKind,
  node: Parser.SyntaxNode,
  source: string,
  lineStarts: number[],
  byteStringMap: RisuLuaUtf8ByteStringMap,
): RisuLuaModuleTableParserRange {
  const stringRange = { startIndex: node.startIndex, endIndex: node.endIndex };
  const byteRange = byteStringMap.jsRangeToByteRange(stringRange);
  return {
    kind,
    nodeType: node.type,
    byteRange,
    pointRange: {
      startPoint: { row: node.startPosition.row, column: node.startPosition.column },
      endPoint: { row: node.endPosition.row, column: node.endPosition.column },
    },
    stringRange: byteStringMap.byteRangeToJsRange(byteRange),
    sourceRange: toLuaSourceRange(stringRange, lineStarts),
    text: source.slice(stringRange.startIndex, stringRange.endIndex),
  };
}

function buildSyntaxError(
  node: Parser.SyntaxNode,
  byteStringMap: RisuLuaUtf8ByteStringMap,
): RisuLuaModuleTableSyntaxError {
  const stringRange = { startIndex: node.startIndex, endIndex: node.endIndex };
  const byteRange = byteStringMap.jsRangeToByteRange(stringRange);
  return {
    nodeType: node.type,
    byteRange,
    pointRange: {
      startPoint: { row: node.startPosition.row, column: node.startPosition.column },
      endPoint: { row: node.endPosition.row, column: node.endPosition.column },
    },
    stringRange: byteStringMap.byteRangeToJsRange(byteRange),
    message: node.isMissing ? `Missing Lua syntax node: ${node.type}` : `Lua syntax error node: ${node.type}`,
  };
}

function toLuaSourceRange(range: RisuLuaStringIndexRange, lineStarts: number[]): LuaSourceRange {
  return {
    startLine: lineAtOffset(range.startIndex, lineStarts),
    endLine: lineAtOffset(Math.max(range.startIndex, range.endIndex - 1), lineStarts),
    startOffset: range.startIndex,
    endOffset: range.endIndex,
  };
}
