/**
 * Completion lazy resolve와 unresolved payload 축소 유틸 모음.
 * @file packages/cbs-lsp/src/features/completion/completion-resolve.ts
 */
import {
  CompletionItem,
  type Position,
  type TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import type { CBSBuiltinFunction, CBSBuiltinRegistry } from 'risu-workbench-core';

import {
  CBS_AGENT_PROTOCOL_SCHEMA,
  CBS_AGENT_PROTOCOL_VERSION,
  createAgentMetadataEnvelope,
  isAgentMetadataEnvelope,
  type AgentMetadataCategoryContract,
  type AgentMetadataEnvelope,
  type AgentMetadataExplanationContract,
  type AgentMetadataWorkspaceSnapshotContract,
} from '../../core';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../services';
import {
  formatFunctionDetail,
  getBuiltinExplanation,
} from './builtin-completion';
import {
  WORKSPACE_VARIABLE_SORT_PREFIX,
  formatWorkspaceVariableDocumentation,
  getWorkspaceVariableCompletionExplanation,
  getWorkspaceVariableCompletionSource,
} from './workspace-variable-completion';

export interface CompletionResolveKey {
  source: 'builtin' | 'workspace-variable' | 'local-variable' | 'snippet' | 'unknown';
  name: string;
  /** For builtins: the canonical function name for registry lookup */
  canonicalName?: string;
  /** For workspace variables: the variable name */
  variableName?: string;
}

export type CompletionItemDataEnvelope = Omit<AgentMetadataEnvelope, 'cbs'> & {
  cbs: AgentMetadataEnvelope['cbs'] & {};
};

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
export type UnresolvedCompletionItem = Omit<CompletionItem, 'detail' | 'documentation' | 'data'> & {
  detail?: CompletionItem['detail'];
  documentation?: CompletionItem['documentation'];
  data: UnresolvedCompletionItemData;
};

export interface CompletionResolveCallbacks {
  registry: CBSBuiltinRegistry;
  variableFlowService: VariableFlowService | null;
  workspaceSnapshot: WorkspaceSnapshotState | null;
  createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: undefined,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ): CompletionItemDataEnvelope;
  createScopeExplanation(source: string, detail: string): AgentMetadataExplanationContract;
  formatFunctionDocumentation(fn: CBSBuiltinFunction): string;
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
  const fallbackEnvelope = createAgentMetadataEnvelope({
    category: 'builtin',
    kind: 'callable-builtin',
  });
  const envelope: CompletionItemDataEnvelope = isAgentMetadataEnvelope(item.data)
    ? (item.data as CompletionItemDataEnvelope)
    : {
        ...fallbackEnvelope,
        cbs: {
          ...fallbackEnvelope.cbs,
        },
      };

  return {
    label: item.label,
    kind: item.kind,
    insertText: item.textEdit ? undefined : item.insertText,
    insertTextFormat: item.insertTextFormat,
    filterText: item.filterText,
    preselect: item.preselect,
    sortText: item.sortText,
    deprecated: getDeprecatedCompletionFlag(item),
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

/**
 * resolveCompletionItem 함수.
 * unresolved completion item의 deferred field를 복원해 fully resolved item을 반환함.
 *
 * @param item - unresolved completion item
 * @param params - LSP completion request (동일 문서 위치)
 * @param callbacks - provider 외부 resolve에 필요한 registry/service/callback 묶음
 * @returns resolved completion item 또는 matching 실패 시 null
 */
export function resolveCompletionItem(
  item: UnresolvedCompletionItem,
  params: TextDocumentPositionParams,
  callbacks: CompletionResolveCallbacks,
): CompletionItem | null {
  if (!matchesResolveRequest(item, params)) {
    return null;
  }

  const resolveKey = deriveCompletionResolveKey(item, callbacks.registry);
  if (!resolveKey) {
    return null;
  }

  switch (resolveKey.source) {
    case 'builtin':
      return hydrateBuiltinItem(item, resolveKey, callbacks);
    case 'workspace-variable':
      return hydrateWorkspaceVariableItem(item, params, resolveKey, callbacks);
    case 'local-variable':
      return hydrateLocalVariableItem(item, resolveKey, callbacks);
    default:
      return null;
  }
}

/**
 * deriveCompletionResolveKey 함수.
 * unresolved payload를 키우지 않도록 기존 category/label/sortText에서 hydrate 경로를 파생함.
 *
 * @param item - resolve 요청으로 받은 unresolved completion item
 * @param registry - builtin label 검증에 사용할 registry
 * @returns hydrate 가능한 resolve key 또는 없으면 null
 */
export function deriveCompletionResolveKey(
  item: UnresolvedCompletionItem,
  registry: CBSBuiltinRegistry,
): CompletionResolveKey | null {
  const category = item.data.cbs.category;
  if (
    (category.category === 'builtin' ||
      (category.category === 'block-keyword' &&
        (category.kind === 'callable-builtin' ||
          category.kind === 'documentation-only-builtin' ||
          category.kind === 'contextual-builtin'))) &&
    registry.get(item.label)
  ) {
    return {
      source: 'builtin',
      name: item.label,
      canonicalName: item.label,
    };
  }

  if (category.category !== 'variable') {
    return null;
  }

  if (item.sortText?.startsWith(WORKSPACE_VARIABLE_SORT_PREFIX)) {
    const variableName = item.sortText.slice(WORKSPACE_VARIABLE_SORT_PREFIX.length);
    return {
      source: 'workspace-variable',
      name: variableName,
      variableName,
    };
  }

  if (
    category.kind === 'chat-variable' ||
    category.kind === 'temp-variable' ||
    category.kind === 'global-variable'
  ) {
    return {
      source: 'local-variable',
      name: item.label.replace(/^[$@]/, ''),
    };
  }

  return null;
}

function matchesResolveRequest(
  item: UnresolvedCompletionItem,
  params: TextDocumentPositionParams,
): boolean {
  return (
    item.data.cbs.uri === params.textDocument.uri &&
    item.data.cbs.position.line === params.position.line &&
    item.data.cbs.position.character === params.position.character
  );
}

function hydrateBuiltinItem(
  item: UnresolvedCompletionItem,
  resolveKey: CompletionResolveKey,
  callbacks: CompletionResolveCallbacks,
): CompletionItem | null {
  const fn = callbacks.registry.get(resolveKey.canonicalName ?? resolveKey.name);
  if (!fn) {
    return null;
  }

  return {
    ...item,
    detail: formatFunctionDetail(fn),
    documentation: {
      kind: 'markdown',
      value: callbacks.formatFunctionDocumentation(fn),
    },
    data: callbacks.createCategoryData(
      item.data.cbs.category,
      getBuiltinExplanation(fn),
      undefined,
      undefined,
    ),
  };
}

function hydrateLocalVariableItem(
  item: UnresolvedCompletionItem,
  resolveKey: CompletionResolveKey,
  callbacks: CompletionResolveCallbacks,
): CompletionItem {
  const variableName = resolveKey.name;
  const categoryKind = item.data.cbs.category.kind;
  const isCalcExpression = item.label.startsWith('$') || item.label.startsWith('@');
  const isGlobal = categoryKind === 'global-variable' || item.label.startsWith('@');
  const isTemp = categoryKind === 'temp-variable';

  if (isCalcExpression) {
    return {
      ...item,
      detail: isGlobal ? 'Calc expression global variable' : 'Calc expression chat variable',
      documentation: {
        kind: 'markdown',
        value: isGlobal
          ? `Reads global variable **${variableName}** inside a calc expression. Non-numeric values evaluate as \`0\`.`
          : `Reads chat variable **${variableName}** inside a calc expression. Non-numeric values evaluate as \`0\`.`,
      },
      data: callbacks.createCategoryData(
        item.data.cbs.category,
        callbacks.createScopeExplanation(
          'calc-expression-symbol-table',
          isGlobal
            ? 'Calc completion resolved this candidate from the analyzed global variable symbol table.'
            : 'Calc completion resolved this candidate from the analyzed chat variable symbol table.',
        ),
      ),
    };
  }

  return {
    ...item,
    detail: isTemp ? 'Temp variable' : isGlobal ? 'Global variable' : 'Chat variable',
    documentation: {
      kind: 'markdown',
      value: `Variable **${variableName}** (${isTemp ? 'temp' : isGlobal ? 'global' : 'chat'})`,
    },
    data: callbacks.createCategoryData(
      item.data.cbs.category,
      callbacks.createScopeExplanation(
        isTemp
          ? 'temp-variable-symbol-table'
          : isGlobal
            ? 'global-variable-symbol-table'
            : 'chat-variable-symbol-table',
        isTemp
          ? 'Completion resolved this candidate from analyzed temp-variable definitions in the current fragment.'
          : isGlobal
            ? 'Completion resolved this candidate from analyzed global-variable references in the current fragment.'
            : 'Completion resolved this candidate from analyzed chat-variable definitions in the current fragment.',
      ),
    ),
  };
}

function hydrateWorkspaceVariableItem(
  item: UnresolvedCompletionItem,
  params: TextDocumentPositionParams,
  resolveKey: CompletionResolveKey,
  callbacks: CompletionResolveCallbacks,
): CompletionItem | null {
  if (!callbacks.variableFlowService) {
    return null;
  }

  const variableName = resolveKey.variableName ?? resolveKey.name;
  const query = callbacks.variableFlowService.queryVariable(variableName);
  const defaultDefinitions = callbacks.variableFlowService.getDefaultVariableDefinitions(variableName);
  if ((!query || query.writers.length === 0) && defaultDefinitions.length === 0) {
    return null;
  }

  const readerCount = query?.readers.length ?? 0;
  const isCalcExpression = item.label.startsWith('$');
  const detail = isCalcExpression
    ? 'Workspace chat variable for calc expression'
    : 'Workspace chat variable';
  const usage = isCalcExpression ? 'calc-expression' : 'macro-argument';
  const documentation = formatWorkspaceVariableDocumentation(
    {
      name: variableName,
      readerCount,
      writerCount: query?.writers.length ?? 0,
      defaultDefinitionCount: defaultDefinitions.length,
      hasWritableSource: true,
    },
    usage,
  );

  return {
    ...item,
    detail,
    documentation: {
      kind: 'markdown',
      value: documentation,
    },
    data: callbacks.createCategoryData(
      item.data.cbs.category,
      callbacks.createScopeExplanation(
        getWorkspaceVariableCompletionSource(usage),
        getWorkspaceVariableCompletionExplanation(usage),
      ),
      undefined,
      getResolveWorkspaceSnapshot(params, callbacks),
    ),
  };
}

function getResolveWorkspaceSnapshot(
  params: TextDocumentPositionParams,
  callbacks: CompletionResolveCallbacks,
): AgentMetadataWorkspaceSnapshotContract | undefined {
  const snapshot = callbacks.variableFlowService?.getWorkspaceSnapshot() ?? callbacks.workspaceSnapshot;
  if (!snapshot) {
    return undefined;
  }

  const trackedDocumentVersion = snapshot.documentVersions.get(params.textDocument.uri) ?? null;
  const requestVersion = trackedDocumentVersion ?? 'resolve';
  return {
    schema: CBS_AGENT_PROTOCOL_SCHEMA,
    schemaVersion: CBS_AGENT_PROTOCOL_VERSION,
    rootPath: snapshot.rootPath,
    snapshotVersion: snapshot.snapshotVersion,
    requestVersion,
    trackedDocumentVersion,
    freshness: 'fresh',
    detail:
      trackedDocumentVersion === null
        ? `Workspace snapshot v${snapshot.snapshotVersion} has no open-document override for this URI, so resolve uses the installed snapshot as-is.`
        : `Workspace snapshot v${snapshot.snapshotVersion} tracks document version ${trackedDocumentVersion}, so resolve uses the current workspace variable graph snapshot.`,
  };
}

function getDeprecatedCompletionFlag(item: CompletionItem): boolean | undefined {
  return (item as { deprecated?: boolean })['deprecated'];
}
