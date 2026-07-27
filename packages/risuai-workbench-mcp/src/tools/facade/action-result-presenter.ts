import { Buffer } from 'node:buffer';

import type { ContextStore } from '../../context/context-store';

const MAX_INLINE_ACTION_RESULT_BYTES = 48 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function presentActionResult(
  actionId: string,
  result: unknown,
  contextStore?: ContextStore,
): unknown {
  const serialized = JSON.stringify(result);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') <= MAX_INLINE_ACTION_RESULT_BYTES) {
    return result;
  }

  const resultRecord = isRecord(result) ? result : {};
  const compactResult = {
    actionId,
    diagnostics: resultRecord.diagnostics,
    externalized: Boolean(contextStore),
    status: resultRecord.status,
    summary: resultRecord.summary,
    suggestedQueries: ['errors', 'warnings', 'summary'],
    truncated: true,
  };
  if (!contextStore) return compactResult;

  const record = contextStore.create(
    'action-result',
    `${actionId} result externalized at ${Buffer.byteLength(serialized, 'utf8')} bytes`,
    result,
  );
  return { ...compactResult, contextId: record.id };
}
