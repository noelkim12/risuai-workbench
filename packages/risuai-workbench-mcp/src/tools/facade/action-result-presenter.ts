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
  const resultRecord = isRecord(result) ? result : {};
  const resultData = isRecord(resultRecord.data) ? resultRecord.data : null;
  const canonicalFiles = resultData?.canonicalFiles;
  const hasLargeArtifactList = actionId === 'inspect.artifact'
    && Array.isArray(canonicalFiles)
    && canonicalFiles.length > 200;
  if (serialized === undefined || (!hasLargeArtifactList && Buffer.byteLength(serialized, 'utf8') <= MAX_INLINE_ACTION_RESULT_BYTES)) {
    return result;
  }

  const compactData = actionId === 'inspect.artifact' && resultData
    ? Object.fromEntries(Object.entries(resultData).filter(([key]) => key !== 'canonicalFiles'))
    : undefined;
  const compactResult = {
    actionId,
    ...(compactData ? { data: compactData } : {}),
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
