import {
  CBSTokenizer,
  TokenType,
  walkAST,
  type BlockNode,
  type CBSBuiltinFunction,
  type CBSNode,
  type CBSDocument,
  type DiagnosticInfo,
  type MathExprNode,
  type Range,
  type CBSBuiltinRegistry,
} from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../utils/position';
import {
  type UndefinedVariableReference,
  type VariableSymbol,
  type SymbolTable,
} from './symbolTable';

const WHEN_MODE_OPERATORS = new Set(['keep', 'legacy']);
const WHEN_UNARY_OPERATORS = new Set(['not', 'toggle', 'var']);
const WHEN_BINARY_OPERATORS = new Set([
  'and',
  'or',
  'is',
  'isnot',
  '>',
  '<',
  '>=',
  '<=',
  'vis',
  'visnot',
  'tis',
  'tisnot',
]);
const EACH_MODE_OPERATORS = new Set(['keep']);
const MATH_OPERATORS = ['>=', '<=', '==', '!=', '+', '-', '*', '/', '%', '^', '<', '>'] as const;
const LOOP_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export interface BlockHeaderInfo {
  rawName: string;
  tail: string;
}

export interface EachLoopBinding {
  iteratorExpression: string;
  bindingName: string;
  bindingRange: Range;
}

export function parseBlockHeaderSegments(rawTail: string): string[] {
  const trimmedStart = rawTail.trimStart();
  if (trimmedStart.length === 0) {
    return [];
  }

  if (!trimmedStart.startsWith('::')) {
    return [trimmedStart.trim()];
  }

  return trimmedStart
    .slice(2)
    .split('::')
    .map((segment) => segment.trim());
}

export function stripLeadingBlockHeaderOperators(
  segments: string[],
  allowed: ReadonlySet<string>,
): string[] {
  let index = 0;

  while (index < segments.length && allowed.has(segments[index].toLowerCase())) {
    index += 1;
  }

  return segments.slice(index);
}

export function extractBlockHeaderInfo(
  node: BlockNode,
  sourceText: string,
): BlockHeaderInfo | null {
  const rawHeader = sliceSourceRange(sourceText, node.openRange);
  const inner = rawHeader
    .replace(/^\{\{\s*/, '')
    .replace(/\}\}\s*$/, '')
    .trim();
  const match = inner.match(/^([^\s:]+)([\s\S]*)$/);
  if (!match) {
    return null;
  }

  return {
    rawName: match[1],
    tail: match[2] ?? '',
  };
}

export function extractEachLoopBinding(
  node: BlockNode,
  sourceText: string,
): EachLoopBinding | null {
  const header = extractBlockHeaderInfo(node, sourceText);
  if (!header || header.rawName.toLowerCase() !== '#each') {
    return null;
  }

  const segments = stripLeadingBlockHeaderOperators(
    parseBlockHeaderSegments(header.tail),
    EACH_MODE_OPERATORS,
  );
  const headerText = segments.join('::').trim();
  if (headerText.length === 0) {
    return null;
  }

  const asMatch = headerText.match(/^(.*?)\s+as\s+(.+)$/i);
  if (!asMatch) {
    return null;
  }

  const iteratorExpression = asMatch[1]?.trim() ?? '';
  const bindingName = asMatch[2]?.trim() ?? '';
  if (
    iteratorExpression.length === 0 ||
    bindingName.length === 0 ||
    !LOOP_VARIABLE_NAME_PATTERN.test(bindingName)
  ) {
    return null;
  }

  const rawHeader = sliceSourceRange(sourceText, node.openRange);
  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const bindingStartIndex = rawHeader.lastIndexOf(bindingName);
  if (bindingStartIndex === -1) {
    return null;
  }

  const bindingStartOffset = openOffset + bindingStartIndex;
  const bindingEndOffset = bindingStartOffset + bindingName.length;

  return {
    iteratorExpression,
    bindingName,
    bindingRange: {
      start: offsetToPosition(sourceText, bindingStartOffset),
      end: offsetToPosition(sourceText, bindingEndOffset),
    },
  };
}

