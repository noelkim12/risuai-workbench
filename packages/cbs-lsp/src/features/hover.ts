import { Hover, MarkupKind, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { formatHoverContent } from 'risu-workbench-core';
import type { CBSBuiltinRegistry, Range } from 'risu-workbench-core';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';

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

  provide(params: TextDocumentPositionParams): Hover | null {
    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const lookup = this.analysisService.locatePosition(request, params.position);
    if (!lookup) {
      return null;
    }

    const hoverTarget =
      this.buildBuiltinHover(lookup) ??
      this.buildVariableHover(lookup) ??
      this.buildWhenOperatorHover(lookup);
    if (!hoverTarget) {
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
    if (!tokenLookup || !nodeSpan) {
      return null;
    }

    if (
      tokenLookup.category !== 'argument' ||
      nodeSpan.category !== 'argument' ||
      nodeSpan.argumentIndex !== 0 ||
      nodeSpan.owner.type !== 'MacroCall'
    ) {
      return null;
    }

    const macroName = nodeSpan.owner.name.toLowerCase();
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
