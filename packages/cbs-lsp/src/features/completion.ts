import {
  type CancellationToken,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  type InsertReplaceEdit,
  type MarkupContent,
  TextDocumentPositionParams,
  Range as LSPRange,
  type TextEdit,
  type Position,
} from 'vscode-languageserver/node';
import {
  isContextualBuiltin,
  isDocOnlyBuiltin,
  type CBSBuiltinRegistry,
  type CBSBuiltinFunction,
} from 'risu-workbench-core';

import {
  CBS_AGENT_PROTOCOL_SCHEMA,
  CBS_AGENT_PROTOCOL_VERSION,
  createAgentMetadataEnvelope,
  createAgentMetadataExplanation,
  createStaleWorkspaceAvailability,
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  detectCompletionTriggerContext,
  resolveActiveLocalFunctionContext,
  shouldSuppressPureModeFeatures,
  isAgentMetadataEnvelope,
  type AgentMetadataEnvelope,
  type AgentMetadataCategoryContract,
  type AgentMetadataExplanationContract,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataWorkspaceSnapshotContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
  type CompletionTriggerContext,
} from '../core';
import { collectVisibleLoopBindingsFromNodePath } from '../analyzer/scopeAnalyzer';
import type { VariableFlowService, WorkspaceSnapshotState } from '../services';
import { CbsLspTextHelper } from '../helpers/text-helper';
import { isRequestCancelled } from '../utils/request-cancellation';

export type CompletionRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface CompletionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: CompletionRequestResolver;
  variableFlowService?: VariableFlowService;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

/**
 * Minimal unresolved completion item data payload.
 * Carries stable category contract plus request context (uri/position) for strong resolve matching.
 * Explanation, workspace snapshot, detail, documentation are deferred to resolve.
 */
export interface UnresolvedCompletionItemData {
  cbs: {
    schema: typeof CBS_AGENT_PROTOCOL_SCHEMA;
    schemaVersion: typeof CBS_AGENT_PROTOCOL_VERSION;
    category: AgentMetadataCategoryContract;
    uri: string;
    position: Position;
  };
}

/**
 * Lightweight unresolved completion item shape.
 * Heavy fields (detail, documentation, explanation, workspace snapshot) are omitted and restored by resolve.
 */
export type UnresolvedCompletionItem = Omit<
  CompletionItem,
  'detail' | 'documentation' | 'data'
> & {
  data: UnresolvedCompletionItemData;
};

/**
 * CBS_COMPLETION_TRIGGER_CHARACTERS 상수.
 * CBS/Lua 입력 흐름에서 자동 completion을 재요청해야 하는 핵심 trigger 문자 집합.
 */
export const CBS_COMPLETION_TRIGGER_CHARACTERS = ['{', ':', '#', '/', '?', '<', '"'] as const;

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

function canCompleteFromRecoveredPlainTextContext(context: CompletionTriggerContext): boolean {
  return context.type !== 'none' && context.type !== 'close-tag';
}

function normalizeCompletionTextEditNewText(
  item: CompletionItem,
  context: CompletionTriggerContext,
): string {
  const newText = item.insertText ?? item.label;
  if (
    context.type === 'block-functions' &&
    item.kind === CompletionItemKind.Class &&
    context.prefix.startsWith('#') &&
    newText.startsWith('#')
  ) {
    return newText.slice(1);
  }

  if (
    context.type === 'block-functions' &&
    item.kind === CompletionItemKind.Snippet &&
    newText.startsWith('{{')
  ) {
    return newText.slice(2);
  }

  return newText;
}

export interface NormalizedCompletionTextEditSnapshot {
  insert: LSPRange | null;
  newText: string;
  range: LSPRange | null;
  replace: LSPRange | null;
}

export interface NormalizedCompletionItemSnapshot {
  data: AgentMetadataEnvelope | null;
  deprecated: boolean;
  detail: string | null;
  documentation: string | null;
  insertText: string | null;
  insertTextFormat: InsertTextFormat | null;
  kind: CompletionItemKind | null;
  label: string;
  preselect: boolean;
  resolved: boolean;
  sortText: string | null;
  textEdit: NormalizedCompletionTextEditSnapshot | null;
}

