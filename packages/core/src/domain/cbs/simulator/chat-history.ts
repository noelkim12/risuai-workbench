/**
 * CBS simulator chat history entry normalization helpers.
 * @file packages/core/src/domain/cbs/simulator/chat-history.ts
 */

/** Chat message object accepted by the simulator context. */
export interface CbsSimulationChatHistoryMessage {
  /** Message role from the runtime chat log. */
  readonly role?: string;
  /** Message text content returned by previous_chat_log-like macros. */
  readonly content: string;
  /** Optional stable message identifier for future adapters. */
  readonly id?: string | number;
  /** Optional timestamp used by idle duration macros. */
  readonly createdAt?: string | number | Date;
}

/** Chat history entry accepted by the simulator context. */
export type CbsSimulationChatHistoryEntry = string | CbsSimulationChatHistoryMessage;

/**
 * cloneChatHistoryEntry 함수.
 * Caller-owned chat history entry를 mutation-safe 값으로 복제함.
 *
 * @param entry - 복제할 chat history entry
 * @returns simulator context에 저장할 entry 복제본
 */
export function cloneChatHistoryEntry(entry: CbsSimulationChatHistoryEntry): CbsSimulationChatHistoryEntry {
  if (typeof entry === 'string') return entry;
  return { ...entry };
}

/**
 * getChatHistoryContent 함수.
 * string/object chat history entry에서 CBS macro가 반환할 content를 읽음.
 *
 * @param entry - content를 읽을 chat history entry
 * @returns macro output으로 사용할 message content
 */
export function getChatHistoryContent(entry: CbsSimulationChatHistoryEntry): string {
  return typeof entry === 'string' ? entry : entry.content;
}

/**
 * getChatHistoryRole 함수.
 * object chat history entry의 role을 소문자로 정규화함.
 *
 * @param entry - role을 읽을 chat history entry
 * @returns 정규화된 role, 없으면 undefined
 */
export function getChatHistoryRole(entry: CbsSimulationChatHistoryEntry): string | undefined {
  if (typeof entry === 'string' || entry.role === undefined) return undefined;
  return entry.role.toLocaleLowerCase();
}

/**
 * getChatHistoryTimestamp 함수.
 * entry timestamp를 epoch milliseconds로 변환함.
 *
 * @param entry - timestamp를 읽을 chat history entry
 * @returns 유효한 epoch milliseconds, 없거나 invalid면 undefined
 */
export function getChatHistoryTimestamp(entry: CbsSimulationChatHistoryEntry): number | undefined {
  if (typeof entry === 'string' || entry.createdAt === undefined) return undefined;
  const value = entry.createdAt instanceof Date ? entry.createdAt.getTime() : new Date(entry.createdAt).getTime();
  return Number.isFinite(value) ? value : undefined;
}

/**
 * parseChatHistoryIndex 함수.
 * CBS argument 문자열을 absolute zero-based history index로 변환함.
 *
 * @param value - macro argument 평가 결과
 * @returns 정수 index, 아니면 undefined
 */
export function parseChatHistoryIndex(value: string): number | undefined {
  const index = Number(value);
  return Number.isInteger(index) ? index : undefined;
}
