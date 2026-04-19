import {
  CBSTokenizer,
  TokenType,
  walkAST,
  type BlockNode,
  type CBSBuiltinFunction,
  type MacroCallNode,
  type CBSNode,
  type CBSDocument,
  type DiagnosticInfo,
  type DiagnosticRelatedInfo,
  type MathExprNode,
  type Range,
  type CBSBuiltinRegistry,
} from 'risu-workbench-core';

import {
  CALC_EXPRESSION_SUBLANGUAGE_LABEL,
  type CalcExpressionDiagnostic,
  validateCalcExpression,
} from '../core/calc-expression';
import { offsetToPosition, positionToOffset } from '../utils/position';
import {
  type InvalidArgumentReference,
  type UndefinedVariableReference,
  type VariableSymbol,
  type SymbolTable,
} from './symbolTable';
import { PURE_MODE_BLOCKS } from '../core/pure-mode';

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

function extractBlockNameRange(node: BlockNode, sourceText: string): Range | null {
  const rawHeader = sliceSourceRange(sourceText, node.openRange);
  const nameMatch = rawHeader.match(/^\{\{\s*([^\s:}]+)/u);
  if (!nameMatch?.[1]) {
    return null;
  }

  const nameStartIndex = rawHeader.indexOf(nameMatch[1]);
  if (nameStartIndex === -1) {
    return null;
  }

  const openOffset = positionToOffset(sourceText, node.openRange.start);
  const nameStartOffset = openOffset + nameStartIndex;
  const nameEndOffset = nameStartOffset + nameMatch[1].length;

  return {
    start: offsetToPosition(sourceText, nameStartOffset),
    end: offsetToPosition(sourceText, nameEndOffset),
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
  CalcExpressionEmpty = 'CBS008',
  CalcExpressionUnbalancedParentheses = 'CBS009',
  CalcExpressionOperatorSequence = 'CBS010',
  CalcExpressionUnsupportedToken = 'CBS011',
  CalcExpressionIncompleteReferenceToken = 'CBS012',
  CalcExpressionInvalidReferenceIdentifier = 'CBS013',

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
export type DiagnosticRuleCategory =
  | 'syntax'
  | 'expression'
  | 'symbol'
  | 'compatibility'
  | 'quality';

export interface DiagnosticRuleMetadata {
  category: DiagnosticRuleCategory;
  code: DiagnosticCode;
  owner: DiagnosticOwner;
  severity: DiagnosticInfo['severity'];
  meaning: string;
}

export interface DiagnosticDefinition extends DiagnosticRuleMetadata {}

export type DiagnosticQuickFixEditKind = 'replace';

export interface DiagnosticQuickFixSuggestion {
  value: string;
  detail?: string;
}

export interface DiagnosticQuickFix {
  title: string;
  editKind: DiagnosticQuickFixEditKind;
  replacement?: string;
  suggestions?: readonly DiagnosticQuickFixSuggestion[];
}

export interface DiagnosticMachineData {
  rule: DiagnosticRuleMetadata;
  fixes?: readonly DiagnosticQuickFix[];
}

export const DIAGNOSTIC_TAXONOMY: Readonly<Record<DiagnosticCode, DiagnosticDefinition>> = {
  [DiagnosticCode.UnclosedMacro]: {
    category: 'syntax',
    code: DiagnosticCode.UnclosedMacro,
    severity: 'error',
    owner: 'tokenizer',
    meaning: 'Unclosed CBS macro ({{ without matching }})',
  },
  [DiagnosticCode.UnclosedBlock]: {
    category: 'syntax',
    code: DiagnosticCode.UnclosedBlock,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unclosed CBS block (missing matching block close)',
  },
  [DiagnosticCode.UnknownFunction]: {
    category: 'syntax',
    code: DiagnosticCode.UnknownFunction,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unknown CBS function or block keyword',
  },
  [DiagnosticCode.WrongArgumentCount]: {
    category: 'symbol',
    code: DiagnosticCode.WrongArgumentCount,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Wrong number of CBS arguments',
  },
  [DiagnosticCode.MissingRequiredArgument]: {
    category: 'quality',
    code: DiagnosticCode.MissingRequiredArgument,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Missing required CBS argument',
  },
  [DiagnosticCode.InvalidBlockNesting]: {
    category: 'syntax',
    code: DiagnosticCode.InvalidBlockNesting,
    severity: 'error',
    owner: 'parser',
    meaning: 'Invalid CBS block nesting or misplaced :else',
  },
  [DiagnosticCode.CallStackExceeded]: {
    category: 'syntax',
    code: DiagnosticCode.CallStackExceeded,
    severity: 'error',
    owner: 'parser',
    meaning: 'CBS nesting depth exceeds parser limit',
  },
  [DiagnosticCode.CalcExpressionEmpty]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionEmpty,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} is empty`,
  },
  [DiagnosticCode.CalcExpressionUnbalancedParentheses]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionUnbalancedParentheses,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has unbalanced parentheses`,
  },
  [DiagnosticCode.CalcExpressionOperatorSequence]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionOperatorSequence,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an invalid operator sequence`,
  },
  [DiagnosticCode.CalcExpressionUnsupportedToken]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionUnsupportedToken,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an unsupported token`,
  },
  [DiagnosticCode.CalcExpressionIncompleteReferenceToken]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionIncompleteReferenceToken,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an incomplete variable reference token`,
  },
  [DiagnosticCode.CalcExpressionInvalidReferenceIdentifier]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an invalid variable reference identifier`,
  },
  [DiagnosticCode.DeprecatedFunction]: {
    category: 'compatibility',
    code: DiagnosticCode.DeprecatedFunction,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Deprecated CBS function or block',
  },
  [DiagnosticCode.UndefinedVariable]: {
    category: 'symbol',
    code: DiagnosticCode.UndefinedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Reference to undefined CBS variable',
  },
  [DiagnosticCode.UnusedVariable]: {
    category: 'symbol',
    code: DiagnosticCode.UnusedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Unused CBS variable definition',
  },
  [DiagnosticCode.EmptyBlock]: {
    category: 'quality',
    code: DiagnosticCode.EmptyBlock,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Empty CBS block body',
  },
  [DiagnosticCode.LegacyAngleBracket]: {
    category: 'compatibility',
    code: DiagnosticCode.LegacyAngleBracket,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Legacy angle-bracket macro syntax',
  },
  [DiagnosticCode.AliasAvailable]: {
    category: 'quality',
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
  relatedInformation?: DiagnosticRelatedInfo[],
  data?: Omit<DiagnosticMachineData, 'rule'>,
): DiagnosticInfo {
  return {
    code,
    data: createDiagnosticMachineData(code, data),
    message,
    range,
    relatedInformation,
    severity: DIAGNOSTIC_TAXONOMY[code].severity,
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
    data: createDiagnosticMachineData(definition.code, isDiagnosticMachineData(diagnostic.data) ? diagnostic.data : undefined),
    severity: definition.severity,
  };
}

