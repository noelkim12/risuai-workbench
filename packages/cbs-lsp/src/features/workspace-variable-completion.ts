/**
 * Workspace variable 기반 completion 후보 생성 유틸 모음.
 * @file packages/cbs-lsp/src/features/workspace-variable-completion.ts
 */
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';

import {
  createStaleWorkspaceAvailability,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataCategoryContract,
  type AgentMetadataEnvelope,
  type AgentMetadataExplanationContract,
  type AgentMetadataWorkspaceSnapshotContract,
  type FragmentAnalysisRequest,
} from '../core';
import type {
  ToggleCompletionSummary,
  VariableCompletionSummary,
  VariableFlowService,
  WorkspaceSnapshotState,
} from '../services';

export const WORKSPACE_VARIABLE_SORT_PREFIX = 'zzzz-workspace-';

export type WorkspaceVariableCompletionUsage =
  | 'macro-argument'
  | 'calc-expression'
  | 'nested-chat-value';

export type WorkspaceVariableCompletionItemDataEnvelope = Omit<AgentMetadataEnvelope, 'cbs'> & {
  cbs: AgentMetadataEnvelope['cbs'] & {};
};

export interface WorkspaceVariableCompletionBuilderCallbacks {
  createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: AgentMetadataAvailabilityContract,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ): WorkspaceVariableCompletionItemDataEnvelope;
  createContextualExplanation(source: string, detail: string): AgentMetadataExplanationContract;
  createScopeExplanation(source: string, detail: string): AgentMetadataExplanationContract;
}

export interface WorkspaceChatVariableCompletionOptions {
  existingLabels: ReadonlySet<string>;
  insertBareName: boolean;
  labelPrefix: '' | '$';
  prefix: string;
  usage: WorkspaceVariableCompletionUsage;
}

/**
 * buildWorkspaceToggleGlobalVariableCompletions 함수.
 * risutoggle key에서 파생되는 `toggle_<name>` globalvar completion 후보를 생성함.
 *
 * @param summaries - workspace toggle completion summary 목록
 * @param prefix - 현재 globalvar 인자 prefix
 * @param existingLabels - fragment-local global 후보와 중복 방지용 label 집합
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns risutoggle 기반 globalvar completion item 목록
 */
export function buildWorkspaceToggleGlobalVariableCompletions(
  summaries: readonly ToggleCompletionSummary[],
  prefix: string,
  existingLabels: ReadonlySet<string>,
  callbacks: WorkspaceVariableCompletionBuilderCallbacks,
): CompletionItem[] {
  const normalizedPrefix = prefix.toLowerCase();

  return summaries.flatMap((summary) => {
    if (!summary.globalVariableName.toLowerCase().startsWith(normalizedPrefix)) {
      return [];
    }

    if (existingLabels.has(summary.globalVariableName)) {
      return [];
    }

    return {
      label: summary.globalVariableName,
      kind: CompletionItemKind.Variable,
      data: callbacks.createCategoryData(
        {
          category: 'variable',
          kind: 'global-variable',
        },
        callbacks.createScopeExplanation(
          'risutoggle-globalvar-index',
          'Completion resolved this candidate from `.risutoggle` keys exposed as `toggle_<name>` global variables.',
        ),
      ),
      detail: 'Risutoggle global variable',
      documentation: {
        kind: 'markdown',
        value: [
          `**Risutoggle global variable:** \`${summary.globalVariableName}\``,
          '',
          `- Toggle name: \`${summary.name}\``,
          '- Usage: `{{getglobalvar::toggle_<toggleName>}}` reads the selected/toggled value.',
          `- Definitions: ${summary.definitionCount}`,
        ].join('\n'),
      },
      insertText: summary.globalVariableName,
      sortText: `zzzz-risutoggle-global-${summary.globalVariableName}`,
    } satisfies CompletionItem;
  });
}

/**
 * buildWorkspaceChatVariableCompletions 함수.
 * 현재 fragment-local 후보 뒤에 붙일 workspace persistent chat variable completion item을 생성함.
 *
 * @param summaries - workspace variable completion summary 목록
 * @param options - prefix, insertion mode, local dedupe 정보
 * @param workspaceFreshness - workspace graph 후보 freshness metadata
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns workspace chat variable completion item 배열
 */
