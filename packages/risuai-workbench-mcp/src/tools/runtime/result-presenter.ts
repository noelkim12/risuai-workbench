import { Buffer } from 'node:buffer';

import type { RisuLuaTraceEvent } from '@risuai-workbench/core/node';

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
  const guidance = runtimeGuidance(result);
  const enrichedResult = guidance.length > 0 ? { ...result, guidance } : result;
  const trace = collectTrace(result);
  const compactBytes = Buffer.byteLength(JSON.stringify(enrichedResult), 'utf8');
  if (trace.length <= MAX_INLINE_TRACE_EVENTS && compactBytes <= MAX_COMPACT_BYTES) {
    return { ...enrichedResult, externalized: false };
  }

  const summary = {
    status: result.status,
    diagnostics: result.diagnostics,
    metrics: result.metrics,
    ...(guidance.length > 0 ? { guidance } : {}),
    traceEventCount: trace.length,
    tracePreview: trace.slice(0, MAX_PREVIEW_EVENTS),
    truncated: true,
  };
  if (!contextStore) return { ...summary, externalized: false };

  const record = contextStore.create(
    'risulua-runtime-result',
    `RisuLua runtime ${String(result.status)} result with ${trace.length} trace events`,
    enrichedResult,
  );
  return {
    ...summary,
    externalized: true,
    contextId: record.id,
  };
}

function runtimeGuidance(result: Record<string, unknown>): readonly Record<string, string>[] {
  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  const instructionLimited = diagnostics.some((diagnostic) => {
    if (!diagnostic || typeof diagnostic !== 'object') return false;
    return (diagnostic as Record<string, unknown>).id === 'RUNTIME_INSTRUCTION_LIMIT';
  });
  const metrics = result.metrics;
  if (!instructionLimited || !metrics || typeof metrics !== 'object') return [];
  const metricRecord = metrics as Record<string, unknown>;
  if (metricRecord.hostCalls !== 0 || typeof metricRecord.moduleLoads !== 'number' || metricRecord.moduleLoads < 2) {
    return [];
  }
  return [{
    code: 'BOOTSTRAP_INSTRUCTION_LIMIT',
    recommendedAction: 'risulua.runtime_smoke',
    recommendation: 'Use bounded named exports and multiple smoke scenarios instead of one aggregate run export.',
  }];
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
