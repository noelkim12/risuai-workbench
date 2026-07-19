import { Buffer } from 'node:buffer';

import type { RisuLuaTraceEvent } from 'risu-workbench-core/node';

import type { ContextStore } from '../../context/context-store';

const MAX_INLINE_TRACE_EVENTS = 250;
const MAX_COMPACT_BYTES = 256 * 1024;
const MAX_PREVIEW_EVENTS = 20;

export interface PresentedRuntimeResult {
  [key: string]: unknown;
}

export function presentRuntimeResult(
  result: Record<string, unknown>,
  contextStore?: ContextStore,
): PresentedRuntimeResult {
  const trace = collectTrace(result);
  const compactBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (trace.length <= MAX_INLINE_TRACE_EVENTS && compactBytes <= MAX_COMPACT_BYTES) {
    return { ...result, externalized: false };
  }

  const summary = {
    status: result.status,
    diagnostics: result.diagnostics,
    traceEventCount: trace.length,
    tracePreview: trace.slice(0, MAX_PREVIEW_EVENTS),
    truncated: true,
  };
  if (!contextStore) return { ...summary, externalized: false };

  const record = contextStore.create(
    'risulua-runtime-result',
    `RisuLua runtime ${String(result.status)} result with ${trace.length} trace events`,
    result,
  );
  return {
    ...summary,
    externalized: true,
    contextId: record.id,
  };
}

function collectTrace(result: Record<string, unknown>): RisuLuaTraceEvent[] {
  if (Array.isArray(result.trace)) return result.trace as RisuLuaTraceEvent[];
  if (!Array.isArray(result.scenarios)) return [];

  const trace: RisuLuaTraceEvent[] = [];
  for (const scenario of result.scenarios) {
    if (!scenario || typeof scenario !== 'object') continue;
    const record = scenario as Record<string, unknown>;
    if (record.canonical || record.dist) {
      appendExecutionTrace(trace, record.canonical);
      appendExecutionTrace(trace, record.dist);
    } else {
      appendExecutionTrace(trace, record.execution);
    }
  }
  return trace;
}

function appendExecutionTrace(target: RisuLuaTraceEvent[], value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const trace = (value as Record<string, unknown>).trace;
  if (Array.isArray(trace)) target.push(...trace as RisuLuaTraceEvent[]);
}
