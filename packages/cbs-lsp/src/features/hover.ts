import {
  type CancellationToken,
  Hover,
  MarkupKind,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { formatHoverContent, TokenType } from 'risu-workbench-core';
import type { CBSBuiltinRegistry, Range } from 'risu-workbench-core';
import { CALC_EXPRESSION_SUBLANGUAGE_LABEL } from '../core/calc-expression';

import {
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  findCalcReferenceAtOffset,
  getCalcExpressionZone,
  resolveTokenMacroArgumentContext,
  resolveActiveLocalFunctionContext,
  resolveLocalFunctionDeclaration,
  shouldSuppressPureModeFeatures,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';
import { positionToOffset } from '../utils/position';

export type HoverRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface HoverProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: HoverRequestResolver;
}

interface HoverTarget {
  markdown: string;
  localStartOffset: number;
  localEndOffset: number;
}

const VARIABLE_MACRO_RULES = Object.freeze({
  addvar: { kind: 'chat', access: 'reads and writes via `addvar`' },
  getglobalvar: { kind: 'global', access: 'reads via `getglobalvar`' },
  gettempvar: { kind: 'temp', access: 'reads via `gettempvar`' },
  getvar: { kind: 'chat', access: 'reads via `getvar`' },
  setdefaultvar: { kind: 'chat', access: 'writes a default value via `setdefaultvar`' },
  settempvar: { kind: 'temp', access: 'writes via `settempvar`' },
  setvar: { kind: 'chat', access: 'writes via `setvar`' },
  tempvar: { kind: 'temp', access: 'reads via `tempvar`' },
} as const);

const VARIABLE_KIND_LABELS = Object.freeze({
  chat: 'persistent chat variable',
  global: 'global variable',
  loop: 'loop variable',
  temp: 'temporary variable',
} as const);

const WHEN_OPERATOR_DOCS = Object.freeze({
  keep: {
    summary: 'Preserves the block body whitespace instead of trimming it.',
    example: '{{#when::keep::condition}}...{{/when}}',
  },
  legacy: {
    summary: 'Uses the deprecated `#if`-style whitespace behavior for compatibility.',
    example: '{{#when::legacy::condition}}...{{/when}}',
  },
  not: {
    summary: 'Negates the following condition so truthy becomes false and vice versa.',
    example: '{{#when::not::condition}}...{{/when}}',
  },
  toggle: {
    summary: 'Checks whether the named toggle is enabled.',
    example: '{{#when::toggle::featureFlag}}...{{/when}}',
  },
  var: {
    summary: 'Treats the next value as a variable lookup and tests its truthiness.',
    example: '{{#when::var::variableName}}...{{/when}}',
  },
  and: {
    summary: 'Requires both the left and right conditions to be truthy.',
    example: '{{#when::left::and::right}}...{{/when}}',
  },
  or: {
    summary: 'Succeeds when either the left or right condition is truthy.',
    example: '{{#when::left::or::right}}...{{/when}}',
  },
  is: {
    summary: 'Compares the left-hand condition with the right-hand value for equality.',
    example: '{{#when::left::is::right}}...{{/when}}',
  },
  isnot: {
    summary: 'Compares the left-hand condition with the right-hand value for inequality.',
    example: '{{#when::left::isnot::right}}...{{/when}}',
  },
  '>': {
    summary: 'Checks whether the left-hand value is greater than the right-hand value.',
    example: '{{#when::left::>::right}}...{{/when}}',
  },
  '<': {
    summary: 'Checks whether the left-hand value is less than the right-hand value.',
    example: '{{#when::left::<::right}}...{{/when}}',
  },
  '>=': {
    summary: 'Checks whether the left-hand value is greater than or equal to the right-hand value.',
    example: '{{#when::left::>=::right}}...{{/when}}',
  },
  '<=': {
    summary: 'Checks whether the left-hand value is less than or equal to the right-hand value.',
    example: '{{#when::left::<=::right}}...{{/when}}',
  },
  vis: {
    summary: 'Compares a variable value against a literal value.',
    example: '{{#when::variableName::vis::literal}}...{{/when}}',
  },
  visnot: {
    summary: 'Checks whether a variable value differs from a literal value.',
    example: '{{#when::variableName::visnot::literal}}...{{/when}}',
  },
  tis: {
    summary: 'Compares a toggle value against a literal value.',
    example: '{{#when::toggleName::tis::literal}}...{{/when}}',
  },
  tisnot: {
    summary: 'Checks whether a toggle value differs from a literal value.',
    example: '{{#when::toggleName::tisnot::literal}}...{{/when}}',
  },
} as const);

function formatRangeStart(range: Range): string {
  return `line ${range.start.line + 1}, character ${range.start.character + 1}`;
}

function formatOrdinal(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${value}st`;
  }
  if (mod10 === 2 && mod100 !== 12) {
    return `${value}nd`;
  }
  if (mod10 === 3 && mod100 !== 13) {
    return `${value}rd`;
  }
  return `${value}th`;
}

function getTrimmedTokenOffsets(
  lookup: FragmentCursorLookupResult['token'],
): { localStartOffset: number; localEndOffset: number } | null {
  if (!lookup) {
    return null;
  }

  const raw = lookup.token.raw;
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const leadingWhitespace = raw.length - raw.trimStart().length;
  const localStartOffset = lookup.localStartOffset + leadingWhitespace;

  return {
    localStartOffset,
    localEndOffset: localStartOffset + trimmed.length,
  };
}

function getKeywordHoverTarget(
  lookup: FragmentCursorLookupResult,
): { keyword: string; localStartOffset: number; localEndOffset: number } | null {
  const tokenLookup = lookup.token;
  if (!tokenLookup) {
    return null;
  }

  const raw = tokenLookup.token.raw.trimStart();
  const keyword = raw.split(/\s+/, 1)[0] ?? '';
  if (keyword.length === 0) {
    return null;
  }

  const leadingWhitespace = tokenLookup.token.raw.length - tokenLookup.token.raw.trimStart().length;
  const localStartOffset = tokenLookup.localStartOffset + leadingWhitespace;
  const localEndOffset = localStartOffset + keyword.length;

  if (
    lookup.fragmentLocalOffset < localStartOffset ||
    lookup.fragmentLocalOffset > localEndOffset
  ) {
    return null;
  }

  return {
    keyword,
    localStartOffset,
    localEndOffset,
  };
}

export class HoverProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: HoverRequestResolver;

  constructor(
    private readonly registry: CBSBuiltinRegistry,
    options: HoverProviderOptions = {},
  ) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  provide(params: TextDocumentPositionParams, cancellationToken?: CancellationToken): Hover | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    if (shouldSuppressPureModeFeatures(lookup)) {
      return null;
    }

    if (!lookup.recovery.tokenContextReliable && lookup.token?.category === 'plain-text') {
      return null;
    }

    const hoverTarget =
      this.buildBuiltinHover(lookup) ??
      this.buildCalcExpressionHover(lookup) ??
      this.buildVariableHover(lookup) ??
      this.buildFunctionHover(lookup) ??
      this.buildWhenOperatorHover(lookup);
    if (!hoverTarget) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const range = lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
      request.text,
      hoverTarget.localStartOffset,
      hoverTarget.localEndOffset,
    );

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverTarget.markdown,
      },
      range: range ?? undefined,
    };
  }

  private buildBuiltinHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    if (!tokenLookup) {
      return null;
    }

    if (tokenLookup.category === 'macro-name' || tokenLookup.category === 'else') {
      const builtin = this.registry.get(tokenLookup.token.value);
      const offsets = getTrimmedTokenOffsets(tokenLookup);
      if (!builtin || !offsets) {
        return null;
      }

      return {
        markdown: formatHoverContent(builtin),
        ...offsets,
      };
    }

    if (tokenLookup.category !== 'block-header') {
      return null;
    }

    const keywordTarget = getKeywordHoverTarget(lookup);
    if (!keywordTarget) {
      return null;
    }

    const builtin = this.registry.get(keywordTarget.keyword);
    if (!builtin) {
      return null;
    }

    return {
      markdown: formatHoverContent(builtin),
      localStartOffset: keywordTarget.localStartOffset,
      localEndOffset: keywordTarget.localEndOffset,
    };
  }

  private buildVariableHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    if (!tokenLookup) {
      return null;
    }

    const macroName = tokenMacroContext?.argumentIndex === 0
      ? tokenMacroContext.macroName
      : nodeSpan &&
          tokenLookup.category === 'argument' &&
          nodeSpan.category === 'argument' &&
          nodeSpan.argumentIndex === 0 &&
          nodeSpan.owner.type === 'MacroCall'
        ? nodeSpan.owner.name.toLowerCase()
        : null;
    if (!macroName) {
      return null;
    }

    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];
    const variableName = tokenLookup.token.value.trim();
    if (!rule || variableName.length === 0) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, rule.kind);
    const kind = symbol?.kind ?? rule.kind;
    const lines = [
      `**Variable: ${variableName}**`,
      '',
      `- Kind: ${VARIABLE_KIND_LABELS[kind]}`,
      `- Access: ${rule.access}`,
    ];

    if (symbol?.definitionRange) {
      lines.push(`- Local definition: ${formatRangeStart(symbol.definitionRange)}`);
    }

    if (symbol) {
      lines.push(`- Local references: ${symbol.references.length}`);
    }

    return {
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  private buildCalcExpressionHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const calcZone = getCalcExpressionZone(lookup);
    if (!calcZone) {
      return null;
    }

    const calcReference = findCalcReferenceAtOffset(calcZone, lookup.fragmentLocalOffset);
    if (calcReference) {
      const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
      const symbol = symbolTable.getVariable(calcReference.name, calcReference.kind);
      const kindLabel =
        calcReference.kind === 'global'
          ? VARIABLE_KIND_LABELS.global
          : symbol?.kind
            ? VARIABLE_KIND_LABELS[symbol.kind]
            : VARIABLE_KIND_LABELS.chat;
      const lines = [
        `**Calc variable: ${calcReference.raw}**`,
        '',
        `- Kind: ${kindLabel}`,
        `- Semantics: ${calcReference.kind === 'global' ? '`@name` reads a global variable' : '`$name` reads a chat variable'} and upstream coerces non-numeric values to \`0\`.`,
      ];

      if (symbol?.definitionRange) {
        lines.push(`- Local definition: ${formatRangeStart(symbol.definitionRange)}`);
      }

      if (symbol) {
        lines.push(`- Local references: ${symbol.references.length}`);
      }

      return {
        markdown: lines.join('\n'),
        localStartOffset: calcReference.startOffset,
        localEndOffset: calcReference.endOffset,
      };
    }

    return {
      markdown: [
        `**${CALC_EXPRESSION_SUBLANGUAGE_LABEL}**`,
        '',
        `The \`{{? ...}}\` special form and \`{{calc::...}}\` first argument both use the same \`${CALC_EXPRESSION_SUBLANGUAGE_LABEL}\`.`,
        '',
        '- Variables: `$name` for chat variables, `@name` for global variables',
        '- Operators: `+ - * / ^ % < > <= >= == != ! && ||` and parentheses',
        '- Coercion: `null` and non-numeric variable values evaluate as `0` upstream',
      ].join('\n'),
      localStartOffset: calcZone.expressionStartOffset,
      localEndOffset: calcZone.expressionEndOffset,
    };
  }

  private buildFunctionHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    return (
      this.buildFunctionDeclarationHover(lookup) ??
      this.buildFunctionCallHover(lookup) ??
      this.buildArgumentReferenceHover(lookup)
    );
  }

  private buildFunctionDeclarationHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const nodeSpan = lookup.nodeSpan;
    if (
      !nodeSpan ||
      nodeSpan.category !== 'block-header' ||
      nodeSpan.owner.type !== 'Block' ||
      nodeSpan.owner.kind !== 'func'
    ) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const functionSymbol = symbolTable.getAllFunctions().find((symbol) => {
      if (!symbol.definitionRange) {
        return false;
      }

      const startOffset = positionToOffset(lookup.fragment.content, symbol.definitionRange.start);
      const endOffset = positionToOffset(lookup.fragment.content, symbol.definitionRange.end);
      return lookup.fragmentLocalOffset >= startOffset && lookup.fragmentLocalOffset <= endOffset;
    });
    const declaration = functionSymbol
      ? {
          name: functionSymbol.name,
          range: functionSymbol.definitionRange!,
          parameters: functionSymbol.parameters,
        }
      : collectLocalFunctionDeclarations(
          lookup.fragmentAnalysis.document,
          lookup.fragment.content,
        ).find((candidate) => {
          const startOffset = positionToOffset(lookup.fragment.content, candidate.range.start);
          const endOffset = positionToOffset(lookup.fragment.content, candidate.range.end);
          return lookup.fragmentLocalOffset >= startOffset && lookup.fragmentLocalOffset <= endOffset;
        });
    if (!declaration) {
      return null;
    }

    return {
      markdown: [
        `**Local function declaration: ${declaration.name}**`,
        '',
        '- Meaning: defines a fragment-local reusable macro body for `{{call::...}}`.',
        declaration.parameters.length > 0
          ? `- Parameters: ${declaration.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
          : '- Parameters: inferred at runtime',
        `- Local calls: ${functionSymbol?.references.length ?? 0}`,
      ].join('\n'),
      localStartOffset: positionToOffset(lookup.fragment.content, declaration.range.start),
      localEndOffset: positionToOffset(lookup.fragment.content, declaration.range.end),
    };
  }

  private buildFunctionCallHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    if (
      !tokenLookup ||
      !nodeSpan ||
      tokenLookup.category !== 'argument' ||
      nodeSpan.owner.type !== 'MacroCall' ||
      nodeSpan.owner.name.toLowerCase() !== 'call' ||
      nodeSpan.argumentIndex !== 0
    ) {
      return null;
    }

    const functionName = tokenLookup.token.value.trim();
    if (functionName.length === 0) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const functionSymbol = symbolTable.getFunction(functionName);
    const fallbackDeclaration = resolveLocalFunctionDeclaration(
      lookup.fragmentAnalysis.document,
      lookup.fragment.content,
      functionName,
    );
    const parameters = functionSymbol?.parameters ?? fallbackDeclaration?.parameters ?? [];
    const definitionRange = functionSymbol?.definitionRange ?? fallbackDeclaration?.range;
    const lines = [`**Local function reference: ${functionName}**`, ''];

    lines.push('- Meaning: references a fragment-local `#func` declaration used by `{{call::...}}`.');

    if (!functionSymbol && !fallbackDeclaration) {
      lines.push('- Status: unresolved local #func declaration');
    } else {
      if (parameters.length > 0) {
        lines.push(
          `- Parameters: ${parameters.map((parameter) => `\`${parameter}\``).join(', ')}`,
        );
      }
      if (definitionRange) {
        lines.push(`- Local definition: ${formatRangeStart(definitionRange)}`);
      }
      lines.push(`- Local calls: ${functionSymbol?.references.length ?? 0}`);
    }

    return {
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  private buildArgumentReferenceHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    if (!tokenLookup || !tokenMacroContext) {
      return null;
    }

    if (tokenMacroContext.macroName !== 'arg' || tokenMacroContext.argumentIndex !== 0) {
      return null;
    }

    const rawText = tokenLookup.token.value.trim();
    if (!/^\d+$/u.test(rawText)) {
      return null;
    }

    const reference = {
      index: Number.parseInt(rawText, 10),
      rawText,
      range: tokenLookup.localRange,
    };

    const activeFunctionContext = resolveActiveLocalFunctionContext(lookup);
    const parameter = activeFunctionContext?.declaration.parameters[reference.index];
    const lines = [`**Numbered argument reference: arg::${reference.rawText}**`, ''];

    lines.push(
      `- Meaning: references the ${formatOrdinal(reference.index + 1)} call argument during local \`#func\` recursion.`,
    );

    if (!activeFunctionContext) {
      lines.push('- Status: outside a local `#func` / `call::` context.');
    } else {
      lines.push(`- Local function: \`${activeFunctionContext.declaration.name}\``);
      lines.push(`- Parameter slot: ${reference.index}`);
      if (parameter) {
        lines.push(`- Parameter name: \`${parameter}\``);
      } else {
        lines.push(
          `- Status: current function only exposes ${activeFunctionContext.declaration.parameters.length} parameter(s).`,
        );
      }
    }

    return {
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  private buildWhenOperatorHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    if (!tokenLookup || !nodeSpan) {
      return null;
    }

    if (
      tokenLookup.category !== 'argument' ||
      nodeSpan.category !== 'block-header' ||
      nodeSpan.owner.type !== 'Block' ||
      nodeSpan.owner.kind !== 'when'
    ) {
      return null;
    }

    const operatorName = tokenLookup.token.value.trim().toLowerCase();
    const documentation = WHEN_OPERATOR_DOCS[operatorName as keyof typeof WHEN_OPERATOR_DOCS];
    if (!documentation) {
      return null;
    }

    return {
      markdown: [
        `**#when operator: ${tokenLookup.token.value.trim()}**`,
        '',
        documentation.summary,
        '',
        '```cbs',
        documentation.example,
        '```',
      ].join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }
}