export function buildWorkspaceChatVariableCompletions(
  summaries: readonly VariableCompletionSummary[],
  options: WorkspaceChatVariableCompletionOptions,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: WorkspaceVariableCompletionBuilderCallbacks,
): CompletionItem[] {
  if (workspaceFreshness?.freshness === 'stale' && options.usage === 'calc-expression') {
    return [];
  }

  const normalizedPrefix = options.prefix.toLowerCase();

  return summaries.flatMap((summary) => {
    if (!summary.name.toLowerCase().startsWith(normalizedPrefix)) {
      return [];
    }

    if (options.existingLabels.has(`${options.labelPrefix}${summary.name}`)) {
      return [];
    }

    if (!summary.hasWritableSource) {
      return [];
    }

    const label = `${options.labelPrefix}${summary.name}`;
    const detail =
      options.usage === 'calc-expression'
        ? 'Workspace chat variable for calc expression'
        : options.usage === 'nested-chat-value'
          ? 'Workspace chat variable as nested value'
          : 'Workspace chat variable';
    const documentation = formatWorkspaceVariableDocumentation(summary, options.usage);
    const insertText =
      options.usage === 'nested-chat-value'
        ? `{{getvar::${summary.name}}}`
        : options.insertBareName
          ? summary.name
          : label;

    return {
      label,
      kind: CompletionItemKind.Variable,
      data: callbacks.createCategoryData(
        {
          category: 'variable',
          kind: 'chat-variable',
        },
        callbacks.createScopeExplanation(
          getWorkspaceVariableCompletionSource(options.usage),
          getWorkspaceVariableCompletionExplanation(options.usage),
        ),
        undefined,
        workspaceFreshness ?? undefined,
      ),
      detail,
      documentation: {
        kind: 'markdown',
        value: documentation,
      },
      insertText,
      sortText: `${WORKSPACE_VARIABLE_SORT_PREFIX}${summary.name}`,
    } satisfies CompletionItem;
  });
}

/**
 * buildWorkspaceToggleNameCompletions 함수.
 * `#when::toggle::` 인자에서 risutoggle 원본 key 이름을 completion 후보로 생성함.
 *
 * @param summaries - workspace toggle completion summary 목록
 * @param prefix - 현재 toggle 이름 prefix
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns risutoggle 원본 이름 completion item 목록
 */
export function buildWorkspaceToggleNameCompletions(
  summaries: readonly ToggleCompletionSummary[],
  prefix: string,
  callbacks: WorkspaceVariableCompletionBuilderCallbacks,
): CompletionItem[] {
  const normalizedPrefix = prefix.toLowerCase();
  return summaries.flatMap((summary) => {
    if (!summary.name.toLowerCase().startsWith(normalizedPrefix)) {
      return [];
    }

    return {
      label: summary.name,
      kind: CompletionItemKind.Property,
      data: callbacks.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'when-operator',
        },
        callbacks.createContextualExplanation(
          'risutoggle-name-index',
          'Completion inferred a #when toggle argument and resolved the candidate from `.risutoggle` keys.',
        ),
      ),
      detail: 'Risutoggle name',
      documentation: {
        kind: 'markdown',
        value: [
          `**Risutoggle:** \`${summary.name}\``,
          '',
          '- Usage: `{{#when::toggle::<toggleName>}}...{{/when}}` checks this registered toggle.',
          `- Globalvar alias: \`${summary.globalVariableName}\``,
          `- Definitions: ${summary.definitionCount}`,
        ].join('\n'),
      },
      insertText: summary.name,
      sortText: `zzzz-risutoggle-name-${summary.name}`,
    } satisfies CompletionItem;
  });
}

/**
 * getWorkspaceVariableCompletionSource 함수.
 * workspace variable usage를 explanation source 문자열로 변환함.
 *
 * @param usage - workspace variable completion 문맥
 * @returns agent metadata explanation source
 */
