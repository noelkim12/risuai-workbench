/**
 * Oversized `.risulua` macro argument completion fast path helpers.
 * @file packages/cbs-lsp/src/features/cheap-macro-argument-completion.ts
 */
import {
  CompletionItem,
  Range as LSPRange,
  type Position,
} from 'vscode-languageserver/node';

import { getVariableMacroArgumentKind } from '../analyzer/scope/scope-macro-rules';
import type {
  AgentMetadataWorkspaceSnapshotContract,
  FragmentAnalysisRequest,
} from '../core';
import type { VariableFlowService, WorkspaceSnapshotState } from '../services';
import { shouldSkipOversizedLuaText } from '../utils/oversized-lua';
import { getLineTextAtPosition } from './cheap-root-completion';
import {
  buildWorkspaceChatVariableCompletions,
  buildWorkspaceToggleNameCompletions,
  getWorkspaceFreshness,
  type WorkspaceVariableCompletionBuilderCallbacks,
} from './workspace-variable-completion';

export interface CheapMacroArgumentCompletionContext {
  type: 'variable-names';
  kind: ScopeMacroArgumentCompletionKind;
  prefix: string;
  startCharacter: number;
  endCharacter: number;
  line: number;
}

export interface CheapWhenSegmentCompletionContext {
  type: 'when-segment';
  prefix: string;
  previousSegments: readonly string[];
  startCharacter: number;
  endCharacter: number;
  line: number;
}

export interface CheapMetadataKeyCompletionContext {
  type: 'metadata-keys';
  prefix: string;
  startCharacter: number;
  endCharacter: number;
  line: number;
}

export interface CheapUnsupportedArgumentCompletionContext {
  type: 'unsupported-argument';
  prefix: string;
  startCharacter: number;
  endCharacter: number;
  line: number;
}

export interface CheapNestedChatValueCompletionContext {
  type: 'nested-chat-value';
  prefix: string;
  startCharacter: number;
  endCharacter: number;
  line: number;
}

export type CheapMacroSegmentCompletionContext =
  | CheapMacroArgumentCompletionContext
  | CheapWhenSegmentCompletionContext
  | CheapMetadataKeyCompletionContext
  | CheapUnsupportedArgumentCompletionContext
  | CheapNestedChatValueCompletionContext;

export type ScopeMacroArgumentCompletionKind = NonNullable<
  ReturnType<typeof getVariableMacroArgumentKind>
>;

export interface CheapMacroArgumentCompletionCallbacks {
  buildMetadataCompletions(prefix: string): CompletionItem[];
  buildWhenOperatorCompletions(prefix: string): CompletionItem[];
  isToggleNameWhenSegment(previousSegments: readonly string[]): boolean;
  workspaceVariableCallbacks: WorkspaceVariableCompletionBuilderCallbacks;
}

export const MAX_OVERSIZED_MACRO_ARGUMENT_LINE_SCAN_LENGTH = 1024 * 1024;

export const CBS_OVERSIZED_KNOWN_ARGUMENT_MACROS = new Set([
  'addvar',
  'arg',
  'calc',
  'call',
  'getglobalvar',
  'gettempvar',
  'getvar',
  'metadata',
  'setdefaultvar',
  'setglobalvar',
  'settempvar',
  'setvar',
  'slot',
  'tempvar',
]);

export const CBS_OVERSIZED_NESTED_CHAT_VALUE_MACROS = new Set([
  'all',
  'and',
  'any',
  'contains',
  'endswith',
  'equal',
  'greater',
  'greaterequal',
  'iserror',
  'less',
  'lessequal',
  'not',
  'notequal',
  'or',
  'startswith',
]);

/**
 * provideCheapMacroArgumentCompletions 함수.
 * oversized `.risulua`의 안전한 current-line CBS macro argument 후보만 생성함.
 *
 * @param request - completion 요청의 문서 텍스트와 경로 정보
 * @param position - completion을 요청한 cursor 위치
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceSnapshot - workspace freshness 기준 snapshot
 * @param callbacks - provider에서 주입한 정적 catalog와 metadata builder
 * @returns oversized `.risulua` macro argument 후보 또는 일반 분석 경로로 넘겨야 하면 null
 */
