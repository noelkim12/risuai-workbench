/**
 * Contextual macro handlers for the CBS simulator.
 * Runtime-sensitive macros that resolve from explicit simulation context,
 * including identity labels, chat index/history, and role macros.
 * @file packages/core/src/domain/cbs/simulator/macros/contextual.ts
 */
import type { CBSNode, MacroCallNode } from '../../domain/cbs/parser/ast';
import type { CbsSimulationContext } from '../types';
import { addSimulatorDiagnostic } from '../engine/diagnostics';
import type { DiagnosticState } from '../engine/diagnostics';
import { cloneRange, sourceForRange } from '../engine/source-range';
import type { SourceInfo } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import type { TraceState } from '../engine/trace';
import {
  findLatestUserMessageTimestamps,
  findPreviousChatHistoryContentByRole,
  formatDurationMillis,
  getChatHistoryContent,
  getChatHistoryTimestamp,
  parseChatHistoryIndex,
} from '../chat-history';
import { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE } from '../unsupported-diagnostics';

/**
 * Narrow state interface for contextual macro handlers.
 * Provides source access, diagnostic/trace emission, context resolution,
 * and argument evaluation through the bound `evaluateArgument` method.
 */
export interface ContextualState extends SourceInfo, DiagnosticState {
  readonly context: CbsSimulationContext;
  readonly explicitContextKeys: ReadonlySet<string>;
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
}

/** Handler signature for contextual macro evaluators. */
export type ContextualMacroHandler = (
  node: MacroCallNode,
  state: ContextualState,
  depth: number,
) => string;

/**
 * preserveContextMacro 함수.
 * 명시 context가 없는 contextual macro를 source-preserving warning으로 처리함.
 *
 * @param node - 보존할 macro call node
 * @param state - simulation 누적 상태
 * @param requiredSource - 부족한 context의 식별자
 * @param details - trace에 기록할 추가 세부 정보
 * @returns 원본 macro source 텍스트
 */
export function preserveContextMacro(
  node: MacroCallNode,
  state: ContextualState,
  requiredSource: string,
  details: Readonly<Record<string, unknown>> = {},
): string {
  const source = sourceForRange(state, node.range);
  if (state.status === 'ok') {
    state.status = 'partial';
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: `context macro ${node.name} missing ${requiredSource} - preserving source`,
    node: node.name,
    range: cloneRange(node.range),
    details: {
      policy: 'source-preserved',
      supportClass: 'runtime-unknown',
      requiredSource,
      ...details,
    },
  });
  addSimulatorDiagnostic(state, {
    code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
    message: `Runtime-unknown CBS macro ${JSON.stringify(node.name)} requires explicit ${requiredSource}`,
    severity: 'warning',
    range: cloneRange(node.nameRange),
  });
  return source;
}

/**
 * pushProviderTrace 함수.
 * provider/context backed macro resolution trace를 기록함.
 *
 * @param state - simulation 누적 상태 (narrow TraceState)
 * @param node - 현재 macro call node
 * @param message - trace event message
 * @param details - trace event structured details
 */
export function pushProviderTrace(
  state: TraceState,
  node: MacroCallNode,
  message: string,
  details: Readonly<Record<string, unknown>>,
): void {
  pushTrace(state, {
    phase: 'macro-skip',
    message,
    node: node.name,
    range: cloneRange(node.range),
    details,
  });
}

/**
 * evaluateUserMacro 함수.
 * 현재 simulation context의 user label을 반환함.
 *
 * @param node - 평가할 user MacroCall node
 * @param state - simulation 누적 상태
 * @returns context-backed user label
 */
function evaluateUserMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('userLabel')) {
    return preserveContextMacro(node, state, 'context.userLabel');
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'resolved user label from context',
    node: node.name,
    range: cloneRange(node.range),
    details: { source: 'context.userLabel' },
  });
  return state.context.userLabel;
}

/**
 * evaluateCharacterMacro 함수.
 * 현재 simulation context의 character label을 반환함.
 *
 * @param node - 평가할 char MacroCall node
 * @param state - simulation 누적 상태
 * @returns context-backed character label
 */
function evaluateCharacterMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('characterLabel')) {
    return preserveContextMacro(node, state, 'context.characterLabel');
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'resolved character label from context',
    node: node.name,
    range: cloneRange(node.range),
    details: { source: 'context.characterLabel' },
  });
  return state.context.characterLabel;
}

/** evaluateRoleMacro 함수. 명시된 현재 역할만 반환하고 없으면 source를 보존함. */
function evaluateRoleMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('role') || state.context.role === undefined) {
    return preserveContextMacro(node, state, 'context.role');
  }
  pushProviderTrace(state, node, 'resolved role from explicit context', { source: 'context.role' });
  return state.context.role;
}

/** evaluateChatIndexMacro 함수. 명시된 chat index만 반환하고 없으면 source를 보존함. */
function evaluateChatIndexMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('chatIndex') || state.context.chatIndex === undefined) {
    return preserveContextMacro(node, state, 'context.chatIndex');
  }
  pushProviderTrace(state, node, 'resolved chatindex from explicit context', {
    source: 'context.chatIndex',
  });
  return String(state.context.chatIndex);
}