function sliceSourceRange(sourceText: string, range: Range): string {
  const startOffset = positionToOffset(sourceText, range.start);
  const endOffset = positionToOffset(sourceText, range.end);
  return sourceText.slice(startOffset, endOffset);
}

export enum DiagnosticCode {
  // Errors
  UnclosedMacro = 'CBS001',
  UnclosedBlock = 'CBS002',
  UnknownFunction = 'CBS003',
  WrongArgumentCount = 'CBS004',
  MissingRequiredArgument = 'CBS005',
  InvalidBlockNesting = 'CBS006',
  CallStackExceeded = 'CBS007',

  // Warnings
  DeprecatedFunction = 'CBS100',
  UndefinedVariable = 'CBS101',
  UnusedVariable = 'CBS102',
  EmptyBlock = 'CBS103',
  LegacyAngleBracket = 'CBS104',

  // Info
  AliasAvailable = 'CBS200',
}

export type DiagnosticOwner = 'tokenizer' | 'parser' | 'analyzer';

export interface DiagnosticDefinition {
  code: DiagnosticCode;
  severity: DiagnosticInfo['severity'];
  owner: DiagnosticOwner;
  meaning: string;
}

export const DIAGNOSTIC_TAXONOMY: Readonly<Record<DiagnosticCode, DiagnosticDefinition>> = {
  [DiagnosticCode.UnclosedMacro]: {
    code: DiagnosticCode.UnclosedMacro,
    severity: 'error',
    owner: 'tokenizer',
    meaning: 'Unclosed CBS macro ({{ without matching }})',
  },
  [DiagnosticCode.UnclosedBlock]: {
    code: DiagnosticCode.UnclosedBlock,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unclosed CBS block (missing matching block close)',
  },
  [DiagnosticCode.UnknownFunction]: {
    code: DiagnosticCode.UnknownFunction,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unknown CBS function or block keyword',
  },
  [DiagnosticCode.WrongArgumentCount]: {
    code: DiagnosticCode.WrongArgumentCount,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Wrong number of CBS arguments',
  },
  [DiagnosticCode.MissingRequiredArgument]: {
    code: DiagnosticCode.MissingRequiredArgument,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Missing required CBS argument',
  },
  [DiagnosticCode.InvalidBlockNesting]: {
    code: DiagnosticCode.InvalidBlockNesting,
    severity: 'error',
    owner: 'parser',
    meaning: 'Invalid CBS block nesting or misplaced :else',
  },
  [DiagnosticCode.CallStackExceeded]: {
    code: DiagnosticCode.CallStackExceeded,
    severity: 'error',
    owner: 'parser',
    meaning: 'CBS nesting depth exceeds parser limit',
  },
  [DiagnosticCode.DeprecatedFunction]: {
    code: DiagnosticCode.DeprecatedFunction,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Deprecated CBS function or block',
  },
  [DiagnosticCode.UndefinedVariable]: {
    code: DiagnosticCode.UndefinedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Reference to undefined CBS variable',
  },
  [DiagnosticCode.UnusedVariable]: {
    code: DiagnosticCode.UnusedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Unused CBS variable definition',
  },
  [DiagnosticCode.EmptyBlock]: {
    code: DiagnosticCode.EmptyBlock,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Empty CBS block body',
  },
  [DiagnosticCode.LegacyAngleBracket]: {
    code: DiagnosticCode.LegacyAngleBracket,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Legacy angle-bracket macro syntax',
  },
  [DiagnosticCode.AliasAvailable]: {
    code: DiagnosticCode.AliasAvailable,
    severity: 'info',
    owner: 'analyzer',
    meaning: 'Shorter CBS alias is available',
  },
};

