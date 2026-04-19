import {
  type CancellationToken,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
  Range as LSPRange,
} from 'vscode-languageserver/node';
import type { CBSBuiltinRegistry, CBSBuiltinFunction } from 'risu-workbench-core';

import {
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  detectCompletionTriggerContext,
  resolveActiveLocalFunctionContext,
  shouldSuppressPureModeFeatures,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
  type CompletionTriggerContext,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';

export type CompletionRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface CompletionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: CompletionRequestResolver;
}

interface BlockSnippet {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
}

interface CalcOperatorCompletion {
  label: string;
  detail: string;
  documentation: string;
}

const BLOCK_SNIPPETS: readonly BlockSnippet[] = [
  {
    label: 'when-block',
    insertText: '{{#when ${1:condition}}}\n\t${2:body}\n{{/when}}',
    detail: 'When block snippet',
    documentation: 'Conditional block that executes body when condition is true.',
  },
  {
    label: 'when-else-block',
    insertText: '{{#when ${1:condition}}}\n\t${2:body}\n{{:else}}\n\t${3:otherwise}\n{{/when}}',
    detail: 'When-else block snippet',
    documentation: 'Conditional block with else branch.',
  },
  {
    label: 'each-block',
    insertText: '{{#each ${1:array} as ${2:item}}}\n\t{{slot::${2:item}}}\n{{/each}}',
    detail: 'Each block snippet',
    documentation: 'Iterate over array with slot variable.',
  },
  {
    label: 'escape-block',
    insertText: '{{#escape}}\n\t${1:content}\n{{/escape}}',
    detail: 'Escape block snippet',
    documentation: 'Escape CBS processing in body.',
  },
  {
    label: 'puredisplay-block',
    insertText: '{{#puredisplay}}\n\t${1:content}\n{{/puredisplay}}',
    detail: 'Pure display block snippet',
    documentation: 'Display content without evaluation.',
  },
  {
    label: 'pure-block',
    insertText: '{{#pure}}\n\t${1:content}\n{{/pure}}',
    detail: 'Pure block snippet',
    documentation: 'Keep body text literal without evaluating nested CBS macros.',
  },
  {
    label: 'func-block',
    insertText: '{{#func ${1:name} ${2:param}}}\n\t${3:body}\n{{/func}}',
    detail: 'Local function block snippet',
    documentation: 'Declare a fragment-local reusable macro body for `{{call::...}}`.',
  },
];

const WHEN_OPERATORS = [
  { name: 'is', description: 'Equality comparison' },
  { name: 'isnot', description: 'Inequality comparison' },
  { name: 'not', description: 'Negation' },
  { name: 'and', description: 'Logical AND' },
  { name: 'or', description: 'Logical OR' },
  { name: '>', description: 'Greater than' },
  { name: '>=', description: 'Greater than or equal' },
  { name: '<', description: 'Less than' },
  { name: '<=', description: 'Less than or equal' },
  { name: 'keep', description: 'Preserve whitespace' },
  { name: 'toggle', description: 'Check toggle state' },
  { name: 'var', description: 'Variable truthiness check' },
  { name: 'vis', description: 'Variable vs literal comparison' },
  { name: 'visnot', description: 'Variable vs literal inequality' },
  { name: 'tis', description: 'Toggle vs literal comparison' },
  { name: 'tisnot', description: 'Toggle vs literal inequality' },
  { name: 'legacy', description: 'Legacy whitespace behavior' },
];

const METADATA_KEYS = [
  { name: 'mobile', description: 'Mobile flag' },
  { name: 'local', description: 'Local flag' },
  { name: 'node', description: 'Node version' },
  { name: 'version', description: 'Version string' },
  { name: 'lang', description: 'Language code' },
  { name: 'user', description: 'User name' },
  { name: 'char', description: 'Character name' },
  { name: 'bot', description: 'Bot name (alias for char)' },
];