function isDiagnosticMachineData(value: unknown): value is DiagnosticMachineData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const machineData = value as Partial<DiagnosticMachineData>;
  const fixesAreValid = machineData.fixes === undefined || Array.isArray(machineData.fixes);

  if (!fixesAreValid) {
    return false;
  }

  const rule = machineData.rule;
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  return typeof rule.code === 'string' && typeof rule.owner === 'string' && typeof rule.severity === 'string';
}

function createDiagnosticMachineData(
  code: DiagnosticCode,
  data?: Omit<DiagnosticMachineData, 'rule'> | DiagnosticMachineData,
): DiagnosticMachineData {
  return {
    fixes: data?.fixes,
    rule: DIAGNOSTIC_TAXONOMY[code],
  };
}

function appendDiagnosticFixes(
  diagnostic: DiagnosticInfo,
  fixes: readonly DiagnosticQuickFix[],
): DiagnosticInfo {
  if (fixes.length === 0) {
    return diagnostic;
  }

  const existingFixes = isDiagnosticMachineData(diagnostic.data)
    ? [...(diagnostic.data.fixes ?? [])]
    : [];

  return {
    ...diagnostic,
    data: createDiagnosticMachineData(diagnostic.code as DiagnosticCode, {
      fixes: [...existingFixes, ...fixes],
    }),
  };
}

function createReplacementQuickFix(title: string, replacement: string): DiagnosticQuickFix {
  return {
    title,
    editKind: 'replace',
    replacement,
  };
}

function createSuggestionQuickFix(
  title: string,
  suggestions: readonly DiagnosticQuickFixSuggestion[],
): DiagnosticQuickFix {
  return {
    title,
    editKind: 'replace',
    suggestions,
  };
}

export class DiagnosticsEngine {
  constructor(private registry: CBSBuiltinRegistry) {}