export const DEFERRED_SCOPE_CONTRACT = Object.freeze({
  deferredFeatures: [
    'definition',
    'references',
    'rename',
    'formatting',
    'lua-ast-fragment-routing',
  ] as const,
  luaRoutingMode: 'full-document-fragment' as const,
});

export function getDiagnosticDefinition(code: string): DiagnosticDefinition | undefined {
  if (!Object.values(DiagnosticCode).includes(code as DiagnosticCode)) {
    return undefined;
  }

  return DIAGNOSTIC_TAXONOMY[code as DiagnosticCode];
}

export function createDiagnosticInfo(
  code: DiagnosticCode,
  range: DiagnosticInfo['range'],
  message: string,
): DiagnosticInfo {
  const definition = DIAGNOSTIC_TAXONOMY[code];

  return {
    code: definition.code,
    message,
    range,
    severity: definition.severity,
  };
}

export function normalizeDiagnosticInfo(diagnostic: DiagnosticInfo): DiagnosticInfo {
  const definition = getDiagnosticDefinition(diagnostic.code);

  if (!definition) {
    return diagnostic;
  }

  return {
    ...diagnostic,
    code: definition.code,
    severity: definition.severity,
  };
}

export class DiagnosticsEngine {
  constructor(private registry: CBSBuiltinRegistry) {}

  analyze(
    document: CBSDocument,
    sourceText: string = '',
    symbolTable?: SymbolTable,
  ): DiagnosticInfo[] {
    const diagnostics: DiagnosticInfo[] = document.diagnostics.map(normalizeDiagnosticInfo);

    walkAST(document.nodes, {
      visitMacroCall: (node) => {
        const builtin = this.registry.get(node.name);
        if (!builtin) {
          return;
        }

        this.collectDeprecatedDiagnostic(builtin, node.nameRange, diagnostics);
        this.collectArgumentDiagnostics(
          {
            diagnosticTarget: `CBS function ${JSON.stringify(builtin.name)}`,
            range: node.nameRange,
            actualCount: node.arguments.length,
            builtin,
          },
          diagnostics,
        );
        this.collectAliasAvailabilityDiagnostic(node.name, node.nameRange, builtin, diagnostics);
      },
      visitBlock: (node) => {
        const builtin = this.registry.get(`#${node.kind}`);
        if (!builtin) {
          return;
        }

        this.collectDeprecatedDiagnostic(builtin, node.openRange, diagnostics);
        this.collectBlockArgumentDiagnostics(node, builtin, sourceText, diagnostics);
        this.collectBlockStructuralDiagnostics(node, diagnostics);

        if (sourceText.length > 0) {
          this.collectBlockHeaderDiagnostics(node, sourceText, diagnostics);
        }
      },
      visitMathExpr: (node) => {
        this.collectMathExpressionDiagnostics(node, diagnostics);
      },
    });

    if (sourceText.length > 0) {
      diagnostics.push(...this.collectLegacyAngleBracketDiagnostics(sourceText));
    }

    if (symbolTable) {
      diagnostics.push(...this.collectSymbolDiagnostics(symbolTable));
    }

    return diagnostics;
  }

  private collectDeprecatedDiagnostic(
    builtin: CBSBuiltinFunction,
    range: Range,
    diagnostics: DiagnosticInfo[],
  ): void {
    if (!builtin.deprecated) {
      return;
    }

    diagnostics.push(
      createDiagnosticInfo(DiagnosticCode.DeprecatedFunction, range, builtin.deprecated.message),
    );
  }