const CALC_OPERATORS: readonly CalcOperatorCompletion[] = [
  {
    label: '&&',
    detail: 'Logical AND',
    documentation: 'Combines two truthy/falsey numeric operands. Upstream evaluates truthy results as `1` and falsey as `0`.',
  },
  {
    label: '||',
    detail: 'Logical OR',
    documentation: 'Returns a truthy numeric result when either side is truthy.',
  },
  {
    label: '!',
    detail: 'Logical NOT',
    documentation: 'Negates the following operand inside the calc sublanguage.',
  },
  {
    label: '==',
    detail: 'Equality operator',
    documentation: 'Compares two numeric operands for equality.',
  },
  {
    label: '!=',
    detail: 'Inequality operator',
    documentation: 'Compares two numeric operands for inequality.',
  },
  {
    label: '<=',
    detail: 'Less-than-or-equal operator',
    documentation: 'Checks whether the left operand is less than or equal to the right operand.',
  },
  {
    label: '>=',
    detail: 'Greater-than-or-equal operator',
    documentation: 'Checks whether the left operand is greater than or equal to the right operand.',
  },
  {
    label: '+',
    detail: 'Addition operator',
    documentation: 'Adds two numeric operands.',
  },
  {
    label: '-',
    detail: 'Subtraction operator',
    documentation: 'Subtracts the right operand from the left operand. Unary minus is also supported.',
  },
  {
    label: '*',
    detail: 'Multiplication operator',
    documentation: 'Multiplies two numeric operands.',
  },
  {
    label: '/',
    detail: 'Division operator',
    documentation: 'Divides the left operand by the right operand.',
  },
  {
    label: '%',
    detail: 'Modulo operator',
    documentation: 'Returns the remainder after division.',
  },
  {
    label: '^',
    detail: 'Exponent operator',
    documentation: 'Raises the left operand to the power of the right operand.',
  },
  {
    label: 'null',
    detail: 'Null literal',
    documentation: 'Upstream normalizes `null` to `0` before evaluating the expression.',
  },
  {
    label: '(',
    detail: 'Open grouping',
    documentation: 'Starts a grouped sub-expression.',
  },
  {
    label: ')',
    detail: 'Close grouping',
    documentation: 'Ends a grouped sub-expression.',
  },
];

