import {
  type CancellationToken,
  Hover,
  type MarkedString,
  MarkupKind,
  type MarkupContent,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { formatHoverContent } from 'risu-workbench-core';
import type { CBSBuiltinFunction, CBSBuiltinRegistry, Range } from 'risu-workbench-core';
import {
  CALC_EXPRESSION_SUBLANGUAGE_LABEL,
  getCalcExpressionSublanguageDocumentation,
} from '../core/calc-expression';
import { CbsLspTextHelper } from '../helpers/text-helper';

import {
  createAgentMetadataEnvelope,
  createAgentMetadataExplanation,
  createStaleWorkspaceAvailability,
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  findCalcReferenceAtOffset,
  resolveVisibleLoopBindingFromNodePath,
  getCalcExpressionZone,
  resolveTokenMacroArgumentContext,
  resolveActiveLocalFunctionContext,
  resolveLocalFunctionDeclaration,
  shouldSuppressPureModeFeatures,
  isAgentMetadataEnvelope,
  type AgentMetadataCategoryContract,
  type AgentMetadataEnvelope,
  type AgentMetadataExplanationContract,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataWorkspaceSnapshotContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import { isRequestCancelled } from '../utils/request-cancellation';
import type {
  VariableFlowQueryResult,
  VariableFlowService,
  WorkspaceSnapshotState,
} from '../services';
import { positionToOffset } from '../utils/position';
import { isDocOnlyBuiltin } from 'risu-workbench-core';

export type HoverRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface HoverProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: HoverRequestResolver;
  variableFlowService?: VariableFlowService;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

interface HoverTarget {
  data: AgentMetadataEnvelope;
  markdown: string;
  localStartOffset: number;
  localEndOffset: number;
}

export interface AgentFriendlyHover extends Hover {
  data: AgentMetadataEnvelope;
}

export interface NormalizedHoverSnapshot {
  contents: {
    kind: string | null;
    value: string;
  };
  data: AgentMetadataEnvelope | null;
  range: Range | null;
}

function normalizeHoverContents(contents: Hover['contents']): NormalizedHoverSnapshot['contents'] {
  if (typeof contents === 'string') {
    return { kind: null, value: contents };
  }

  if (Array.isArray(contents)) {
    return {
      kind: null,
      value: contents.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n'),
    };
  }

  const markup = contents as MarkupContent | MarkedString;

  if (typeof markup === 'string') {
    return { kind: null, value: markup };
  }

  return {
    kind: 'kind' in markup ? markup.kind : null,
    value: markup.value,
  };
}

export function normalizeHoverForSnapshot(hover: Hover | null): NormalizedHoverSnapshot | null {
  if (!hover) {
    return null;
  }

  const agentHover = hover as Partial<AgentFriendlyHover>;

  return {
    contents: normalizeHoverContents(hover.contents),
    data: isAgentMetadataEnvelope(agentHover.data) ? agentHover.data : null,
    range: hover.range ?? null,
  };
}

const SLOT_MACRO_RULES = Object.freeze({
  slot: { kind: 'loop', argumentIndex: 0 },
} as const);

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

function formatParameterSlotSummary(
  parameters: readonly { name: string }[],
): string {
  if (parameters.length === 0) {
    return 'none declared';
  }

  return parameters
    .map((parameter, index) => `\`arg::${index}\` → \`${parameter.name}\``)
    .join(', ');
}

function formatParameterDefinitionSummary(
  parameters: readonly { name: string; range: Range }[],
): string {
  if (parameters.length === 0) {
    return 'none declared';
  }

  return parameters
    .map(
      (parameter) =>
        `\`${parameter.name}\` (${CbsLspTextHelper.formatRangeStart(parameter.range)})`,
    )
    .join(', ');
}

function formatWorkspaceOccurrenceSummary(
  occurrence: VariableFlowQueryResult['occurrences'][number],
): string {
  const codeQuote = String.fromCharCode(96);
  return `${occurrence.relativePath} (${CbsLspTextHelper.formatRangeStart(occurrence.hostRange)}) — ${codeQuote}${occurrence.sourceName}${codeQuote}`;
}

function pickRepresentativeOccurrences<T extends VariableFlowQueryResult['occurrences'][number]>(
  occurrences: readonly T[],
  limit: number = 3,
): readonly T[] {
  return [...occurrences]
    .sort(
      (left, right) =>
        left.relativePath.localeCompare(right.relativePath) ||
        left.hostStartOffset - right.hostStartOffset ||
        left.sourceName.localeCompare(right.sourceName),
    )
    .slice(0, limit);
}

function formatWorkspaceIssueSummary(
  issueMatch: VariableFlowQueryResult['issues'][number],
): string {
  const representativeOccurrence = pickRepresentativeOccurrences(issueMatch.occurrences, 1)[0] ?? null;
  const locationSuffix = representativeOccurrence
    ? ` — ${formatWorkspaceOccurrenceSummary(representativeOccurrence)}`
    : '';

  return `${issueMatch.issue.type} [${issueMatch.issue.severity}]: ${issueMatch.issue.message}${locationSuffix}`;
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

  private readonly variableFlowService: VariableFlowService | null;

  private readonly workspaceSnapshot: WorkspaceSnapshotState | null;

  constructor(
    private readonly registry: CBSBuiltinRegistry,
    options: HoverProviderOptions = {},
  ) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
    this.workspaceSnapshot = options.workspaceSnapshot ?? null;
  }

  provide(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): AgentFriendlyHover | null {
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

    const workspaceFreshness = this.getWorkspaceFreshness(request);
    const workspaceVariableQuery =
      this.variableFlowService && workspaceFreshness?.freshness !== 'stale'
        ? this.variableFlowService.queryAt(request.uri, positionToOffset(request.text, params.position))
        : null;

    const hoverTarget =
      this.buildBuiltinHover(lookup) ??
      this.buildCalcExpressionHover(lookup) ??
      this.buildSlotAliasHover(lookup) ??
      this.buildVariableHover(lookup, request.uri, workspaceVariableQuery, workspaceFreshness) ??
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
      data: hoverTarget.data,
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
        data: this.createCategoryData({
          category: builtin.isBlock || tokenLookup.category === 'else' ? 'block-keyword' : 'builtin',
          kind:
            tokenLookup.category === 'else'
              ? 'else-keyword'
              : isDocOnlyBuiltin(builtin)
                ? 'documentation-only-builtin'
                : 'callable-builtin',
        }, this.getBuiltinExplanation(
          builtin,
          tokenLookup.category === 'else'
            ? 'Hover resolved this token from the builtin registry as the special :else branch keyword.'
            : undefined,
        )),
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
      data: this.createCategoryData({
        category: builtin.isBlock ? 'block-keyword' : 'builtin',
        kind: isDocOnlyBuiltin(builtin) ? 'documentation-only-builtin' : 'callable-builtin',
      }, this.getBuiltinExplanation(builtin)),
      markdown: formatHoverContent(builtin),
      localStartOffset: keywordTarget.localStartOffset,
      localEndOffset: keywordTarget.localEndOffset,
    };
  }

  private buildSlotAliasHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    const nodeSpan = lookup.nodeSpan;
    if (!tokenLookup || tokenLookup.category !== 'argument') {
      return null;
    }

    const macroName = tokenMacroContext?.argumentIndex === 0
      ? tokenMacroContext.macroName
      : nodeSpan &&
          nodeSpan.category === 'argument' &&
          nodeSpan.argumentIndex === 0 &&
          nodeSpan.owner.type === 'MacroCall'
        ? nodeSpan.owner.name.toLowerCase()
        : null;
    const slotRule = macroName
      ? SLOT_MACRO_RULES[macroName as keyof typeof SLOT_MACRO_RULES]
      : null;
    const bindingName = tokenLookup.token.value.trim();
    const slotPrefix = lookup.fragment.content
      .slice(Math.max(0, tokenLookup.localStartOffset - 'slot::'.length), tokenLookup.localStartOffset)
      .toLowerCase();
    const looksLikeSlotReference = slotPrefix === 'slot::';
    if ((!slotRule && !looksLikeSlotReference) || bindingName.length === 0) {
      return null;
    }

    const bindingMatch = resolveVisibleLoopBindingFromNodePath(
      lookup.nodePath,
      lookup.fragment.content,
      bindingName,
      lookup.fragmentLocalOffset,
    );
    if (!bindingMatch) {
      return {
        data: this.createCategoryData({
          category: 'contextual-token',
          kind: 'loop-alias',
        }, this.createScopeExplanation(
          'visible-loop-bindings',
          'Hover used scope analysis to interpret this slot:: token as a missing loop alias reference.',
        )),
        markdown: [
          `**Loop alias reference: ${bindingName}**`,
          '',
          `- Meaning: \`slot::${bindingName}\` tries to reference the active \`#each ... as ${bindingName}\` loop alias.`,
          '- Status: no visible `#each` loop alias with that name is active at this position.',
        ].join('\n'),
        localStartOffset: tokenLookup.localStartOffset,
        localEndOffset: tokenLookup.localEndOffset,
      };
    }

    const { binding, scopeDepth } = bindingMatch;
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const loopSymbol = symbolTable.getVariables(binding.bindingName, 'loop').find((candidate) => {
      if (!candidate.definitionRange) {
        return false;
      }

      return (
        candidate.definitionRange.start.line === binding.bindingRange.start.line &&
        candidate.definitionRange.start.character === binding.bindingRange.start.character &&
        candidate.definitionRange.end.line === binding.bindingRange.end.line &&
        candidate.definitionRange.end.character === binding.bindingRange.end.character
      );
    });
    const scopeLabel = scopeDepth === 0
      ? 'current `#each` block'
      : scopeDepth === 1
        ? 'outer `#each` block'
        : `outer \
\`#each\` block (${scopeDepth} levels up)`;
    const lines = [`**Loop alias reference: ${binding.bindingName}**`, ''];

    lines.push(
      `- Meaning: \`slot::${binding.bindingName}\` points to the currently visible \`#each\` loop alias, not the builtin \`slot\` syntax entry itself.`,
    );
    lines.push(`- Bound by: \`#each ${binding.iteratorExpression} as ${binding.bindingName}\``);
    lines.push(`- Scope: ${scopeLabel}`);
    lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(binding.bindingRange)}`);

    if (loopSymbol) {
      lines.push(`- Local references: ${loopSymbol.references.length}`);
    }

    return {
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'loop-alias',
      }, this.createScopeExplanation(
        'visible-loop-bindings',
        'Hover resolved this slot:: token through visible #each loop bindings from scope analysis.',
      )),
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  private buildVariableHover(
    lookup: FragmentCursorLookupResult,
    currentUri: string,
    workspaceVariableQuery: VariableFlowQueryResult | null,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  ): HoverTarget | null {
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
      lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(symbol.definitionRange)}`);
    }

    if (symbol) {
      lines.push(`- Local references: ${symbol.references.length}`);
    }

    if (kind === 'chat' && workspaceVariableQuery?.variableName === variableName) {
      const externalWriters = workspaceVariableQuery.writers.filter(
        (occurrence) => occurrence.uri !== currentUri,
      );
      const externalReaders = workspaceVariableQuery.readers.filter(
        (occurrence) => occurrence.uri !== currentUri,
      );
      const representativeWriters = pickRepresentativeOccurrences(workspaceVariableQuery.writers);

      lines.push(`- Workspace writers: ${workspaceVariableQuery.writers.length}`);
      lines.push(`- Workspace readers: ${workspaceVariableQuery.readers.length}`);

      if (workspaceVariableQuery.defaultValue) {
        lines.push(`- Default value: ${workspaceVariableQuery.defaultValue}`);
      }

      if (representativeWriters.length > 0) {
        lines.push('- Representative writers:');
        for (const writer of representativeWriters) {
          lines.push(`  - ${formatWorkspaceOccurrenceSummary(writer)}`);
        }
      }

      if (externalWriters.length > 0) {
        lines.push('- External writers:');
        for (const writer of externalWriters) {
          lines.push(`  - ${formatWorkspaceOccurrenceSummary(writer)}`);
        }
      }

      if (externalReaders.length > 0) {
        lines.push('- External readers:');
        for (const reader of externalReaders) {
          lines.push(`  - ${formatWorkspaceOccurrenceSummary(reader)}`);
        }
      }

      if (workspaceVariableQuery.issues.length > 0) {
        lines.push('- Workspace issues:');
        for (const issue of workspaceVariableQuery.issues) {
          lines.push(`  - ${formatWorkspaceIssueSummary(issue)}`);
        }
      }
    }

    return {
      data: this.createCategoryData(
        {
          category: 'variable',
          kind:
            kind === 'global'
              ? 'global-variable'
              : kind === 'temp'
                ? 'temp-variable'
                : 'chat-variable',
        },
        this.createScopeExplanation(
          'variable-symbol-table',
          'Hover resolved this variable through analyzed symbol-table entries for the current macro argument.',
        ),
        kind === 'chat'
          ? this.getStaleWorkspaceAvailability(workspaceFreshness, 'hover')
          : undefined,
        kind === 'chat' ? (workspaceFreshness ?? undefined) : undefined,
      ),
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

    const calcDocumentation = getCalcExpressionSublanguageDocumentation();

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
        `- Context: ${calcDocumentation.summary}`,
        `- Kind: ${kindLabel}`,
        `- Semantics: ${calcReference.kind === 'global' ? '`@name` reads a global variable' : '`$name` reads a chat variable'} and upstream coerces non-numeric values to \`0\`.`,
      ];

      if (symbol?.definitionRange) {
        lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(symbol.definitionRange)}`);
      }

      if (symbol) {
        lines.push(`- Local references: ${symbol.references.length}`);
      }

      return {
        data: this.createCategoryData({
          category: 'variable',
          kind: calcReference.kind === 'global' ? 'global-variable' : 'chat-variable',
        }, this.createScopeExplanation(
          'calc-expression-symbol-table',
          'Hover resolved this calc reference through symbol-table lookup inside the shared expression sublanguage.',
        )),
        markdown: lines.join('\n'),
        localStartOffset: calcReference.startOffset,
        localEndOffset: calcReference.endOffset,
      };
    }

    return {
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'calc-expression-zone',
      }, this.createContextualExplanation(
        'calc-expression-context',
        'Hover inferred that the cursor is inside the shared CBS expression sublanguage zone.',
      )),
      markdown: [
        `**${CALC_EXPRESSION_SUBLANGUAGE_LABEL}**`,
        '',
        calcDocumentation.summary,
        '',
        `- ${calcDocumentation.variables}`,
        `- ${calcDocumentation.operators}`,
        `- ${calcDocumentation.coercion}`,
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
    const fallbackDeclaration = collectLocalFunctionDeclarations(
      lookup.fragmentAnalysis.document,
      lookup.fragment.content,
    ).find((candidate) => {
      const startOffset = positionToOffset(lookup.fragment.content, candidate.range.start);
      const endOffset = positionToOffset(lookup.fragment.content, candidate.range.end);
      return lookup.fragmentLocalOffset >= startOffset && lookup.fragmentLocalOffset <= endOffset;
    });
    const declaration = fallbackDeclaration ?? (functionSymbol
      ? {
          name: functionSymbol.name,
          range: functionSymbol.definitionRange!,
          parameters: functionSymbol.parameters,
          parameterDeclarations: functionSymbol.parameters.map((parameter, index) => ({
            index,
            name: parameter,
            range: functionSymbol.definitionRange!,
          })),
        }
      : null);
    if (!declaration) {
      return null;
    }

    return {
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'local-function',
      }, this.createContextualExplanation(
        'local-function-declaration',
        'Hover inferred a fragment-local #func declaration from the current block-header context.',
      )),
      markdown: [
        `**Local function declaration: ${declaration.name}**`,
        '',
        `- Meaning: \`#func ${declaration.name}\` declares a fragment-local reusable macro body that \`{{call::${declaration.name}::...}}\` can invoke.`,
        `- Local definition: ${CbsLspTextHelper.formatRangeStart(declaration.range)}`,
        declaration.parameters.length > 0
          ? `- Parameters: ${declaration.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
          : '- Parameters: inferred at runtime',
        `- Parameter slots: ${formatParameterSlotSummary(declaration.parameterDeclarations)}`,
        `- Parameter definitions: ${formatParameterDefinitionSummary(declaration.parameterDeclarations)}`,
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
        lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(definitionRange)}`);
      }
      lines.push(`- Local calls: ${functionSymbol?.references.length ?? 0}`);
    }

    return {
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'local-function',
      }, this.createContextualExplanation(
        'local-function-reference',
        'Hover interpreted this token as a call:: local-function reference candidate.',
      )),
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
    const parameterDeclaration = activeFunctionContext?.declaration.parameterDeclarations[reference.index];
    const lines = [`**Numbered argument reference: arg::${reference.rawText}**`, ''];

    lines.push(
      `- Meaning: references the ${CbsLspTextHelper.formatOrdinal(reference.index + 1)} call argument from the active local \`#func\` / \`{{call::...}}\` context.`,
    );

    if (!activeFunctionContext) {
      lines.push('- Status: outside a local `#func` / `call::` context.');
    } else {
      lines.push(`- Local function: \`${activeFunctionContext.declaration.name}\``);
      lines.push(`- Local #func declaration: ${CbsLspTextHelper.formatRangeStart(activeFunctionContext.declaration.range)}`);
      lines.push(`- Parameter slot: ${reference.index}`);
      if (parameterDeclaration) {
        lines.push(`- Parameter name: \`${parameterDeclaration.name}\``);
        lines.push(`- Parameter definition: ${CbsLspTextHelper.formatRangeStart(parameterDeclaration.range)}`);
      } else {
        lines.push(
          `- Status: current function only exposes ${activeFunctionContext.declaration.parameters.length} parameter(s).`,
        );
      }
    }

    return {
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'argument-index',
      }, this.createContextualExplanation(
        'active-local-function-context',
        'Hover inferred an arg:: numbered parameter reference from the active local #func / call:: context.',
      )),
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
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'when-operator',
      }, this.createContextualExplanation(
        'when-operator-context',
        'Hover interpreted this token as a #when operator from the current block-header argument position.',
      )),
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

  /**
   * createCategoryData 함수.
   * hover payload에 붙일 공통 category envelope를 생성함.
   *
   * @param category - hover 결과를 machine-readable하게 분류할 stable category 값
   * @returns hover `data`에 그대로 넣을 envelope
   */
  private createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: AgentMetadataAvailabilityContract,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ): AgentMetadataEnvelope {
    return createAgentMetadataEnvelope(category, explanation, availability, workspace);
  }

  private getWorkspaceFreshness(
    request: FragmentAnalysisRequest,
  ): AgentMetadataWorkspaceSnapshotContract | null {
    if (!this.variableFlowService || !this.workspaceSnapshot) {
      return null;
    }

    return this.variableFlowService.getWorkspaceFreshness({
      uri: request.uri,
      version: request.version,
    });
  }

  private getStaleWorkspaceAvailability(
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
    feature: 'completion' | 'hover',
  ): AgentMetadataAvailabilityContract | undefined {
    if (workspaceFreshness?.freshness !== 'stale') {
      return undefined;
    }

    return createStaleWorkspaceAvailability(feature, workspaceFreshness.detail);
  }

  private createContextualExplanation(
    source: string,
    detail: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('contextual-inference', source, detail);
  }

  private createScopeExplanation(
    source: string,
    detail: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('scope-analysis', source, detail);
  }

  private getBuiltinExplanation(
    builtin: CBSBuiltinFunction,
    detail?: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation(
      'registry-lookup',
      'builtin-registry',
      detail ??
        (isDocOnlyBuiltin(builtin)
          ? `Hover resolved ${builtin.name} from the builtin registry as a documentation-only CBS syntax entry.`
          : `Hover resolved ${builtin.name} from the builtin registry as a callable CBS builtin.`),
    );
  }
}