  private collectArgumentDiagnostics(
    options: {
      diagnosticTarget: string;
      range: Range;
      actualCount: number;
      builtin: CBSBuiltinFunction;
    },
    diagnostics: DiagnosticInfo[],
  ): void {
    const { actualCount, builtin, diagnosticTarget, range } = options;
    const requiredArguments = builtin.arguments.filter((argument) => argument.required);
    const maxCount = builtin.arguments.some((argument) => argument.variadic)
      ? Number.POSITIVE_INFINITY
      : builtin.arguments.length;

    if (actualCount < requiredArguments.length) {
      const missingArgument = requiredArguments[actualCount];
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.MissingRequiredArgument,
          range,
          missingArgument
            ? `${diagnosticTarget} is missing required argument ${JSON.stringify(missingArgument.name)}`
            : `${diagnosticTarget} is missing required arguments`,
        ),
      );
      return;
    }

    if (actualCount > maxCount) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.WrongArgumentCount,
          range,
          `${diagnosticTarget} expects ${this.formatExpectedArgumentCount(builtin.arguments)}, but received ${actualCount}`,
        ),
      );
    }
  }

  private collectBlockArgumentDiagnostics(
    node: BlockNode,
    builtin: CBSBuiltinFunction,
    sourceText: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const actualCount = this.hasMeaningfulNodes(node.condition, sourceText) ? 1 : 0;

    this.collectArgumentDiagnostics(
      {
        diagnosticTarget: `CBS block ${JSON.stringify(builtin.name)}`,
        range: node.openRange,
        actualCount,
        builtin,
      },
      diagnostics,
    );
  }

  private collectBlockStructuralDiagnostics(node: BlockNode, diagnostics: DiagnosticInfo[]): void {
    if (this.hasMeaningfulNodes(node.body) || this.hasMeaningfulNodes(node.elseBody)) {
      return;
    }

    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.EmptyBlock,
        node.openRange,
        `CBS block ${JSON.stringify(`#${node.kind}`)} has an empty body`,
      ),
    );
  }

  private collectBlockHeaderDiagnostics(
    node: BlockNode,
    sourceText: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const header = this.extractBlockHeader(node, sourceText);
    if (!header) {
      return;
    }

    const builtin = this.registry.get(header.rawName);
    if (builtin) {
      this.collectAliasAvailabilityDiagnostic(header.rawName, node.openRange, builtin, diagnostics);
    }

    if (node.kind === 'when') {
      this.collectWhenOperatorDiagnostics(node, header.tail, diagnostics);
    }

    if (node.kind === 'each') {
      this.collectEachHeaderDiagnostics(node, header.tail, sourceText, diagnostics);
    }
  }

  private collectWhenOperatorDiagnostics(
    node: BlockNode,
    rawTail: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const segments = this.stripLeadingOperators(
      parseBlockHeaderSegments(rawTail),
      WHEN_MODE_OPERATORS,
    );

    if (segments.length === 0) {
      return;
    }

    const [firstSegment, ...rest] = segments;
    const firstOperator = firstSegment.toLowerCase();
    if (WHEN_UNARY_OPERATORS.has(firstOperator)) {
      if (rest.length === 0 || rest[0].trim().length === 0) {
        diagnostics.push(
          createDiagnosticInfo(
            DiagnosticCode.MissingRequiredArgument,
            node.openRange,
            `CBS block ${JSON.stringify('#when')} is missing an operand for operator ${JSON.stringify(firstSegment)}`,
          ),
        );
        return;
      }

      if (rest.length > 1) {
        diagnostics.push(
          createDiagnosticInfo(
            DiagnosticCode.UnknownFunction,
            node.openRange,
            `Invalid #when operator sequence after ${JSON.stringify(firstSegment)}`,
          ),
        );
      }
      return;
    }

    if (segments.length === 1) {
      return;
    }

    for (let index = 1; index < segments.length; index += 2) {
      const operator = segments[index];
      if (!WHEN_BINARY_OPERATORS.has(operator.toLowerCase())) {
        diagnostics.push(
          createDiagnosticInfo(
            DiagnosticCode.UnknownFunction,
            node.openRange,
            `Invalid #when operator ${JSON.stringify(operator)}`,
          ),
        );
        return;
      }

      const operand = segments[index + 1];
      if (!operand || operand.trim().length === 0) {
        diagnostics.push(
          createDiagnosticInfo(
            DiagnosticCode.MissingRequiredArgument,
            node.openRange,
            `CBS block ${JSON.stringify('#when')} is missing an operand for operator ${JSON.stringify(operator)}`,
          ),
        );
        return;
      }
    }

    if (segments.length % 2 === 0) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.MissingRequiredArgument,
          node.openRange,
          `CBS block ${JSON.stringify('#when')} is missing a trailing condition segment`,
        ),
      );
    }
  }

  private collectEachHeaderDiagnostics(
    node: BlockNode,
    rawTail: string,
    sourceText: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const segments = this.stripLeadingOperators(
      parseBlockHeaderSegments(rawTail),
      EACH_MODE_OPERATORS,
    );
    const headerText = segments.join('::').trim();

    if (headerText.length === 0) {
      return;
    }

    const loopBinding = extractEachLoopBinding(node, sourceText);
    if (!loopBinding) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.MissingRequiredArgument,
          node.openRange,
          'CBS block "#each" requires an `as <item>` loop binding',
        ),
      );
    }
  }

  private collectMathExpressionDiagnostics(
    node: MathExprNode,
    diagnostics: DiagnosticInfo[],
  ): void {
    const error = this.validateMathExpression(node.expression);
    if (!error) {
      return;
    }

    diagnostics.push(createDiagnosticInfo(DiagnosticCode.WrongArgumentCount, node.range, error));
  }

  private validateMathExpression(expression: string): string | null {
    const trimmed = expression.trim();
    if (trimmed.length === 0) {
      return 'Math expression cannot be empty';
    }

    let depth = 0;
    let index = 0;
    let expectsOperand = true;

    while (index < trimmed.length) {
      const current = trimmed[index];
      if (current === ' ') {
        index += 1;
        continue;
      }

      if (expectsOperand) {
        if (current === '(') {
          depth += 1;
          index += 1;
          continue;
        }

        if (current === '+' || current === '-') {
          index += 1;
          continue;
        }

        const numberMatch = trimmed.slice(index).match(/^\d+(?:\.\d+)?/);
        if (numberMatch) {
          index += numberMatch[0].length;
          expectsOperand = false;
          continue;
        }

        return `Invalid math expression ${JSON.stringify(trimmed)}`;
      }

      if (current === ')') {
        depth -= 1;
        if (depth < 0) {
          return `Invalid math expression ${JSON.stringify(trimmed)}`;
        }

        index += 1;
        continue;
      }

      const operator = MATH_OPERATORS.find((candidate) => trimmed.startsWith(candidate, index));
      if (!operator) {
        return `Invalid math expression ${JSON.stringify(trimmed)}`;
      }

      index += operator.length;
      expectsOperand = true;
    }

    if (expectsOperand || depth !== 0) {
      return `Invalid math expression ${JSON.stringify(trimmed)}`;
    }

    return null;
  }

  private collectAliasAvailabilityDiagnostic(
    usedName: string,
    range: Range,
    builtin: CBSBuiltinFunction,
    diagnostics: DiagnosticInfo[],
  ): void {
    const preferredAlias = this.findShorterAlias(usedName, builtin);
    if (!preferredAlias) {
      return;
    }

    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.AliasAvailable,
        range,
        `CBS alias ${JSON.stringify(preferredAlias)} is available for ${JSON.stringify(usedName)}`,
      ),
    );
  }

  private collectSymbolDiagnostics(symbolTable: SymbolTable): DiagnosticInfo[] {
    const diagnostics: DiagnosticInfo[] = [];

    for (const reference of symbolTable.getUndefinedReferences()) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.UndefinedVariable,
          reference.range,
          this.formatUndefinedVariableMessage(reference),
        ),
      );
    }

    for (const symbol of symbolTable.getUnusedVariables()) {
      if (!symbol.definitionRange) {
        continue;
      }

      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.UnusedVariable,
          symbol.definitionRange,
          this.formatUnusedVariableMessage(symbol),
        ),
      );
    }

    return diagnostics;
  }

  private formatUndefinedVariableMessage(reference: UndefinedVariableReference): string {
    switch (reference.kind) {
      case 'temp':
        return `CBS temporary variable ${JSON.stringify(reference.name)} is referenced without a local definition`;
      case 'loop':
        return `CBS loop binding ${JSON.stringify(reference.name)} is not available in the current #each scope`;
      case 'chat':
      default:
        return `CBS variable ${JSON.stringify(reference.name)} is referenced without a local definition`;
    }
  }

  private formatUnusedVariableMessage(symbol: VariableSymbol): string {
    switch (symbol.kind) {
      case 'temp':
        return `CBS temporary variable ${JSON.stringify(symbol.name)} is defined but never read`;
      case 'loop':
        return `CBS loop binding ${JSON.stringify(symbol.name)} is defined but never used via {{slot::${symbol.name}}}`;
      case 'chat':
      default:
        return `CBS variable ${JSON.stringify(symbol.name)} is defined but never read`;
    }
  }

  private findShorterAlias(usedName: string, builtin: CBSBuiltinFunction): string | null {
    const normalizedUsedName = this.normalizeLookupKey(usedName);
    const candidates = [builtin.name, ...builtin.aliases]
      .filter((candidate) => this.normalizeLookupKey(candidate) !== normalizedUsedName)
      .filter((candidate) => candidate.length < usedName.length)
      .sort((left, right) => left.length - right.length);

    return candidates[0] ?? null;
  }

  private hasMeaningfulNodes(nodes: readonly CBSNode[] | undefined, sourceText?: string): boolean {
    if (!nodes || nodes.length === 0) {
      return false;
    }

    return nodes.some((node) => {
      if (node.type === 'Comment') {
        return false;
      }

      if (node.type === 'PlainText') {
        if (sourceText) {
          return this.sliceRange(sourceText, node.range).trim().length > 0;
        }

        return node.value.trim().length > 0;
      }

      return true;
    });
  }

  private stripLeadingOperators(segments: string[], allowed: ReadonlySet<string>): string[] {
    return stripLeadingBlockHeaderOperators(segments, allowed);
  }

  private extractBlockHeader(
    node: BlockNode,
    sourceText: string,
  ): { rawName: string; tail: string } | null {
    return extractBlockHeaderInfo(node, sourceText);
  }

  private sliceRange(sourceText: string, range: Range): string {
    return sliceSourceRange(sourceText, range);
  }

  private normalizeLookupKey(value: string): string {
    return value.toLowerCase().replace(/[\s_-]/g, '');
  }

  private formatExpectedArgumentCount(
    arguments_: readonly CBSBuiltinFunction['arguments'][number][],
  ): string {
    const requiredCount = arguments_.filter((argument) => argument.required).length;
    const allowsVariadic = arguments_.some((argument) => argument.variadic);

    if (allowsVariadic) {
      return requiredCount <= 1 ? 'at least 1 argument' : `at least ${requiredCount} arguments`;
    }

    if (requiredCount === arguments_.length) {
      return requiredCount === 1 ? '1 argument' : `${requiredCount} arguments`;
    }

    return `between ${requiredCount} and ${arguments_.length} arguments`;
  }

  private collectLegacyAngleBracketDiagnostics(sourceText: string): DiagnosticInfo[] {
    const tokenizer = new CBSTokenizer();
    const tokens = tokenizer.tokenize(sourceText);

    return tokens
      .filter((token) => token.type === TokenType.AngleBracketMacro)
      .map((token) =>
        createDiagnosticInfo(
          DiagnosticCode.LegacyAngleBracket,
          token.range,
          `Legacy angle-bracket macro <${token.value}> should be migrated to {{${token.value}}}`,
        ),
      );
  }
}