function compareStrings(left: string | null, right: string | null): number {
  return (left ?? '').localeCompare(right ?? '');
}

function compareBooleans(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

function compareNumbers(left: number | null, right: number | null): number {
  return (left ?? -1) - (right ?? -1);
}

function comparePositions(
  left: LSPRange['start'] | null | undefined,
  right: LSPRange['start'] | null | undefined,
): number {
  return (
    compareNumbers(left?.line ?? null, right?.line ?? null) ||
    compareNumbers(left?.character ?? null, right?.character ?? null)
  );
}

function compareRanges(left: LSPRange | null, right: LSPRange | null): number {
  return comparePositions(left?.start, right?.start) || comparePositions(left?.end, right?.end);
}

function normalizeMarkupContent(documentation: CompletionItem['documentation']): string | null {
  if (typeof documentation === 'string') {
    return documentation;
  }

  if (Array.isArray(documentation)) {
    return documentation.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n');
  }

  return (documentation as MarkupContent | undefined)?.value ?? null;
}

function normalizeTextEdit(
  textEdit: CompletionItem['textEdit'],
): NormalizedCompletionTextEditSnapshot | null {
  if (!textEdit) {
    return null;
  }

  const edit = textEdit as TextEdit | InsertReplaceEdit;

  return {
    insert: 'insert' in edit ? edit.insert : null,
    newText: edit.newText,
    range: 'range' in edit ? edit.range : null,
    replace: 'replace' in edit ? edit.replace : null,
  };
}

function compareNormalizedCompletionTextEdits(
  left: NormalizedCompletionTextEditSnapshot | null,
  right: NormalizedCompletionTextEditSnapshot | null,
): number {
  return (
    compareStrings(left?.newText ?? null, right?.newText ?? null) ||
    compareRanges(left?.range ?? null, right?.range ?? null) ||
    compareRanges(left?.insert ?? null, right?.insert ?? null) ||
    compareRanges(left?.replace ?? null, right?.replace ?? null)
  );
}

function compareAgentMetadata(
  left: AgentMetadataEnvelope | null,
  right: AgentMetadataEnvelope | null,
): number {
  return (
    compareStrings(left?.cbs.category.category ?? null, right?.cbs.category.category ?? null) ||
    compareStrings(left?.cbs.category.kind ?? null, right?.cbs.category.kind ?? null)
  );
}

function compareNormalizedCompletionSnapshots(
  left: NormalizedCompletionItemSnapshot,
  right: NormalizedCompletionItemSnapshot,
): number {
  return (
    compareStrings(left.sortText, right.sortText) ||
    compareStrings(left.label, right.label) ||
    compareNumbers(left.kind, right.kind) ||
    compareBooleans(left.resolved, right.resolved) ||
    compareStrings(left.detail, right.detail) ||
    compareStrings(left.documentation, right.documentation) ||
    compareStrings(left.insertText, right.insertText) ||
    compareNumbers(left.insertTextFormat, right.insertTextFormat) ||
    compareBooleans(left.deprecated, right.deprecated) ||
    compareBooleans(left.preselect, right.preselect) ||
    compareNormalizedCompletionTextEdits(left.textEdit, right.textEdit) ||
    compareAgentMetadata(left.data, right.data)
  );
}

export function normalizeCompletionItemForSnapshot(
  item: CompletionItem,
): NormalizedCompletionItemSnapshot {
  const hasDetail = item.detail !== undefined && item.detail !== null && item.detail !== '';
  const hasDocumentation =
    item.documentation !== undefined &&
    item.documentation !== null &&
    normalizeMarkupContent(item.documentation) !== null;
  const envelope = isAgentMetadataEnvelope(item.data) ? item.data : null;
  const hasHeavyData =
    envelope !== null &&
    (envelope.cbs.explanation !== undefined || envelope.cbs.workspace !== undefined);

  return {
    data: envelope,
    deprecated: item.deprecated ?? false,
    detail: item.detail ?? null,
    documentation: normalizeMarkupContent(item.documentation),
    insertText: item.insertText ?? null,
    insertTextFormat: item.insertTextFormat ?? null,
    kind: item.kind ?? null,
    label: item.label,
    preselect: item.preselect ?? false,
    resolved: hasDetail || hasDocumentation || hasHeavyData,
    sortText: item.sortText ?? null,
    textEdit: normalizeTextEdit(item.textEdit),
  };
}

export function normalizeCompletionItemsForSnapshot(
  items: readonly CompletionItem[],
): NormalizedCompletionItemSnapshot[] {
  return [...items].map(normalizeCompletionItemForSnapshot).sort(compareNormalizedCompletionSnapshots);
}

/**
 * stripCompletionItemToUnresolved 함수.
 * fully resolved completion item에서 heavy field를 제거해 lightweight unresolved item을 만듦.
 * deferred field: detail, documentation, data.explanation, data.workspace.
 * request context (uri, position)를 data에 추가해 resolve matching을 강화함.
 *
 * @param item - 원본 resolved completion item
 * @param uri - 요청 문서 URI
 * @param position - 요청 cursor position
 * @returns heavy field가 제거된 unresolved completion item
 */
export function stripCompletionItemToUnresolved(
  item: CompletionItem,
  uri: string,
  position: Position,
): UnresolvedCompletionItem {
  const envelope = isAgentMetadataEnvelope(item.data)
    ? item.data
    : createAgentMetadataEnvelope({ category: 'builtin', kind: 'callable-builtin' });

  return {
    label: item.label,
    kind: item.kind,
    insertText: item.insertText,
    insertTextFormat: item.insertTextFormat,
    preselect: item.preselect,
    sortText: item.sortText,
    deprecated: item.deprecated,
    textEdit: item.textEdit,
    data: {
      cbs: {
        schema: CBS_AGENT_PROTOCOL_SCHEMA,
        schemaVersion: CBS_AGENT_PROTOCOL_VERSION,
        category: envelope.cbs.category,
        uri,
        position,
      },
    },
  };
}

export class CompletionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: CompletionRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  private readonly workspaceSnapshot: WorkspaceSnapshotState | null;

  constructor(
    private readonly registry: CBSBuiltinRegistry,
    options: CompletionProviderOptions = {},
  ) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
    this.workspaceSnapshot = options.workspaceSnapshot ?? null;
  }

  provide(params: TextDocumentPositionParams, cancellationToken?: CancellationToken): CompletionItem[] {
    return this.provideInternal(params, cancellationToken, false);
  }

  private provideInternal(
    params: TextDocumentPositionParams,
    cancellationToken: CancellationToken | undefined,
    unresolvedOnly: boolean,
  ): CompletionItem[] {
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

    if (
      !lookup.recovery.tokenContextReliable &&
      lookup.token?.category === 'plain-text' &&
      !canCompleteFromRecoveredPlainTextContext(context)
    ) {
      return [];
    }

    if (!lookup.recovery.structureReliable && context.type === 'close-tag') {
      return [];
    }

    if (
      shouldSuppressPureModeFeatures(lookup) &&
      context.type !== 'argument-indices' &&
      context.type !== 'function-names' &&
      context.type !== 'slot-aliases'
    ) {
      return [];
    }

    const workspaceFreshness = this.getWorkspaceFreshness(request);
    const completions = this.buildCompletions(context, lookup, workspaceFreshness, unresolvedOnly);
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
        newText: normalizeCompletionTextEditNewText(item, context),
      },
    }));
  }

  /**
   * provideUnresolved 함수.
   * lightweight unresolved completion item 목록을 반환함.
   * detail, documentation, explanation detail, workspace snapshot 같은 heavy field는 생략되며
   * resolve 호출로 복원됨.
   *
   * @param params - LSP completion request
   * @param cancellationToken - optional cancellation token
   * @returns unresolved completion item 목록
   */
  provideUnresolved(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): UnresolvedCompletionItem[] {
    const resolved = this.provideInternal(params, cancellationToken, true);
    return resolved.map((item) =>
      stripCompletionItemToUnresolved(item, params.textDocument.uri, params.position),
    );
  }

  /**
   * resolve 함수.
   * unresolved completion item의 deferred field를 복원해 fully resolved item을 반환함.
   * label + kind + category + sortText + insertText + request context(uri/position)를
   * 복합 키로 사용해 모호한 matching을 방지함.
   *
   * @param item - unresolved completion item
   * @param params - LSP completion request (동일 문서 위치)
   * @param cancellationToken - optional cancellation token
   * @returns resolved completion item
   */
  resolve(
    item: UnresolvedCompletionItem,
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): CompletionItem | null {
    if (
      item.data.cbs.uri !== params.textDocument.uri ||
      item.data.cbs.position.line !== params.position.line ||
      item.data.cbs.position.character !== params.position.character
    ) {
      return null;
    }

    const resolvedList = this.provide(params, cancellationToken);
    const match = resolvedList.find(
      (resolved) =>
        resolved.label === item.label &&
        resolved.kind === item.kind &&
        (resolved.data as AgentMetadataEnvelope | undefined)?.cbs?.category?.category ===
          item.data.cbs.category.category &&
        resolved.sortText === item.sortText &&
        resolved.insertText === item.insertText,
    );
    return match ?? null;
  }

  private buildCompletions(
    context: CompletionTriggerContext,
    lookup: FragmentCursorLookupResult,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
    unresolvedOnly: boolean,
  ): CompletionItem[] {
    switch (context.type) {
      case 'all-functions':
        return this.buildAllFunctionCompletions(context.prefix, unresolvedOnly);
      case 'block-functions':
        return this.buildBlockFunctionCompletions(context.prefix, unresolvedOnly);
      case 'else-keyword':
        return this.buildElseCompletion();
      case 'close-tag':
        return this.buildCloseTagCompletion(context.blockKind);
      case 'variable-names':
        return this.buildVariableCompletions(context.prefix, context.kind, lookup, workspaceFreshness);
      case 'metadata-keys':
        return this.buildMetadataCompletions(context.prefix);
      case 'function-names':
        return this.buildFunctionCompletions(context.prefix, lookup);
      case 'argument-indices':
        return this.buildArgumentIndexCompletions(context.prefix, lookup);
      case 'slot-aliases':
        return this.buildSlotAliasCompletions(context.prefix, lookup);
      case 'when-operators':
        return this.buildWhenOperatorCompletions(context.prefix);
      case 'calc-expression':
        return this.buildCalcExpressionCompletions(
          context.prefix,
          context.referenceKind,
          lookup,
          workspaceFreshness,
        );
      default:
        return [];
    }
  }

  private buildCalcExpressionCompletions(
    prefix: string,
    referenceKind: 'chat' | 'global' | null,
    lookup: FragmentCursorLookupResult,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  ): CompletionItem[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variables = symbolTable.getAllVariables();
    const normalizedPrefix = prefix.toLowerCase();

    const localVariableCompletions = variables
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
          data: this.createCategoryData(
            {
              category: 'variable',
              kind: variable.kind === 'global' ? 'global-variable' : 'chat-variable',
            },
            this.createScopeExplanation(
              'calc-expression-symbol-table',
              variable.kind === 'global'
                ? 'Calc completion resolved this candidate from the analyzed global variable symbol table.'
                : 'Calc completion resolved this candidate from the analyzed chat variable symbol table.',
            ),
            variable.kind === 'global'
              ? undefined
              : this.getStaleWorkspaceAvailability(workspaceFreshness, 'completion'),
            variable.kind === 'global' ? undefined : (workspaceFreshness ?? undefined),
          ),
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

    const workspaceVariableCompletions =
      referenceKind === 'global'
        ? []
          : this.buildWorkspaceChatVariableCompletions({
              existingLabels: new Set(localVariableCompletions.map((completion) => completion.label)),
              insertBareName: referenceKind === 'chat',
              labelPrefix: '$',
              prefix,
              usage: 'calc-expression',
            }, workspaceFreshness);

    if (referenceKind) {
      return [...localVariableCompletions, ...workspaceVariableCompletions];
    }

    const operatorCompletions = CALC_OPERATORS.filter((operator) =>
      operator.label.toLowerCase().startsWith(normalizedPrefix),
    ).map(
      (operator) =>
        ({
          label: operator.label,
          kind: operator.label === 'null' ? CompletionItemKind.Constant : CompletionItemKind.Operator,
          data: this.createCategoryData({
            category: 'expression-operator',
            kind: 'calc-operator',
          }, this.createContextualExplanation(
            'calc-expression-operator-context',
            'Calc completion inferred an operator slot from the shared CBS expression sublanguage context.',
          )),
          detail: operator.detail,
          documentation: {
            kind: 'markdown',
            value: operator.documentation,
          },
          insertText: operator.label,
        }) satisfies CompletionItem,
    );

    return [...localVariableCompletions, ...workspaceVariableCompletions, ...operatorCompletions];
  }

  private buildAllFunctionCompletions(prefix: string, unresolvedOnly: boolean): CompletionItem[] {
    const allFunctions = this.registry.getAll();
    const filtered = this.filterByPrefix(allFunctions, prefix);

    return filtered.map((fn) => this.buildBuiltinCompletionItem(fn, unresolvedOnly));
  }

  private buildBlockFunctionCompletions(prefix: string, unresolvedOnly: boolean): CompletionItem[] {
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

    const completions: CompletionItem[] = filtered.map((fn) =>
      this.buildBuiltinCompletionItem(fn, unresolvedOnly),
    );

    // Add block snippets
    for (const snippet of BLOCK_SNIPPETS) {
      if (snippet.label.toLowerCase().startsWith(lowerSearchPrefix)) {
        const item: CompletionItem = {
          label: snippet.label,
          kind: CompletionItemKind.Snippet,
          data: this.createCategoryData(
            {
              category: 'snippet',
              kind: 'block-snippet',
            },
            unresolvedOnly
              ? undefined
              : this.createContextualExplanation(
                  'block-snippet-library',
                  'Block completion appended an editor snippet from the static CBS block snippet set.',
                ),
          ),
          insertText: snippet.insertText,
          insertTextFormat: InsertTextFormat.Snippet,
        };

        completions.push(
          unresolvedOnly
            ? item
            : {
                ...item,
                detail: snippet.detail,
                documentation: {
                  kind: 'markdown',
                  value: snippet.documentation,
                },
              },
        );
      }
    }

    return completions;
  }

  private buildBuiltinCompletionItem(
    fn: CBSBuiltinFunction,
    unresolvedOnly: boolean,
  ): CompletionItem {
    const item: CompletionItem = {
      label: fn.name,
      kind: fn.isBlock ? CompletionItemKind.Class : CompletionItemKind.Function,
      data: this.createCategoryData(
        this.getBuiltinCategory(fn),
        unresolvedOnly ? undefined : this.getBuiltinExplanation(fn),
      ),
      insertText: fn.name,
      deprecated: fn.deprecated !== undefined,
    };

    if (unresolvedOnly) {
      return item;
    }

    return {
      ...item,
      detail: this.formatFunctionDetail(fn),
      documentation: {
        kind: 'markdown',
        value: this.formatFunctionDocumentation(fn),
      },
    };
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
        data: this.createCategoryData({
          category: 'block-keyword',
          kind: 'else-keyword',
        }, this.createContextualExplanation(
          'else-keyword-context',
          'Completion inferred a live :else branch position from the current CBS block structure.',
        )),
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
          data: this.createCategoryData({
            category: 'block-keyword',
            kind: 'block-close',
          }, this.createContextualExplanation(
            'block-close-context',
            'Completion inferred a block close candidate from the open block context at the cursor.',
          )),
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
        data: this.createCategoryData({
          category: 'block-keyword',
          kind: 'block-close',
        }, this.createContextualExplanation(
          'block-close-context',
          'Completion inferred the matching block close tag from the active open block kind.',
        )),
        detail: `Close ${normalizedKind} block`,
        insertText: `/${normalizedKind}`,
        preselect: true,
      },
    ];
  }

  private buildVariableCompletions(
    prefix: string,
    kind: 'chat' | 'temp' | 'global',
    lookup: FragmentCursorLookupResult,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  ): CompletionItem[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variables = symbolTable.getAllVariables();

    const matchingVars = variables.filter(
      (v) =>
        v.kind === kind &&
        v.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    const localCompletions = matchingVars.map(
      (v) =>
        ({
          label: v.name,
          kind: CompletionItemKind.Variable,
          data: this.createCategoryData(
            {
              category: 'variable',
              kind:
                v.kind === 'global'
                  ? 'global-variable'
                  : v.kind === 'temp'
                    ? 'temp-variable'
                    : v.kind === 'loop'
                      ? 'chat-variable'
                      : 'chat-variable',
            },
            this.createScopeExplanation(
              kind === 'temp'
                ? 'temp-variable-symbol-table'
                : kind === 'global'
                  ? 'global-variable-symbol-table'
                  : 'chat-variable-symbol-table',
              kind === 'temp'
                ? 'Completion resolved this candidate from analyzed temp-variable definitions in the current fragment.'
                : kind === 'global'
                  ? 'Completion resolved this candidate from analyzed global-variable references in the current fragment.'
                  : 'Completion resolved this candidate from analyzed chat-variable definitions in the current fragment.',
            ),
            kind === 'chat'
              ? this.getStaleWorkspaceAvailability(workspaceFreshness, 'completion')
              : undefined,
            kind === 'chat' ? (workspaceFreshness ?? undefined) : undefined,
          ),
          detail: kind === 'chat' ? 'Chat variable' : kind === 'temp' ? 'Temp variable' : 'Global variable',
          documentation: {
            kind: 'markdown',
            value: `Variable **${v.name}** (${v.kind})\n\n- Definitions: ${v.definitionRanges.length}\n- References: ${v.references.length}`,
          },
          insertText: v.name,
        }) satisfies CompletionItem,
    );

    if (kind !== 'chat') {
      return localCompletions;
    }

    const workspaceCompletions = this.buildWorkspaceChatVariableCompletions({
      existingLabels: new Set(localCompletions.map((completion) => completion.label)),
      insertBareName: true,
      labelPrefix: '',
      prefix,
      usage: 'macro-argument',
    }, workspaceFreshness);

    return [...localCompletions, ...workspaceCompletions];
  }

  /**
   * buildWorkspaceChatVariableCompletions 함수.
   * 현재 fragment-local 후보 뒤에 붙일 workspace persistent chat variable completion item을 생성함.
   *
   * @param options - prefix, insertion mode, local dedupe 정보
   * @returns workspace chat variable completion item 배열
   */
  private buildWorkspaceChatVariableCompletions(options: {
    existingLabels: ReadonlySet<string>;
    insertBareName: boolean;
    labelPrefix: '' | '$';
    prefix: string;
    usage: 'macro-argument' | 'calc-expression';
  }, workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null): CompletionItem[] {
    if (!this.variableFlowService || workspaceFreshness?.freshness === 'stale') {
      return [];
    }

    const normalizedPrefix = options.prefix.toLowerCase();

    return this.variableFlowService.getAllVariableNames().flatMap((variableName) => {
      if (!variableName.toLowerCase().startsWith(normalizedPrefix)) {
        return [];
      }

      if (options.existingLabels.has(`${options.labelPrefix}${variableName}`)) {
        return [];
      }

      const query = this.variableFlowService?.queryVariable(variableName);
      const defaultDefinitions = this.variableFlowService?.getDefaultVariableDefinitions(variableName) ?? [];
      if ((!query || query.writers.length === 0) && defaultDefinitions.length === 0) {
        return [];
      }

      const readerCount = query?.readers.length ?? 0;
      const writerCount = (query?.writers.length ?? 0) + defaultDefinitions.length;
        const label = `${options.labelPrefix}${variableName}`;
        const detail =
          options.usage === 'calc-expression'
            ? 'Workspace chat variable for calc expression'
            : 'Workspace chat variable';
        const documentation =
          options.usage === 'calc-expression'
            ? [
                `**Workspace chat variable:** \`${variableName}\``,
                '',
                '- Source: workspace persistent chat-variable graph',
                '- Usage: append after fragment-local `$var` candidates inside the shared CBS expression sublanguage.',
                `- Workspace readers: ${readerCount}`,
                `- Workspace writers: ${writerCount}`,
              ].join('\n')
            : [
                `**Workspace chat variable:** \`${variableName}\``,
                '',
                '- Source: workspace persistent chat-variable graph',
                '- Usage: append after fragment-local `getvar` / `setvar` candidates so local symbols stay first.',
                `- Workspace readers: ${readerCount}`,
                `- Workspace writers: ${writerCount}`,
              ].join('\n');

        return {
          label,
          kind: CompletionItemKind.Variable,
          data: this.createCategoryData(
            {
              category: 'variable',
              kind: 'chat-variable',
            },
            this.createScopeExplanation(
              options.usage === 'calc-expression'
                ? 'workspace-chat-variable-graph:calc-expression'
                : 'workspace-chat-variable-graph:macro-argument',
              options.usage === 'calc-expression'
                ? 'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local `$var` symbols.'
                : 'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local chat-variable symbols.',
            ),
            undefined,
            workspaceFreshness ?? undefined,
          ),
          detail,
          documentation: {
            kind: 'markdown',
            value: documentation,
          },
          insertText: options.insertBareName ? variableName : label,
          sortText: `zzzz-workspace-${variableName}`,
        } satisfies CompletionItem;
      });
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
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'local-function',
      }, this.createContextualExplanation(
        'local-function-context',
        'Completion inferred a local #func target from the first call:: slot context.',
      )),
      detail: 'Local #func declaration for the first call:: slot',
      documentation: {
        kind: 'markdown',
        value: [
          `**Local function: ${symbol.name}**`,
          '',
          '- Meaning: insert this into the first `call::` slot to choose which fragment-local `#func` declaration to invoke.',
          symbol.parameters.length > 0
            ? `Parameters: ${symbol.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
            : 'Parameters: declared later or inferred at runtime',
          symbol.parameters.length > 0
            ? `Argument slots: ${symbol.parameters
                .map((parameter, index) => `\`arg::${index}\` → \`${parameter}\``)
                .join(', ')}`
            : 'Argument slots: no local parameter names are declared yet.',
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

    const normalizedPrefix = prefix.trim();

    return declaration.parameters
      .map((parameter, index) => ({ parameter, index }))
      .filter(({ index }) => index.toString().startsWith(normalizedPrefix))
      .map(({ parameter, index }) => {
        const parameterDeclaration = declaration.parameterDeclarations[index];

        return {
        label: index.toString(),
        kind: CompletionItemKind.Constant,
        data: this.createCategoryData({
          category: 'contextual-token',
          kind: 'argument-index',
        }, this.createContextualExplanation(
          'active-local-function-context',
          'Completion inferred numbered arg:: slots from the active local #func / call:: context.',
        )),
        detail: `Numbered argument reference for \`${parameter}\` in the active local #func / {{call::...}} context`,
        documentation: {
          kind: 'markdown',
          value: [
            `**Numbered argument reference: arg::${index}**`,
            '',
            `- Local function: \`${declaration.name}\``,
            `- Parameter slot: ${index}`,
            `- Parameter name: \`${parameter}\``,
            parameterDeclaration
              ? `- Parameter definition: line ${parameterDeclaration.range.start.line + 1}, character ${parameterDeclaration.range.start.character + 1}`
              : '- Parameter definition: declared in the active local function header',
            `- Meaning: references the ${CbsLspTextHelper.formatOrdinal(index + 1)} call argument from the active local \`#func\` / \`{{call::...}}\` context.`,
          ].join('\n'),
        },
        insertText: index.toString(),
      } satisfies CompletionItem;
      });
  }

  private buildSlotAliasCompletions(
    prefix: string,
    lookup: FragmentCursorLookupResult,
  ): CompletionItem[] {
    const visibleBindings = collectVisibleLoopBindingsFromNodePath(
      lookup.nodePath,
      lookup.fragment.content,
      lookup.fragmentLocalOffset,
    );
    const normalizedPrefix = prefix.trim().toLowerCase();

    return visibleBindings
      .filter((binding) => binding.bindingName.toLowerCase().startsWith(normalizedPrefix))
      .map((binding, index) => ({
        label: binding.bindingName,
        kind: CompletionItemKind.Variable,
        data: this.createCategoryData({
          category: 'contextual-token',
          kind: 'loop-alias',
        }, this.createScopeExplanation(
          'visible-loop-bindings',
          'Completion resolved a visible #each loop alias from scope analysis rather than general variables.',
        )),
        detail: index === 0 ? 'Current #each loop alias' : 'Outer #each loop alias',
        documentation: {
          kind: 'markdown',
          value: [
            `**Loop alias: ${binding.bindingName}**`,
            '',
            `- Source: \`#each ${binding.iteratorExpression} as ${binding.bindingName}\``,
            index === 0
              ? '- Scope: current `#each` block'
              : '- Scope: outer `#each` block still visible from the current cursor',
            '- Policy: `slot::` completion only offers loop aliases, never general variables.',
          ].join('\n'),
        },
        insertText: binding.bindingName,
        preselect: index === 0,
        sortText: `${index.toString().padStart(2, '0')}-${binding.bindingName}`,
      }));
  }

  private buildMetadataCompletions(prefix: string): CompletionItem[] {
    const filtered = METADATA_KEYS.filter((k) =>
      k.name.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    return filtered.map((k) => ({
      label: k.name,
      kind: CompletionItemKind.Property,
      data: this.createCategoryData({
        category: 'metadata-key',
        kind: 'metadata-property',
      }, this.createContextualExplanation(
        'metadata-key-catalog',
        'Completion matched a key from the static CBS metadata property catalog.',
      )),
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
      data: this.createCategoryData({
        category: 'contextual-token',
        kind: 'when-operator',
      }, this.createContextualExplanation(
        'when-operator-context',
        'Completion inferred a #when operator position from the current block-header operator slot.',
      )),
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

  private formatFunctionDetail(fn: CBSBuiltinFunction): string {
    if (isContextualBuiltin(fn)) {
      return fn.isBlock ? 'Contextual block syntax' : 'Contextual syntax entry';
    }

    if (isDocOnlyBuiltin(fn)) {
      return fn.isBlock ? 'Documentation-only block syntax' : 'Documentation-only syntax entry';
    }

    return fn.isBlock ? 'Callable block builtin' : 'Callable builtin function';
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

    if (isContextualBuiltin(fn)) {
      lines.push(
        '**Contextual syntax entry:** visible in editor docs and completion, but only meaningful in specific syntactic contexts.',
      );
    } else if (isDocOnlyBuiltin(fn)) {
      lines.push(
        '**Documentation-only syntax entry:** visible in editor docs and completion, but not a general runtime callback builtin.',
      );
    } else {
      lines.push('**Callable builtin:** available as a runtime CBS builtin.');
    }
    lines.push('');

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

  /**
   * createCategoryData 함수.
   * completion item data 필드에 붙일 공통 category envelope를 생성함.
   *
   * @param category - completion 항목을 machine-readable하게 분류할 stable category 값
   * @returns completion item `data`에 그대로 넣을 envelope
   */
  private createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: AgentMetadataAvailabilityContract,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ) {
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

  /**
   * getBuiltinCategory 함수.
   * registry builtin을 block keyword vs callable builtin 기준의 stable category로 변환함.
   *
   * @param fn - completion/hover에 노출할 registry builtin 항목
   * @returns agent-friendly category contract
   */
  private getBuiltinCategory(fn: CBSBuiltinFunction): AgentMetadataCategoryContract {
    return {
      category: fn.isBlock ? 'block-keyword' : 'builtin',
      kind: isContextualBuiltin(fn)
        ? 'contextual-builtin'
        : isDocOnlyBuiltin(fn)
          ? 'documentation-only-builtin'
          : 'callable-builtin',
    };
  }

  private getBuiltinExplanation(fn: CBSBuiltinFunction): AgentMetadataExplanationContract {
    let detail: string;
    if (isContextualBuiltin(fn)) {
      detail = 'Completion surfaced this item from the builtin registry as a contextual CBS syntax entry.';
    } else if (isDocOnlyBuiltin(fn)) {
      detail = 'Completion surfaced this item from the builtin registry as a documentation-only CBS syntax entry.';
    } else {
      detail = 'Completion surfaced this item from the builtin registry as a callable CBS builtin.';
    }

    return createAgentMetadataExplanation('registry-lookup', 'builtin-registry', detail);
  }
}
