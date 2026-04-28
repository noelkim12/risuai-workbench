import {
  type CancellationToken,
  CompletionItem,
  type CompletionItemKind,
  InsertTextFormat,
  type InsertReplaceEdit,
  type MarkupContent,
  TextDocumentPositionParams,
  Range as LSPRange,
  type TextEdit,
} from 'vscode-languageserver/node';
import {
  type CBSBuiltinRegistry,
  type CBSBuiltinFunction,
} from 'risu-workbench-core';

import {
  createAgentMetadataEnvelope,
  createAgentMetadataExplanation,
  fragmentAnalysisService,
  detectCompletionTriggerContext,
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
} from '../../core';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../services';
import { isRequestCancelled } from '../../utils/request-cancellation';
import {
  createCompletionTextEditPlan,
} from './completion-text-edit';
import {
  provideCheapRootCompletions,
} from './cheap-root-completion';
import { provideCheapMacroArgumentCompletions } from './cheap-macro-argument-completion';
import {
  buildAllFunctionCompletions,
  buildBlockFunctionCompletions,
  buildCloseTagCompletion,
  buildElseCompletion,
  formatFunctionDocumentation,
} from './builtin-completion';
import {
  buildArgumentIndexCompletions,
  buildCalcExpressionCompletions,
  buildFunctionCompletions,
  buildMetadataCompletions,
  buildSlotAliasCompletions,
  buildVariableCompletions,
  buildWhenOperatorCompletions,
  buildWhenSegmentCompletions,
  isToggleNameWhenSegment,
} from './completion-candidates';
import {
  resolveCompletionItem,
  stripCompletionItemToUnresolved,
  type CompletionItemDataEnvelope,
  type UnresolvedCompletionItem,
} from './completion-resolve';
import {
  getWorkspaceFreshness,
} from './workspace-variable-completion';

export type {
  CompletionItemDataEnvelope,
  CompletionResolveKey,
  UnresolvedCompletionItem,
  UnresolvedCompletionItemData,
} from './completion-resolve';

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
 * CBS_COMPLETION_TRIGGER_CHARACTERS 상수.
 * CBS/Lua 입력 흐름에서 자동 completion을 재요청해야 하는 핵심 trigger 문자 집합.
 */
export const CBS_COMPLETION_TRIGGER_CHARACTERS = ['{', ':', '#', '/', '?', '<', '"'] as const;

function canCompleteFromRecoveredPlainTextContext(context: CompletionTriggerContext): boolean {
  return context.type !== 'none' && context.type !== 'close-tag';
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
  filterText: string | null;
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
    return documentation
      .map((entry) => (typeof entry === 'string' ? entry : entry.value))
      .join('\n');
  }

  return (documentation as MarkupContent | undefined)?.value ?? null;
}

/**
 * getDeprecatedCompletionFlag 함수.
 * LSP의 deprecated flag를 snapshot/resolve contract 유지용으로 읽음.
 *
 * @param item - deprecated flag를 확인할 completion item
 * @returns deprecated flag 또는 미설정 상태
 */