  analyze(
    document: CBSDocument,
    sourceText: string = '',
    symbolTable?: SymbolTable,
  ): DiagnosticInfo[] {
    const diagnostics: DiagnosticInfo[] = document.diagnostics.map((diagnostic) =>
      this.enrichDiagnosticMetadata(normalizeDiagnosticInfo(diagnostic), sourceText),
    );
    const tokens = sourceText.length > 0 ? new CBSTokenizer().tokenize(sourceText) : [];

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
        if (sourceText.length > 0 && this.normalizeLookupKey(builtin.name) === 'calc') {
          this.collectCalcExpressionArgumentDiagnostics(node, sourceText, diagnostics);
        }
        this.collectAliasAvailabilityDiagnostic(node.name, node.nameRange, builtin, diagnostics);
      },
      visitBlock: (node) => {
        const builtin = this.registry.get(`#${node.kind}`);
        if (!builtin) {
          return;
        }

        const blockNameRange =
          sourceText.length > 0
            ? extractBlockNameRange(node, sourceText) ?? node.openRange
            : node.openRange;

        this.collectDeprecatedDiagnostic(builtin, blockNameRange, diagnostics);
        this.collectBlockArgumentDiagnostics(node, builtin, sourceText, diagnostics);
        this.collectBlockStructuralDiagnostics(node, diagnostics);

        if (sourceText.length > 0) {
          this.collectBlockHeaderDiagnostics(node, sourceText, diagnostics);
        }
      },
      visitMathExpr: (node) => {
        this.collectMathExpressionDiagnostics(node, sourceText, diagnostics);
      },
    });

    if (sourceText.length > 0) {
      diagnostics.push(...this.collectLegacyAngleBracketDiagnostics(sourceText));
    }

    if (symbolTable) {
      diagnostics.push(...this.collectSymbolDiagnostics(symbolTable));
    }

    if (sourceText.length === 0) {
      return diagnostics;
    }

    return diagnostics.filter((diagnostic) => this.shouldKeepDiagnostic(document, sourceText, tokens, diagnostic));
  }

  /**
   * shouldKeepDiagnostic 함수.
   * pure-mode body 안의 일반 진단은 숨기고 block별 예외 token 진단만 남김.
   *
   * @param document - 현재 fragment의 CBS 문서 AST
   * @param sourceText - fragment 원문 텍스트
   * @param tokens - fragment 원문에서 다시 토크나이즈한 토큰 목록
   * @param diagnostic - 유지 여부를 판정할 진단
   * @returns 결과에 남겨둘 진단이면 true
   */
  private shouldKeepDiagnostic(
    document: Pick<CBSDocument, 'nodes'>,
    sourceText: string,
    tokens: ReturnType<CBSTokenizer['tokenize']>,
    diagnostic: DiagnosticInfo,
  ): boolean {
    const pureBlock = this.findEnclosingPureModeBlock(document.nodes, sourceText, diagnostic.range);
    if (!pureBlock) {
      return true;
    }

    const macroContext = this.resolveMacroArgumentContextAtRange(tokens, sourceText, diagnostic.range);
    if (!macroContext || macroContext.argumentIndex !== 0) {
      return false;
    }

    if (pureBlock.kind === 'func') {
      return macroContext.macroName === 'arg' || macroContext.macroName === 'call';
    }

    if (pureBlock.kind === 'each') {
      return macroContext.macroName === 'slot';
    }

    return false;
  }

  /**
   * findEnclosingPureModeBlock 함수.
   * diagnostic range를 감싸는 pure-mode block body를 AST 기준으로 찾음.
   *
   * @param nodes - 검색할 CBS AST 노드 목록
   * @param sourceText - fragment 원문 텍스트
   * @param range - 검사할 diagnostic range
   * @returns range를 감싸는 pure-mode block, 없으면 null
   */
  private findEnclosingPureModeBlock(
    nodes: readonly CBSNode[],
    sourceText: string,
    range: Range,
  ): BlockNode | null {
    const targetOffset = positionToOffset(sourceText, range.start);

    for (const node of nodes) {
      if (node.type !== 'Block') {
        continue;
      }

      const nestedMatch = this.findEnclosingPureModeBlock(node.body, sourceText, range);
      if (nestedMatch) {
        return nestedMatch;
      }

      if (node.elseBody) {
        const elseMatch = this.findEnclosingPureModeBlock(node.elseBody, sourceText, range);
        if (elseMatch) {
          return elseMatch;
        }
      }

      if (!PURE_MODE_BLOCKS.has(node.kind)) {
        continue;
      }

      const openEndOffset = positionToOffset(sourceText, node.openRange.end);
      const closeStartOffset = node.closeRange
        ? positionToOffset(sourceText, node.closeRange.start)
        : sourceText.length;
      if (targetOffset >= openEndOffset && targetOffset <= closeStartOffset) {
        return node;
      }
    }

    return null;
  }

  /**
   * resolveMacroArgumentContextAtRange 함수.
   * diagnostic range 시작점이 어떤 macro argument 슬롯인지 token stream 기준으로 해석함.
   *
   * @param tokens - fragment 토큰 목록
   * @param sourceText - fragment 원문 텍스트
   * @param range - 검사할 diagnostic range
   * @returns macro 이름과 argument index, 아니면 null
   */
  private resolveMacroArgumentContextAtRange(
    tokens: ReturnType<CBSTokenizer['tokenize']>,
    sourceText: string,
    range: Range,
  ): { macroName: string; argumentIndex: number } | null {
    const targetOffset = positionToOffset(sourceText, range.start);
    let tokenIndex = -1;

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.type === TokenType.EOF) {
        continue;
      }

      const startOffset = positionToOffset(sourceText, token.range.start);
      const endOffset = positionToOffset(sourceText, token.range.end);
      if (targetOffset >= startOffset && targetOffset <= endOffset) {
        tokenIndex = index;
        break;
      }
    }

    if (tokenIndex === -1 || tokens[tokenIndex]?.type !== TokenType.Argument) {
      return null;
    }

    let openBraceIndex = -1;
    let separatorCount = 0;
    for (let index = tokenIndex - 1; index >= 0; index -= 1) {
      const token = tokens[index];
      if (token.type === TokenType.CloseBrace) {
        return null;
      }
      if (token.type === TokenType.ArgumentSeparator) {
        separatorCount += 1;
      }
      if (token.type === TokenType.OpenBrace) {
        openBraceIndex = index;
        break;
      }
    }

    if (openBraceIndex === -1 || separatorCount < 1) {
      return null;
    }

    const functionNameToken = tokens[openBraceIndex + 1];
    if (functionNameToken?.type !== TokenType.FunctionName) {
      return null;
    }

    return {
      macroName: functionNameToken.value.toLowerCase(),
      argumentIndex: separatorCount - 1,
    };
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
      createDiagnosticInfo(
        DiagnosticCode.DeprecatedFunction,
        range,
        builtin.deprecated.message,
        undefined,
        builtin.deprecated.replacement
          ? {
              fixes: [
                createReplacementQuickFix(
                  `Replace with ${JSON.stringify(builtin.deprecated.replacement)}`,
                  builtin.deprecated.replacement,
                ),
              ],
            }
          : undefined,
      ),
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
      this.collectAliasAvailabilityDiagnostic(
        header.rawName,
        extractBlockNameRange(node, sourceText) ?? node.openRange,
        builtin,
        diagnostics,
      );
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
    sourceText: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const expression = this.extractInlineMathExpression(node, sourceText);
    const error = validateCalcExpression(expression.text);
    if (!error) {
      return;
    }

    diagnostics.push(this.createCalcExpressionDiagnostic(error, expression.range, sourceText));
  }

  private collectCalcExpressionArgumentDiagnostics(
    node: MacroCallNode,
    sourceText: string,
    diagnostics: DiagnosticInfo[],
  ): void {
    const expressionArgument = this.extractCalcExpressionArgument(node, 0, sourceText);
    if (!expressionArgument) {
      return;
    }

    const error = validateCalcExpression(expressionArgument.text);
    if (!error) {
      return;
    }

    diagnostics.push(
      expressionArgument.isRangeStable
        ? this.createCalcExpressionDiagnostic(error, expressionArgument.range, sourceText)
        : createDiagnosticInfo(this.mapCalcExpressionDiagnosticCode(error.kind), expressionArgument.range, error.message),
    );
  }

  private extractStaticMacroArgument(
    node: MacroCallNode,
    argumentIndex: number,
    sourceText: string,
  ): { text: string; range: Range; isRangeStable: boolean } | null {
    const segment = node.arguments[argumentIndex];
    if (!segment || segment.length === 0) {
      return null;
    }

    const firstNode = segment[0];
    const lastNode = segment[segment.length - 1];
    if (!firstNode || !lastNode) {
      return null;
    }

    const range = {
      start: firstNode.range.start,
      end: lastNode.range.end,
    };

    return {
      text: segment.map((child) => this.serializeCalcExpressionNode(child, sourceText)).join(''),
      range,
      isRangeStable: segment.every((child) => child.type === 'PlainText'),
    };
  }

  private serializeCalcExpressionNode(
    node: CBSNode,
    sourceText: string,
  ): string {
    switch (node.type) {
      case 'PlainText':
        return this.sliceRange(sourceText, node.range);
      case 'Comment':
        return '';
      default:
        return '0';
    }
  }

  private extractCalcExpressionArgument(
    node: MacroCallNode,
    argumentIndex: number,
    sourceText: string,
  ): { text: string; range: Range; isRangeStable: boolean } | null {
    const staticArgument = this.extractStaticMacroArgument(node, argumentIndex, sourceText);
    if (staticArgument) {
      return staticArgument;
    }

    if (argumentIndex !== 0 || !node.arguments[argumentIndex]) {
      return null;
    }

    const emptyRange = this.extractEmptyFirstCalcArgumentRange(node, sourceText);
    if (!emptyRange) {
      return null;
    }

    return {
      text: '',
      range: emptyRange,
      isRangeStable: true,
    };
  }

  private extractEmptyFirstCalcArgumentRange(node: MacroCallNode, sourceText: string): Range | null {
    const nameEndOffset = positionToOffset(sourceText, node.nameRange.end);
    const macroEndOffset = positionToOffset(sourceText, node.range.end);
    const separatorOffset = sourceText.indexOf('::', nameEndOffset);
    if (separatorOffset === -1 || separatorOffset > macroEndOffset - 2) {
      return null;
    }

    const argumentStartOffset = separatorOffset + 2;
    return {
      start: offsetToPosition(sourceText, argumentStartOffset),
      end: offsetToPosition(sourceText, argumentStartOffset),
    };
  }

  private extractInlineMathExpression(
    node: MathExprNode,
    sourceText: string,
  ): { text: string; range: Range } {
    const raw = this.sliceRange(sourceText, node.range);
    const rangeStartOffset = positionToOffset(sourceText, node.range.start);
    const rangeEndOffset = positionToOffset(sourceText, node.range.end);
    const prefixLength = raw.match(/^\{\{\?\s*/u)?.[0].length ?? 3;
    const expressionStartOffset = rangeStartOffset + prefixLength;
    const expressionEndOffset = Math.max(expressionStartOffset, rangeEndOffset - 2);

    return {
      text: node.expression,
      range: {
        start: offsetToPosition(sourceText, expressionStartOffset),
        end: offsetToPosition(sourceText, expressionEndOffset),
      },
    };
  }

  private createCalcExpressionDiagnostic(
    diagnostic: CalcExpressionDiagnostic,
    expressionRange: Range,
    sourceText: string,
  ): DiagnosticInfo {
    const baseOffset = positionToOffset(sourceText, expressionRange.start);
    const expressionStartOffset = baseOffset + diagnostic.startOffset;
    const expressionEndOffset = baseOffset + diagnostic.endOffset;

    return createDiagnosticInfo(
      this.mapCalcExpressionDiagnosticCode(diagnostic.kind),
      {
        start: offsetToPosition(sourceText, expressionStartOffset),
        end: offsetToPosition(sourceText, Math.max(expressionStartOffset, expressionEndOffset)),
      },
      diagnostic.message,
    );
  }

  private mapCalcExpressionDiagnosticCode(kind: CalcExpressionDiagnostic['kind']): DiagnosticCode {
    switch (kind) {
      case 'empty-expression':
        return DiagnosticCode.CalcExpressionEmpty;
      case 'unbalanced-parentheses':
        return DiagnosticCode.CalcExpressionUnbalancedParentheses;
      case 'unsupported-token':
        return DiagnosticCode.CalcExpressionUnsupportedToken;
      case 'incomplete-reference-token':
        return DiagnosticCode.CalcExpressionIncompleteReferenceToken;
      case 'invalid-reference-identifier':
        return DiagnosticCode.CalcExpressionInvalidReferenceIdentifier;
      case 'operator-sequence':
      default:
        return DiagnosticCode.CalcExpressionOperatorSequence;
    }
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
        undefined,
        {
          fixes: [
            createReplacementQuickFix(
              `Replace with shorter alias ${JSON.stringify(preferredAlias)}`,
              preferredAlias,
            ),
          ],
        },
      ),
    );
  }

  private enrichDiagnosticMetadata(diagnostic: DiagnosticInfo, sourceText: string): DiagnosticInfo {
    if (diagnostic.code !== DiagnosticCode.UnknownFunction || sourceText.length === 0) {
      return diagnostic;
    }

    const rawName = this.sliceRange(sourceText, diagnostic.range).trim();
    if (rawName.length === 0) {
      return diagnostic;
    }

    const suggestions = Array.from(
      new Map(
        this.registry
          .getSuggestions(rawName)
          .map((builtin) => [this.normalizeLookupKey(builtin.name), builtin] as const),
      ).values(),
    ).map((builtin) => ({
      value: builtin.name,
      detail: builtin.description,
    } satisfies DiagnosticQuickFixSuggestion));

    if (suggestions.length === 0) {
      return diagnostic;
    }

    if (suggestions.length === 1) {
      return appendDiagnosticFixes(diagnostic, [
        createReplacementQuickFix(
          `Replace with ${JSON.stringify(suggestions[0].value)}`,
          suggestions[0].value,
        ),
      ]);
    }

    return appendDiagnosticFixes(diagnostic, [
      createSuggestionQuickFix('Replace with a known CBS builtin', suggestions),
    ]);
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

    for (const reference of symbolTable.getInvalidArgumentReferences()) {
      const relatedInformation = this.createInvalidArgumentRelatedInformation(reference, symbolTable);
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.WrongArgumentCount,
          reference.range,
          this.formatInvalidArgumentReferenceMessage(reference),
          relatedInformation,
        ),
      );
    }

    for (const symbol of symbolTable.getUnusedVariables()) {
      if (!symbol.definitionRange) {
        continue;
      }

      const relatedInformation = this.createUnusedVariableRelatedInformation(symbol);
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.UnusedVariable,
          symbol.definitionRange,
          this.formatUnusedVariableMessage(symbol),
          relatedInformation,
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

  private formatInvalidArgumentReferenceMessage(reference: InvalidArgumentReference): string {
    if (reference.reason === 'outside-function') {
      return `CBS argument reference ${JSON.stringify(`arg::${reference.rawText}`)} is only valid inside a local #func body resolved through {{call::...}} recursion`;
    }

    const parameterCount = reference.parameterCount ?? 0;
    if (parameterCount <= 0) {
      return `CBS argument reference ${JSON.stringify(`arg::${reference.rawText}`)} targets local function ${JSON.stringify(reference.functionName ?? 'unknown')} with no available parameter slots`;
    }

    const maxIndex = Math.max(0, parameterCount - 1);
    return `CBS argument reference ${JSON.stringify(`arg::${reference.rawText}`)} is outside the 0-based parameter slots for local function ${JSON.stringify(reference.functionName ?? 'unknown')} (expected 0..${maxIndex})`;
  }

  private createInvalidArgumentRelatedInformation(
    reference: InvalidArgumentReference,
    symbolTable: SymbolTable,
  ): DiagnosticRelatedInfo[] | undefined {
    if (!reference.functionName) {
      return undefined;
    }

    const functionSymbol = symbolTable.getFunction(reference.functionName);
    if (!functionSymbol?.definitionRange) {
      return undefined;
    }

    const parameterSummary =
      functionSymbol.parameters.length > 0
        ? `Parameters: ${functionSymbol.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
        : 'Parameters are inferred at runtime.';

    return [
      {
        message: `Local #func ${JSON.stringify(reference.functionName)} is declared here. ${parameterSummary}`,
        range: functionSymbol.definitionRange,
      },
    ];
  }

  private createUnusedVariableRelatedInformation(
    symbol: VariableSymbol,
  ): DiagnosticRelatedInfo[] | undefined {
    if (!symbol.definitionRange) {
      return undefined;
    }

    const secondaryDefinitions = symbol.definitionRanges.filter(
      (range) =>
        range.start.line !== symbol.definitionRange?.start.line ||
        range.start.character !== symbol.definitionRange?.start.character ||
        range.end.line !== symbol.definitionRange?.end.line ||
        range.end.character !== symbol.definitionRange?.end.character,
    );

    if (secondaryDefinitions.length === 0) {
      return undefined;
    }

    return secondaryDefinitions.map((range, index) => ({
      message: `Additional unused definition #${index + 2} for ${JSON.stringify(symbol.name)} appears here.`,
      range,
    }));
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
          undefined,
          {
            fixes: [
              createReplacementQuickFix(
                `Migrate to {{${token.value}}}`,
                `{{${token.value}}}`,
              ),
            ],
          },
        ),
      );
  }
}
