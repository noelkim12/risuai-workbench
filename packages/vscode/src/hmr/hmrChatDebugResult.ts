import type {
  HmrChatDebugChatContext,
  HmrChatDebugCharacterContext,
  HmrChatDebugMessage,
  HmrChatDebugResult,
  HmrChatDebugScriptStateValue,
  HmrChatDebugSnapshot,
} from '@risuai-workbench/core';
import type { IncomingMessage } from 'node:http';

export type BoundedJsonBody =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'oversize' }
  | { readonly kind: 'value'; readonly value: unknown };

export async function readBoundedJsonBody(
  request: IncomingMessage,
  maximumBytes: number,
  timeoutMs: number,
): Promise<BoundedJsonBody> {
  const chunks: Buffer[] = [];
  let byteLength = 0;

  return new Promise<BoundedJsonBody>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settle({ kind: 'invalid' });
      request.destroy();
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onInvalid);
      request.removeListener('aborted', onInvalid);
    };
    const settle = (body: BoundedJsonBody): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(body);
    };
    const onInvalid = (): void => settle({ kind: 'invalid' });
    const onData = (chunk: Buffer | string): void => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > maximumBytes) {
        settle({ kind: 'oversize' });
        request.resume();
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = (): void => {
      try {
        const json = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        settle({ kind: 'value', value: JSON.parse(json) });
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError) {
          settle({ kind: 'invalid' });
          return;
        }
        throw error;
      }
    };

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onInvalid);
    request.once('aborted', onInvalid);
  });
}

export function isHmrChatDebugResult(value: unknown): value is HmrChatDebugResult {
  if (!isExactRecord(value, ['requestId', 'stableId', 'ok', 'snapshot', 'error'], ['requestId', 'stableId', 'ok'])) return false;
  if (!isNonEmptyString(value['requestId']) || !isNonEmptyString(value['stableId']) || typeof value['ok'] !== 'boolean') return false;

  if (value['ok']) {
    return isExactRecord(value, ['requestId', 'stableId', 'ok', 'snapshot'], ['requestId', 'stableId', 'ok', 'snapshot'])
      && isSnapshot(value['snapshot']);
  }

  return isExactRecord(value, ['requestId', 'stableId', 'ok', 'error'], ['requestId', 'stableId', 'ok', 'error'])
    && isSafeError(value['error']);
}

function isSnapshot(value: unknown): value is HmrChatDebugSnapshot {
  return isExactRecord(value, ['capturedAt', 'character', 'chat', 'scriptstate', 'recentMessages'], ['capturedAt', 'character', 'chat', 'scriptstate', 'recentMessages'])
    && typeof value['capturedAt'] === 'number'
    && Number.isFinite(value['capturedAt'])
    && value['capturedAt'] >= 0
    && isContext(value['character'])
    && isContext(value['chat'])
    && isScriptState(value['scriptstate'])
    && isMessages(value['recentMessages']);
}

function isContext(value: unknown): value is HmrChatDebugCharacterContext & HmrChatDebugChatContext {
  return isExactRecord(value, ['id', 'name'], [])
    && (value['id'] === undefined || isNonEmptyString(value['id']))
    && (value['name'] === undefined || isNonEmptyString(value['name']));
}

function isScriptState(value: unknown): value is Readonly<Record<`$${string}`, HmrChatDebugScriptStateValue>> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, entry]) => key.startsWith('$') && isScriptStateValue(entry));
}

function isMessages(value: unknown): value is readonly HmrChatDebugMessage[] {
  return Array.isArray(value)
    && value.length <= 2
    && value.every((entry) => isMessage(entry));
}

function isMessage(value: unknown): value is HmrChatDebugMessage {
  return isExactRecord(value, ['index', 'role', 'data', 'time'], ['index', 'role', 'data'])
    && typeof value['index'] === 'number'
    && Number.isInteger(value['index'])
    && value['index'] >= 0
    && isNonEmptyString(value['role'])
    && typeof value['data'] === 'string'
    && (value['time'] === undefined || (typeof value['time'] === 'number' && Number.isFinite(value['time'])));
}

function isSafeError(value: unknown): boolean {
  return isExactRecord(value, ['code', 'message'], ['code', 'message'])
    && isChatDebugErrorCode(value['code'])
    && typeof value['message'] === 'string'
    && value['message'].length <= 256;
}

function isChatDebugErrorCode(value: unknown): boolean {
  return value === 'CHAT_UNAVAILABLE'
    || value === 'CHAT_SHAPE_INVALID'
    || value === 'SNAPSHOT_TOO_LARGE'
    || value === 'CAPTURE_FAILED';
}

function isScriptStateValue(value: unknown): value is HmrChatDebugScriptStateValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowedKeys.includes(key)) && requiredKeys.every((key) => key in value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