function getDeprecatedCompletionFlag(item: CompletionItem): boolean | undefined {
  return (item as { deprecated?: boolean })['deprecated'];
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
    compareStrings(left.filterText, right.filterText) ||
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
    deprecated: getDeprecatedCompletionFlag(item) ?? false,
    detail: item.detail ?? null,
    documentation: normalizeMarkupContent(item.documentation),
    filterText: item.filterText ?? null,
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
  return [...items]
    .map(normalizeCompletionItemForSnapshot)
    .sort(compareNormalizedCompletionSnapshots);
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

  provide(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): CompletionItem[] {
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

    const fastRootCompletions = provideCheapRootCompletions(
      request,
      params.position,
      unresolvedOnly,
      this.registry,
      this.getBuiltinCompletionCallbacks(),
    );
    if (fastRootCompletions) {
      return fastRootCompletions;
    }

    const fastMacroArgumentCompletions = provideCheapMacroArgumentCompletions(
      request,
      params.position,
      this.variableFlowService,
      this.workspaceSnapshot,
      this.getCheapMacroArgumentCompletionCallbacks(),
    );
    if (fastMacroArgumentCompletions) {
      return fastMacroArgumentCompletions;
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

    const workspaceFreshness = getWorkspaceFreshness(
      this.variableFlowService,
      this.workspaceSnapshot,
      request,
    );
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

    return completions.map((item) => {
      const textEditPlan = createCompletionTextEditPlan(item, context, lookup.fragment.content);
      const itemRange =
        textEditPlan.startOffset === context.startOffset &&
        textEditPlan.endOffset === context.endOffset
          ? range
          : lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
              request.text,
              textEditPlan.startOffset,
              textEditPlan.endOffset,
            );

      if (!itemRange) {
        return item;
      }

      const lspRange = LSPRange.create(
        itemRange.start.line,
        itemRange.start.character,
        itemRange.end.line,
        itemRange.end.character,
      );

      return {
        ...item,
        textEdit: {
          range: lspRange,
          newText: textEditPlan.newText,
        },
      };
    });
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
    void cancellationToken;
    return resolveCompletionItem(item, params, {
      registry: this.registry,
      variableFlowService: this.variableFlowService,
      workspaceSnapshot: this.workspaceSnapshot,
      createCategoryData: (category, explanation, availability, workspace) =>
        this.createCategoryData(category, explanation, availability, workspace),
      createScopeExplanation: (source, detail) => this.createScopeExplanation(source, detail),
      formatFunctionDocumentation: (fn) => this.formatFunctionDocumentation(fn),
    });
  }

  private buildCompletions(
    context: CompletionTriggerContext,
    lookup: FragmentCursorLookupResult,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
    unresolvedOnly: boolean,
  ): CompletionItem[] {
    switch (context.type) {
      case 'all-functions':
        return buildAllFunctionCompletions(
          this.registry,
          context.prefix,
          unresolvedOnly,
          this.getBuiltinCompletionCallbacks(),
        );
      case 'block-functions':
        return buildBlockFunctionCompletions(
          this.registry,
          context.prefix,
          unresolvedOnly,
          this.getBuiltinCompletionCallbacks(),
        );
      case 'else-keyword':
        return buildElseCompletion(this.registry, this.getBuiltinCompletionCallbacks());
      case 'close-tag':
        return buildCloseTagCompletion(
          this.registry,
          context.blockKind,
          this.getBuiltinCompletionCallbacks(),
        );
      case 'variable-names':
        return buildVariableCompletions(
          context.prefix,
          context.kind,
          lookup,
          this.variableFlowService,
          workspaceFreshness,
          this.getContextualCompletionCallbacks(),
        );
      case 'metadata-keys':
        return buildMetadataCompletions(context.prefix, this.getContextualCompletionCallbacks());
      case 'function-names':
        return buildFunctionCompletions(
          context.prefix,
          lookup,
          this.getContextualCompletionCallbacks(),
        );
      case 'argument-indices':
        return buildArgumentIndexCompletions(
          context.prefix,
          lookup,
          this.getContextualCompletionCallbacks(),
        );
      case 'slot-aliases':
        return buildSlotAliasCompletions(
          context.prefix,
          lookup,
          this.getContextualCompletionCallbacks(),
        );
      case 'when-operators':
        return buildWhenSegmentCompletions(
          context.prefix,
          context.startOffset,
          lookup,
          this.variableFlowService,
          workspaceFreshness,
          this.getContextualCompletionCallbacks(),
        );
      case 'calc-expression':
        return buildCalcExpressionCompletions(
          context.prefix,
          context.referenceKind,
          lookup,
          this.variableFlowService,
          workspaceFreshness,
          this.getContextualCompletionCallbacks(),
        );
      default:
        return [];
    }
  }

  /**
   * getCheapMacroArgumentCompletionCallbacks 함수.
   * cheap macro argument 모듈이 provider-local static catalog와 metadata builder를 쓰도록 연결함.
   *
   * @returns cheap macro argument completion callback 묶음
   */
  private getCheapMacroArgumentCompletionCallbacks() {
    return {
      buildMetadataCompletions: (prefix: string) =>
        buildMetadataCompletions(prefix, this.getContextualCompletionCallbacks()),
      buildWhenOperatorCompletions: (prefix: string) =>
        buildWhenOperatorCompletions(prefix, this.getContextualCompletionCallbacks()),
      isToggleNameWhenSegment,
      workspaceVariableCallbacks: this.getWorkspaceVariableCompletionCallbacks(),
    };
  }

  private getContextualCompletionCallbacks() {
    return {
      createCategoryData: (
        category: AgentMetadataCategoryContract,
        explanation?: AgentMetadataExplanationContract,
        availability?: AgentMetadataAvailabilityContract,
        workspace?: AgentMetadataWorkspaceSnapshotContract,
      ) => this.createCategoryData(category, explanation, availability, workspace),
      createContextualExplanation: (source: string, detail: string) =>
        this.createContextualExplanation(source, detail),
      createScopeExplanation: (source: string, detail: string) =>
        this.createScopeExplanation(source, detail),
      workspaceVariableCallbacks: this.getWorkspaceVariableCompletionCallbacks(),
    };
  }

  private getBuiltinCompletionCallbacks() {
    return {
      createCategoryData: (
        category: AgentMetadataCategoryContract,
        explanation?: AgentMetadataExplanationContract,
      ) => this.createCategoryData(category, explanation, undefined, undefined),
      createContextualExplanation: (source: string, detail: string) =>
        this.createContextualExplanation(source, detail),
    };
  }

  private getWorkspaceVariableCompletionCallbacks() {
    return {
      createCategoryData: (
        category: AgentMetadataCategoryContract,
        explanation?: AgentMetadataExplanationContract,
        availability?: AgentMetadataAvailabilityContract,
        workspace?: AgentMetadataWorkspaceSnapshotContract,
      ) => this.createCategoryData(category, explanation, availability, workspace),
      createContextualExplanation: (source: string, detail: string) =>
        this.createContextualExplanation(source, detail),
      createScopeExplanation: (source: string, detail: string) =>
        this.createScopeExplanation(source, detail),
    };
  }

  /**
   * formatFunctionDocumentation 함수.
   * Builtin formatter module로 위임하되 unresolved lazy-format 테스트의 spy seam을 유지함.
   *
   * @param fn - documentation을 만들 builtin function
   * @returns completion documentation markdown 문자열
   */
  formatFunctionDocumentation(fn: CBSBuiltinFunction): string {
    return formatFunctionDocumentation(fn);
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
  ): CompletionItemDataEnvelope {
    const envelope = createAgentMetadataEnvelope(category, explanation, availability, workspace);
    return {
      ...envelope,
      cbs: {
        ...envelope.cbs,
      },
    };
  }

  private createContextualExplanation(
    source: string,
    detail: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('contextual-inference', source, detail);
  }

  private createScopeExplanation(source: string, detail: string): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('scope-analysis', source, detail);
  }

}
