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

/**
 * findPreviousChatHistoryContentByRole 함수.
 * cursor 직전부터 뒤로 탐색해 지정 role의 최근 message content를 찾음.
 *
 * @param entries - 검색할 chat history entries
 * @param role - 찾을 role 이름
 * @param cursor - 현재 message index
 * @returns 발견한 content, 없으면 undefined
 */
export function findPreviousChatHistoryContentByRole(
  entries: readonly CbsSimulationChatHistoryEntry[],
  role: string,
  cursor: number,
): string | undefined {
  const targetRole = role.toLocaleLowerCase();
  for (let index = cursor - 1; index >= 0; index -= 1) {
    if (getChatHistoryRole(entries[index]) === targetRole) {
      return getChatHistoryContent(entries[index]);
    }
  }
  return undefined;
}

/**
 * formatDurationMillis 함수.
 * milliseconds duration을 upstream-style H:MM:SS 문자열로 변환함.
 *
 * @param durationMillis - 변환할 duration milliseconds
 * @returns H:MM:SS 형식 문자열
 */
export function formatDurationMillis(durationMillis: number): string {
  let seconds = Math.floor(Math.max(durationMillis, 0) / 1000);
  let minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  seconds %= 60;
  minutes %= 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * findLatestUserMessageTimestamps 함수.
 * cursor부터 역방향으로 최근 user message 2개의 timestamp를 찾음.
 *
 * @param entries - 검색할 chat history entries
 * @param cursor - 검색 시작 index
 * @returns 최신 user timestamp와 이전 user timestamp, 부족하면 undefined 포함
 */
export function findLatestUserMessageTimestamps(
  entries: readonly CbsSimulationChatHistoryEntry[],
  cursor: number,
): { readonly latest?: number; readonly previous?: number } {
  let latest: number | undefined;
  for (let index = Math.min(cursor, entries.length - 1); index >= 0; index -= 1) {
    if (getChatHistoryRole(entries[index]) !== 'user') continue;
    const timestamp = getChatHistoryTimestamp(entries[index]);
    if (latest === undefined) {
      latest = timestamp;
    } else {
      return { latest, previous: timestamp };
    }
  }
  return { latest };
}