export function provideCheapMacroArgumentCompletions(
  request: FragmentAnalysisRequest,
  position: Position,
  variableFlowService: VariableFlowService | null,
  workspaceSnapshot: WorkspaceSnapshotState | null,
  callbacks: CheapMacroArgumentCompletionCallbacks,
): CompletionItem[] | null {
  const isOversizedLua = shouldSkipOversizedLuaText(request.filePath, request.text.length);
  const context = detectCheapMacroArgumentCompletionContext(request, position);
  if (!context) {
    return isOversizedLua ? [] : null;
  }

  const workspaceFreshness = getWorkspaceFreshness(variableFlowService, workspaceSnapshot, request);
  const completions = buildCheapMacroArgumentCompletions(
    context,
    variableFlowService,
    workspaceFreshness,
    callbacks,
  );

  if (completions.length === 0) {
    return [];
  }

  return completions.map((item) => applyCheapMacroArgumentTextEdit(item, context));
}

/**
 * buildCheapMacroArgumentCompletions 함수.
 * current-line context만으로 metadata, #when, workspace variable 후보를 생성함.
 *
 * @param context - current-line cheap macro argument context
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceFreshness - workspace graph 후보 freshness metadata
 * @param callbacks - provider에서 주입한 정적 catalog와 metadata builder
 * @returns fast path completion 후보 목록
 */
export function buildCheapMacroArgumentCompletions(
  context: CheapMacroSegmentCompletionContext,
  variableFlowService: VariableFlowService | null,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: CheapMacroArgumentCompletionCallbacks,
): CompletionItem[] {
  if (context.type === 'metadata-keys') {
    return callbacks.buildMetadataCompletions(context.prefix);
  }

  if (context.type === 'unsupported-argument') {
    return [];
  }

  if (context.type === 'nested-chat-value') {
    return buildNestedChatValueCompletions(
      context.prefix,
      variableFlowService,
      workspaceFreshness,
      callbacks.workspaceVariableCallbacks,
    );
  }

  if (context.type === 'when-segment') {
    if (callbacks.isToggleNameWhenSegment(context.previousSegments)) {
      return variableFlowService
        ? buildWorkspaceToggleNameCompletions(
            variableFlowService.getToggleCompletionSummaries(),
            context.prefix,
            callbacks.workspaceVariableCallbacks,
          )
        : [];
    }

    return [
      ...callbacks.buildWhenOperatorCompletions(context.prefix),
      ...(variableFlowService
        ? buildWorkspaceChatVariableCompletions(
            variableFlowService.getVariableCompletionSummaries(),
            {
              existingLabels: new Set(),
              insertBareName: true,
              labelPrefix: '',
              prefix: context.prefix,
              usage: 'macro-argument',
            },
            workspaceFreshness,
            callbacks.workspaceVariableCallbacks,
          )
        : []),
    ];
  }

  if (context.kind !== 'chat') {
    return [];
  }

  return variableFlowService
    ? buildWorkspaceChatVariableCompletions(
        variableFlowService.getVariableCompletionSummaries(),
        {
          existingLabels: new Set(),
          insertBareName: true,
          labelPrefix: '',
          prefix: context.prefix,
          usage: 'macro-argument',
        },
        workspaceFreshness,
        callbacks.workspaceVariableCallbacks,
      )
    : [];
}

/**
 * buildNestedChatValueCompletions 함수.
 * evaluated value slot에서 workspace chat variable을 nested `getvar` macro로 삽입함.
 *
 * @param prefix - 현재 value segment에 입력한 변수명 prefix
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceFreshness - workspace graph 후보 freshness metadata
 * @param callbacks - workspace variable metadata builder
 * @returns nested `{{getvar::name}}` completion 후보 목록
 */
export function buildNestedChatValueCompletions(
  prefix: string,
  variableFlowService: VariableFlowService | null,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: WorkspaceVariableCompletionBuilderCallbacks,
): CompletionItem[] {
  return variableFlowService
    ? buildWorkspaceChatVariableCompletions(
        variableFlowService.getVariableCompletionSummaries(),
        {
          existingLabels: new Set(),
          insertBareName: false,
          labelPrefix: '',
          prefix,
          usage: 'nested-chat-value',
        },
        workspaceFreshness,
        callbacks,
      )
    : [];
}

/**
 * detectCheapMacroArgumentCompletionContext 함수.
 * parser/tokenizer 없이 현재 줄 prefix만으로 안전하게 판별 가능한 oversized `.risulua` CBS 인자를 찾음.
 *
 * @param request - completion 요청의 문서 텍스트와 경로 정보
 * @param position - completion을 요청한 cursor 위치
 * @returns 현재 macro argument completion context 또는 fast path 대상이 아니면 null
 */