/** evaluateIsFirstMessageMacro 함수. 명시된 first-message flag만 CBS truthy 문자열로 반환함. */
function evaluateIsFirstMessageMacro(node: MacroCallNode, state: ContextualState): string {
  if (
    !state.explicitContextKeys.has('isFirstMessage') ||
    state.context.isFirstMessage === undefined
  ) {
    return preserveContextMacro(node, state, 'context.isFirstMessage');
  }
  pushProviderTrace(state, node, 'resolved isfirstmsg from explicit context', {
    source: 'context.isFirstMessage',
  });
  return state.context.isFirstMessage ? '1' : '0';
}

/** evaluateLastMessageIdMacro 함수. 명시 chatHistory의 마지막 zero-based index만 반환함. */
function evaluateLastMessageIdMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory');
  }

  const value = (state.context.chatHistory.length - 1).toString();
  pushProviderTrace(state, node, 'resolved lastmessageid from explicit chat history context', {
    source: 'context.chatHistory',
    value,
  });
  return value;
}

/** evaluatePreviousChatLogMacro 함수. 명시 chatHistory의 indexed message content 또는 Out of range를 반환함. */
function evaluatePreviousChatLogMacro(
  node: MacroCallNode,
  state: ContextualState,
  depth: number,
): string {
  const index = parseChatHistoryIndex(state.evaluateArgument(node.arguments[0], depth + 1));
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory', { index });
  }

  const entry = index === undefined ? undefined : state.context.chatHistory[index];
  pushProviderTrace(state, node, 'resolved previouschatlog from explicit chat history context', {
    source: 'context.chatHistory',
    index,
    found: entry !== undefined,
  });
  return entry === undefined ? 'Out of range' : getChatHistoryContent(entry);
}

/** evaluatePreviousCharacterChatMacro 함수. cursor 이전의 최근 character message를 반환함. */
function evaluatePreviousCharacterChatMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory');
  }
  const cursor = state.context.chatHistoryCursor ?? state.context.chatHistory.length;
  const value = findPreviousChatHistoryContentByRole(state.context.chatHistory, 'char', cursor);
  pushProviderTrace(state, node, 'resolved previouscharchat from explicit chat history context', {
    source: 'context.chatHistory',
    cursor,
    found: value !== undefined,
  });
  return value ?? '';
}

/** evaluatePreviousUserChatMacro 함수. 명시 cursor 이전의 최근 user message를 반환함. */
function evaluatePreviousUserChatMacro(node: MacroCallNode, state: ContextualState): string {
  if (
    !state.explicitContextKeys.has('chatHistory') ||
    state.context.chatHistory === undefined ||
    state.context.chatHistoryCursor === undefined
  ) {
    return preserveContextMacro(node, state, 'context.chatHistoryCursor');
  }
  const value = findPreviousChatHistoryContentByRole(
    state.context.chatHistory,
    'user',
    state.context.chatHistoryCursor,
  );
  pushProviderTrace(state, node, 'resolved previoususerchat from explicit chat history context', {
    source: 'context.chatHistory',
    cursor: state.context.chatHistoryCursor,
    found: value !== undefined,
  });
  return value ?? '';
}

/** evaluateIdleDurationMacro 함수. 마지막 message timestamp부터 deterministic clock까지 duration을 반환함. */
function evaluateIdleDurationMacro(node: MacroCallNode, state: ContextualState): string {
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory');
  }
  if (state.context.chatHistory.length === 0) return '0:00:00';
  const timestamp = getChatHistoryTimestamp(
    state.context.chatHistory[state.context.chatHistory.length - 1],
  );
  if (timestamp === undefined) return '[Cannot get time, message was sent in older version]';
  return formatDurationMillis(state.context.providers.clock().getTime() - timestamp);
}

/** evaluateMessageIdleDurationMacro 함수. 최근 두 user message 사이 duration을 반환함. */
function evaluateMessageIdleDurationMacro(node: MacroCallNode, state: ContextualState): string {
  if (
    !state.explicitContextKeys.has('chatHistory') ||
    state.context.chatHistory === undefined ||
    state.context.chatHistoryCursor === undefined
  ) {
    return preserveContextMacro(node, state, 'context.chatHistoryCursor');
  }
  const timestamps = findLatestUserMessageTimestamps(
    state.context.chatHistory,
    state.context.chatHistoryCursor,
  );
  if (timestamps.latest === undefined) return '[No user message found]';
  if (timestamps.previous === undefined) return '[No previous user message found]';
  return formatDurationMillis(timestamps.latest - timestamps.previous);
}

/**
 * Registry of all contextual macro handlers.
 * Maps canonical macro names to their evaluator functions.
 */
export const CONTEXTUAL_MACRO_HANDLERS: Readonly<Record<string, ContextualMacroHandler>> = {
  user: evaluateUserMacro,
  char: evaluateCharacterMacro,
  role: evaluateRoleMacro,
  chatindex: evaluateChatIndexMacro,
  isfirstmsg: evaluateIsFirstMessageMacro,
  lastmessageid: evaluateLastMessageIdMacro,
  previouschatlog: evaluatePreviousChatLogMacro,
  previouscharchat: evaluatePreviousCharacterChatMacro,
  previoususerchat: evaluatePreviousUserChatMacro,
  idleduration: evaluateIdleDurationMacro,
  messageidleduration: evaluateMessageIdleDurationMacro,
};