export class CompletionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: CompletionRequestResolver;

  constructor(
    private readonly registry: CBSBuiltinRegistry,
    options: CompletionProviderOptions = {},
  ) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  provide(params: TextDocumentPositionParams, cancellationToken?: CancellationToken): CompletionItem[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return [];
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const context = detectCompletionTriggerContext(lookup);
    if (context.type === 'none') {
      return [];
    }

    if (!lookup.recovery.tokenContextReliable && lookup.token?.category === 'plain-text') {
      return [];
    }

    if (!lookup.recovery.structureReliable && context.type === 'close-tag') {
      return [];
    }

    if (
      shouldSuppressPureModeFeatures(lookup) &&
      context.type !== 'argument-indices' &&
      context.type !== 'function-names'
    ) {
      return [];
    }

    const completions = this.buildCompletions(context, lookup);
    if (completions.length === 0) {
      return [];
    }

    // Apply fragment-bounded replacement range to all completions
    const range = lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
      request.text,
      context.startOffset,
      context.endOffset,
    );

    if (!range) {
      return completions;
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const lspRange = LSPRange.create(
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    );

    return completions.map((item) => ({
      ...item,
      textEdit: {
        range: lspRange,
        newText: item.insertText ?? item.label,
      },
    }));
  }

  private buildCompletions(
    context: CompletionTriggerContext,
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    switch (context.type) {
      case 'all-functions':
        return this.buildAllFunctionCompletions(context.prefix);
      case 'block-functions':
        return this.buildBlockFunctionCompletions(context.prefix);
      case 'else-keyword':
        return this.buildElseCompletion();
      case 'close-tag':
        return this.buildCloseTagCompletion(context.blockKind);
      case 'variable-names':
        return this.buildVariableCompletions(context.prefix, context.kind, lookup);
      case 'metadata-keys':
        return this.buildMetadataCompletions(context.prefix);
      case 'function-names':
        return this.buildFunctionCompletions(context.prefix, lookup);
      case 'argument-indices':
        return this.buildArgumentIndexCompletions(context.prefix, lookup);
      case 'when-operators':
        return this.buildWhenOperatorCompletions(context.prefix);
      case 'calc-expression':
        return this.buildCalcExpressionCompletions(context.prefix, context.referenceKind, lookup);
      default:
        return [];
    }
  }

  private buildCalcExpressionCompletions(
    prefix: string,
    referenceKind: 'chat' | 'global' | null,
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variables = symbolTable.getAllVariables();
    const normalizedPrefix = prefix.toLowerCase();

    const variableCompletions = variables
      .filter((variable) => {
        if (referenceKind === 'chat') {
          return variable.kind === 'chat' && variable.name.toLowerCase().startsWith(normalizedPrefix);
        }

        if (referenceKind === 'global') {
          return (
            variable.kind === 'global' && variable.name.toLowerCase().startsWith(normalizedPrefix)
          );
        }

        return variable.name.toLowerCase().startsWith(normalizedPrefix);
      })
      .map((variable) => {
        const marker = variable.kind === 'global' ? '@' : '$';
        return {
          label: `${marker}${variable.name}`,
          kind: CompletionItemKind.Variable,
          detail:
            variable.kind === 'global'
              ? 'Calc expression global variable'
              : 'Calc expression chat variable',
          documentation: {
            kind: 'markdown',
            value:
              variable.kind === 'global'
                ? `Reads global variable **${variable.name}** inside a calc expression. ` +
                  'Non-numeric values evaluate as `0`.'
                : `Reads chat variable **${variable.name}** inside a calc expression. ` +
                  'Non-numeric values evaluate as `0`.',
          },
          insertText: referenceKind ? variable.name : `${marker}${variable.name}`,
        } satisfies CompletionItem;
      });

    if (referenceKind) {
      return variableCompletions;
    }

    const operatorCompletions = CALC_OPERATORS.filter((operator) =>
      operator.label.toLowerCase().startsWith(normalizedPrefix),
    ).map(
      (operator) =>
        ({
          label: operator.label,
          kind: operator.label === 'null' ? CompletionItemKind.Constant : CompletionItemKind.Operator,
          detail: operator.detail,
          documentation: {
            kind: 'markdown',
            value: operator.documentation,
          },
          insertText: operator.label,
        }) satisfies CompletionItem,
    );

    return [...variableCompletions, ...operatorCompletions];
  }

  private buildAllFunctionCompletions(prefix: string): CompletionItem[] {
    const allFunctions = this.registry.getAll();
    const filtered = this.filterByPrefix(allFunctions, prefix);

    return filtered.map((fn) => ({
      label: fn.name,
      kind: fn.isBlock ? CompletionItemKind.Class : CompletionItemKind.Function,
      detail: fn.isBlock ? 'Block function' : 'Function',
      documentation: {
        kind: 'markdown',
        value: this.formatFunctionDocumentation(fn),
      },
      insertText: fn.name,
      deprecated: fn.deprecated !== undefined,
    }));
  }

  private buildBlockFunctionCompletions(prefix: string): CompletionItem[] {
    const allFunctions = this.registry.getAll();
    const blockFunctions = allFunctions.filter((fn) => fn.isBlock);
    // Strip leading # from prefix for comparison since registry stores names with # (e.g., "#when")
    const searchPrefix = prefix.startsWith('#') ? prefix.slice(1) : prefix;
    // Filter by comparing against name without # prefix (strip # from both sides)
    const lowerSearchPrefix = searchPrefix.toLowerCase();
    const filtered = blockFunctions.filter((fn) => {
      const nameWithoutHash = fn.name.startsWith('#') ? fn.name.slice(1) : fn.name;
      return (
        nameWithoutHash.toLowerCase().startsWith(lowerSearchPrefix) ||
        fn.aliases.some((alias) => alias.toLowerCase().startsWith(lowerSearchPrefix))
      );
    });

    const completions: CompletionItem[] = filtered.map((fn) => ({
      label: fn.name,
      kind: CompletionItemKind.Class,
      detail: 'Block function',
      documentation: {
        kind: 'markdown',
        value: this.formatFunctionDocumentation(fn),
      },
      insertText: fn.name,
      deprecated: fn.deprecated !== undefined,
    }));

    // Add block snippets
    for (const snippet of BLOCK_SNIPPETS) {
      if (snippet.label.toLowerCase().startsWith(prefix.toLowerCase())) {
        completions.push({
          label: snippet.label,
          kind: CompletionItemKind.Snippet,
          detail: snippet.detail,
          documentation: {
            kind: 'markdown',
            value: snippet.documentation,
          },
          insertText: snippet.insertText,
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
    }

    return completions;
  }

  private buildElseCompletion(): CompletionItem[] {
    const builtin = this.registry.get(':else');
    if (!builtin) {
      return [];
    }

    return [
      {
        label: ':else',
        kind: CompletionItemKind.Keyword,
        detail: 'Else keyword',
        documentation: {
          kind: 'markdown',
          value: this.formatFunctionDocumentation(builtin),
        },
        insertText: ':else',
      },
    ];
  }

  private buildCloseTagCompletion(blockKind: string): CompletionItem[] {
    // Normalize block kind by stripping leading # if present (e.g., "#when" -> "when")
    const normalizedKind = blockKind.startsWith('#') ? blockKind.slice(1) : blockKind;

    if (!normalizedKind) {
      // Offer all block close tags
      // Normalize block names by stripping # prefix (e.g., "#when" -> "when")
      const blocks = this.registry.getAll().filter((fn) => fn.isBlock);
      return blocks.map((fn) => {
        const nameWithoutHash = fn.name.startsWith('#') ? fn.name.slice(1) : fn.name;
        return {
          label: `/${nameWithoutHash}`,
          kind: CompletionItemKind.Keyword,
          detail: `Close ${nameWithoutHash} block`,
          insertText: `/${nameWithoutHash}`,
        };
      });
    }

    // Offer specific close tag for the open block
    return [
      {
        label: `/${normalizedKind}`,
        kind: CompletionItemKind.Keyword,
        detail: `Close ${normalizedKind} block`,
        insertText: `/${normalizedKind}`,
        preselect: true,
      },
    ];
  }

  private buildVariableCompletions(
    prefix: string,
    kind: 'chat' | 'temp',
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variables = symbolTable.getAllVariables();

    const matchingVars = variables.filter(
      (v) =>
        (kind === 'chat' ? v.kind === 'chat' || v.kind === 'global' : v.kind === 'temp') &&
        v.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    return matchingVars.map((v) => ({
      label: v.name,
      kind: CompletionItemKind.Variable,
      detail: kind === 'chat' ? 'Chat variable' : 'Temp variable',
      documentation: {
        kind: 'markdown',
        value: `Variable **${v.name}** (${v.kind})\n\n- Definitions: ${v.definitionRanges.length}\n- References: ${v.references.length}`,
      },
      insertText: v.name,
    }));
  }

  private buildFunctionCompletions(
    prefix: string,
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbolFunctions = symbolTable.getAllFunctions();
    const functionCandidates =
      symbolFunctions.length > 0
        ? symbolFunctions.map((symbol) => ({
            name: symbol.name,
            parameters: symbol.parameters,
            references: symbol.references.length,
          }))
        : collectLocalFunctionDeclarations(
            lookup.fragmentAnalysis.document,
            lookup.fragment.content,
          ).map((declaration) => ({
            name: declaration.name,
            parameters: declaration.parameters,
            references: 0,
          }));

    const functions = functionCandidates.filter((symbol) =>
      symbol.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    return functions.map((symbol) => ({
      label: symbol.name,
      kind: CompletionItemKind.Function,
      detail: 'Local #func declaration',
      documentation: {
        kind: 'markdown',
        value: [
          `**Local function: ${symbol.name}**`,
          '',
          symbol.parameters.length > 0
            ? `Parameters: ${symbol.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
            : 'Parameters: inferred at runtime',
          `Local calls: ${symbol.references}`,
        ].join('\n'),
      },
      insertText: symbol.name,
    }));
  }

  private buildArgumentIndexCompletions(
    prefix: string,
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    const activeFunctionContext = resolveActiveLocalFunctionContext(lookup);
    const declaration = activeFunctionContext?.declaration;
    if (!declaration || declaration.parameters.length === 0) {
      return [];
    }

    return declaration.parameters
      .map((parameter, index) => ({ parameter, index }))
      .filter(({ index }) => index.toString().startsWith(prefix.trim()))
      .map(({ parameter, index }) => ({
        label: index.toString(),
        kind: CompletionItemKind.Constant,
        detail: `0-based local argument slot for \`${parameter}\``,
        documentation: {
          kind: 'markdown',
          value: [
            `**Numbered argument reference: arg::${index}**`,
            '',
            `- Local function: \`${declaration.name}\``,
            `- Parameter slot: ${index}`,
            `- Parameter name: \`${parameter}\``,
            '- Meaning: reads the matching call argument during `{{call::...}}` recursion.',
          ].join('\n'),
        },
        insertText: index.toString(),
      }));
  }

  private buildMetadataCompletions(prefix: string): CompletionItem[] {
    const filtered = METADATA_KEYS.filter((k) =>
      k.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    return filtered.map((k) => ({
      label: k.name,
      kind: CompletionItemKind.Property,
      detail: 'Metadata key',
      documentation: {
        kind: 'markdown',
        value: `${k.description}`,
      },
      insertText: k.name,
    }));
  }

  private buildWhenOperatorCompletions(prefix: string): CompletionItem[] {
    const filtered = WHEN_OPERATORS.filter((op) =>
      op.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    return filtered.map((op) => ({
      label: op.name,
      kind: CompletionItemKind.Operator,
      detail: 'When operator',
      documentation: {
        kind: 'markdown',
        value: `${op.description}\n\n\`\`\`cbs\n{{#when::left::${op.name}::right}}...{{/when}}\n\`\`\``,
      },
      insertText: op.name,
    }));
  }

  private filterByPrefix(functions: CBSBuiltinFunction[], prefix: string): CBSBuiltinFunction[] {
    if (!prefix) {
      return functions;
    }

    const lowerPrefix = prefix.toLowerCase();
    return functions.filter(
      (fn) =>
        fn.name.toLowerCase().startsWith(lowerPrefix) ||
        fn.aliases.some((alias) => alias.toLowerCase().startsWith(lowerPrefix)),
    );
  }

  private formatFunctionDocumentation(fn: CBSBuiltinFunction): string {
    const lines: string[] = [];

    if (fn.deprecated) {
      lines.push(`**Deprecated:** ${fn.deprecated.message}`);
      if (fn.deprecated.replacement) {
        lines.push(`Use \`${fn.deprecated.replacement}\` instead.`);
      }
      lines.push('');
    }

    lines.push(fn.description);

    if (fn.arguments.length > 0) {
      lines.push('');
      lines.push('**Arguments:**');
      for (const arg of fn.arguments) {
        const required = arg.required ? '(required)' : '(optional)';
        const variadic = arg.variadic ? '...' : '';
        lines.push(`- \`${arg.name}${variadic}\` ${required}: ${arg.description}`);
      }
    }

    if (fn.aliases.length > 0) {
      lines.push('');
      lines.push(`**Aliases:** ${fn.aliases.map((a) => `\`${a}\``).join(', ')}`);
    }

    return lines.join('\n');
  }
}