export function detectCheapMacroArgumentCompletionContext(
  request: FragmentAnalysisRequest,
  position: Position,
): CheapMacroSegmentCompletionContext | null {
  if (!shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
    return null;
  }

  const line = getLineTextAtPosition(
    request.text,
    position,
    MAX_OVERSIZED_MACRO_ARGUMENT_LINE_SCAN_LENGTH,
  );
  if (line === null || position.character > line.length) {
    return null;
  }

  const prefixText = line.slice(0, position.character);
  const macroStartCharacter = prefixText.lastIndexOf('{{');
  if (macroStartCharacter === -1) {
    return null;
  }

  const closeBeforeMacro = prefixText.lastIndexOf('}}');
  if (closeBeforeMacro > macroStartCharacter) {
    return null;
  }

  const macroPrefix = prefixText.slice(macroStartCharacter + 2);
  if (macroPrefix.includes('{{') || macroPrefix.startsWith('/')) {
    return null;
  }

  const lastArgumentSeparatorIndex = macroPrefix.lastIndexOf('::');
  if (lastArgumentSeparatorIndex === -1) {
    return null;
  }

  const segmentStartCharacter = macroStartCharacter + 2 + lastArgumentSeparatorIndex + 2;
  if (/^#when(?=$|[\s:}])/i.test(macroPrefix)) {
    return {
      type: 'when-segment',
      prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
      previousSegments: macroPrefix
        .slice(0, lastArgumentSeparatorIndex)
        .split('::')
        .slice(1)
        .map((segment) => segment.trim()),
      startCharacter: segmentStartCharacter,
      endCharacter: position.character,
      line: position.line,
    };
  }

  if (macroPrefix.startsWith('#')) {
    return null;
  }

  const macroName = macroPrefix.slice(0, macroPrefix.indexOf('::')).trim().toLowerCase();
  if (!/^[a-z_][\w]*$/i.test(macroName)) {
    return null;
  }

  let argumentIndex = 0;
  for (let index = 0; index < lastArgumentSeparatorIndex; index += 1) {
    if (macroPrefix.slice(index, index + 2) !== '::') {
      continue;
    }

    argumentIndex += 1;
    index += 1;
  }

  if (macroName === 'metadata' && argumentIndex === 0) {
    return {
      type: 'metadata-keys',
      prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
      startCharacter: segmentStartCharacter,
      endCharacter: position.character,
      line: position.line,
    };
  }

  if (CBS_OVERSIZED_NESTED_CHAT_VALUE_MACROS.has(macroName)) {
    return {
      type: 'nested-chat-value',
      prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
      startCharacter: segmentStartCharacter,
      endCharacter: position.character,
      line: position.line,
    };
  }

  const kind = getVariableMacroArgumentKind(macroName, argumentIndex);
  if (!kind) {
    if (CBS_OVERSIZED_KNOWN_ARGUMENT_MACROS.has(macroName)) {
      return {
        type: 'unsupported-argument',
        prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
        startCharacter: segmentStartCharacter,
        endCharacter: position.character,
        line: position.line,
      };
    }

    return null;
  }

  if (kind !== 'chat') {
    return {
      type: 'unsupported-argument',
      prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
      startCharacter: segmentStartCharacter,
      endCharacter: position.character,
      line: position.line,
    };
  }

  return {
    type: 'variable-names',
    kind,
    prefix: macroPrefix.slice(lastArgumentSeparatorIndex + 2),
    startCharacter: segmentStartCharacter,
    endCharacter: position.character,
    line: position.line,
  };
}

/**
 * applyCheapMacroArgumentTextEdit 함수.
 * cheap macro argument completion item에 current-line textEdit range를 직접 부여함.
 *
 * @param item - textEdit을 적용할 completion item
 * @param context - current-line cheap macro argument context
 * @returns textEdit이 설정된 completion item
 */
export function applyCheapMacroArgumentTextEdit(
  item: CompletionItem,
  context: CheapMacroSegmentCompletionContext,
): CompletionItem {
  const newText = typeof item.insertText === 'string' ? item.insertText : item.label;
  return {
    ...item,
    textEdit: {
      range: LSPRange.create(
        context.line,
        context.startCharacter,
        context.line,
        context.endCharacter,
      ),
      newText,
    },
  } satisfies CompletionItem;
}