export function getWorkspaceVariableCompletionSource(
  usage: WorkspaceVariableCompletionUsage,
): string {
  if (usage === 'calc-expression') {
    return 'workspace-chat-variable-graph:calc-expression';
  }

  if (usage === 'nested-chat-value') {
    return 'workspace-chat-variable-graph:nested-chat-value';
  }

  return 'workspace-chat-variable-graph:macro-argument';
}

/**
 * getWorkspaceVariableCompletionExplanation 함수.
 * workspace variable usage를 explanation detail 문자열로 변환함.
 *
 * @param usage - workspace variable completion 문맥
 * @returns agent metadata explanation detail
 */
export function getWorkspaceVariableCompletionExplanation(
  usage: WorkspaceVariableCompletionUsage,
): string {
  if (usage === 'calc-expression') {
    return 'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local `$var` symbols.';
  }

  if (usage === 'nested-chat-value') {
    return 'Completion resolved this candidate from workspace persistent chat-variable graph entries and inserts it as a nested getvar value expression.';
  }

  return 'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local chat-variable symbols.';
}

/**
 * formatWorkspaceVariableDocumentation 함수.
 * workspace variable summary만으로 completion documentation을 생성함.
 *
 * @param summary - completion 후보용 lightweight variable summary
 * @param usage - macro argument, calc expression, nested value 후보 문맥
 * @returns markdown documentation 문자열
 */
export function formatWorkspaceVariableDocumentation(
  summary: VariableCompletionSummary,
  usage: WorkspaceVariableCompletionUsage,
): string {
  const writerCount = summary.writerCount + summary.defaultDefinitionCount;
  if (usage === 'nested-chat-value') {
    return [
      `**Workspace chat variable:** \`${summary.name}\``,
      '',
      '- Source: workspace persistent chat-variable graph',
      '- Usage: insert as a nested `getvar` value expression inside comparison/logical CBS arguments.',
      `- Workspace readers: ${summary.readerCount}`,
      `- Workspace writers: ${writerCount}`,
    ].join('\n');
  }

  return usage === 'calc-expression'
    ? [
        `**Workspace chat variable:** \`${summary.name}\``,
        '',
        '- Source: workspace persistent chat-variable graph',
        '- Usage: append after fragment-local `$var` candidates inside the shared CBS expression sublanguage.',
        `- Workspace readers: ${summary.readerCount}`,
        `- Workspace writers: ${writerCount}`,
      ].join('\n')
    : [
        `**Workspace chat variable:** \`${summary.name}\``,
        '',
        '- Source: workspace persistent chat-variable graph',
        '- Usage: append after fragment-local `getvar` / `setvar` candidates so local symbols stay first.',
        `- Workspace readers: ${summary.readerCount}`,
        `- Workspace writers: ${writerCount}`,
      ].join('\n');
}

/**
 * getWorkspaceFreshness 함수.
 * completion 요청 기준 workspace snapshot freshness metadata를 조회함.
 *
 * @param variableFlowService - workspace variable flow service
 * @param workspaceSnapshot - provider가 받은 workspace snapshot state
 * @param request - completion 요청의 fragment analysis request
 * @returns workspace freshness metadata 또는 없으면 null
 */
export function getWorkspaceFreshness(
  variableFlowService: VariableFlowService | null,
  workspaceSnapshot: WorkspaceSnapshotState | null,
  request: FragmentAnalysisRequest,
): AgentMetadataWorkspaceSnapshotContract | null {
  if (!variableFlowService || !workspaceSnapshot) {
    return null;
  }

  return variableFlowService.getWorkspaceFreshness({
    uri: request.uri,
    version: request.version,
  });
}

/**
 * getStaleWorkspaceAvailability 함수.
 * stale workspace freshness를 feature availability metadata로 변환함.
 *
 * @param workspaceFreshness - workspace freshness metadata
 * @param feature - stale 상태를 설명할 feature 이름
 * @returns stale availability metadata 또는 fresh 상태면 undefined
 */
export function getStaleWorkspaceAvailability(
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  feature: 'completion' | 'hover',
): AgentMetadataAvailabilityContract | undefined {
  if (workspaceFreshness?.freshness !== 'stale') {
    return undefined;
  }

  return createStaleWorkspaceAvailability(feature, workspaceFreshness.detail);
}
