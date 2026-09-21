import {
  executeRisuLua,
  DEFAULT_RISULUA_EXECUTION_LIMITS,
  runRisuLuaSmoke,
  type RisuLuaSmokeScenario,
} from '@risuai-workbench/core/node';

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import {
  RuntimeDebugInputSchema,
  RuntimeSmokeInputSchema,
  type RuntimeDebugInput,
  type RuntimeSmokeInput,
} from '../schemas/runtime-schemas';
import { getRuntimeSourceMetrics, resolveRuntimeSource } from '../../tools/runtime/source-resolver';
import { presentRuntimeResult, type PresentedRuntimeResult } from '../../tools/runtime/result-presenter';

const RUNTIME_SOURCE_GUIDANCE = {
  type: 'discriminated union',
  description: 'Choose exactly one source variant. Workspace paths are derived from the configured workspace; arbitrary path/root fields are not accepted.',
  variants: [
    { name: 'workspace', fields: { kind: '"workspace"', form: '"canonical" | "dist"', entryModuleId: 'optional string' } },
    { name: 'context', fields: { kind: '"context"', contextId: 'string', entryModuleId: 'optional string' } },
    { name: 'inline', fields: { kind: '"inline"', moduleId: 'string', source: 'string (maximum 128 KiB)' } },
  ],
} as const;

const RUNTIME_INPUT_GUIDANCE = {
  fields: {
    source: RUNTIME_SOURCE_GUIDANCE,
    compareSource: RUNTIME_SOURCE_GUIDANCE,
    hostProfile: {
      type: 'enum',
      enumValues: ['minimal', 'button-action', 'chat-state'],
      defaultValue: 'minimal',
    },
    limits: {
      type: 'object',
      description: 'Optional hard-capped limits: timeoutMs<=2000, instructionLimit<=1000000, hostCallLimit<=1000, maxTraceEvents<=2000.',
    },
  },
} as const;

const DEBUG_EXAMPLES = [
  {
    source: { kind: 'inline', moduleId: 'main', source: 'return { run = function() return true end }' },
    exportName: 'run',
  },
  {
    source: { kind: 'workspace', form: 'canonical' },
    exportName: 'run',
  },
  {
    source: { kind: 'context', contextId: 'ctx_source' },
    exportName: 'run',
  },
] as const;

const SMOKE_EXAMPLES = [{
  source: { kind: 'inline', moduleId: 'main', source: 'return { run = function() return true end }' },
  scenarios: [{ id: 'bounded-run', target: { kind: 'export', exportName: 'run' } }],
}] as const;

export function registerRuntimeActions(registry: ActionRegistry): void {
  registry.register({
    id: 'risulua.runtime_smoke',
    title: 'Run RisuLua runtime smoke scenarios',
    summary: 'Execute deterministic Fengari smoke or canonical/dist parity scenarios in isolated Workers.',
    capability: 'risulua.runtime',
    risk: 'read_only',
    inputSchema: RuntimeSmokeInputSchema,
    examples: SMOKE_EXAMPLES,
    inputGuidance: RUNTIME_INPUT_GUIDANCE,
    aliases: ['fengari smoke', 'lua runtime regression', 'canonical dist parity'],
    searchText: 'risulua execute reproduce split runtime button action trace',
    execute: executeRuntimeSmoke,
  } as WorkbenchAction<RuntimeSmokeInput, PresentedRuntimeResult>);

  registry.register({
    id: 'risulua.debug_call',
    title: 'Debug one RisuLua export',
    summary: 'Call one RisuLua module export in an isolated deterministic Fengari Worker.',
    capability: 'risulua.runtime',
    risk: 'read_only',
    inputSchema: RuntimeDebugInputSchema,
    examples: DEBUG_EXAMPLES,
    inputGuidance: RUNTIME_INPUT_GUIDANCE,
    aliases: ['fengari debug', 'execute lua function', 'button action debug'],
    searchText: 'risulua runtime reproduce stack trace host profile',
    execute: async (input, context) => {
      const startedAt = performance.now();
      const moduleMap = await resolveRuntimeSource(input.source, context);
      const sourceMetrics = getRuntimeSourceMetrics(moduleMap);
      const sourceTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'source-resolution');
      if (sourceTimeout) return presentRuntimeResult(sourceTimeout, context.contextStore);
      const actionSignal = remainingSignal(startedAt, input.limits?.timeoutMs);
      const result = await executeRisuLua({
        moduleMap,
        target: {
          kind: 'export',
          moduleId: input.moduleId,
          exportName: input.exportName,
          args: input.args,
        },
        hostProfile: input.hostProfile,
        host: input.host,
        limits: input.limits,
      }, { signal: actionSignal });
      const executionTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'worker-execution');
      if (executionTimeout) return presentRuntimeResult(executionTimeout, context.contextStore);
      return presentWithinDeadline({
        ...result,
        metrics: {
          ...result.metrics,
          ...sourceMetrics,
          totalDurationMs: performance.now() - startedAt,
        },
      } as unknown as Record<string, unknown>, context.contextStore, startedAt, input.limits?.timeoutMs);
    },
  } as WorkbenchAction<RuntimeDebugInput, PresentedRuntimeResult>);
}

async function executeRuntimeSmoke(
  input: RuntimeSmokeInput,
  context: Parameters<WorkbenchAction<RuntimeSmokeInput>['execute']>[1],
): Promise<PresentedRuntimeResult> {
  const startedAt = performance.now();
  const moduleMap = await resolveRuntimeSource(input.source, context);
  const sourceMetrics = getRuntimeSourceMetrics(moduleMap);
  const sourceTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'source-resolution');
  if (sourceTimeout) return presentRuntimeResult(sourceTimeout, context.contextStore);
  const actionSignal = remainingSignal(startedAt, input.limits?.timeoutMs);
  const scenarios = input.scenarios.map((scenario): RisuLuaSmokeScenario => ({
    ...scenario,
    hostProfile: scenario.hostProfile ?? input.hostProfile ?? 'minimal',
    host: scenario.host ?? input.host,
    limits: scenario.limits ?? input.limits,
  }));
  if (input.compareSource) {
    const compareModuleMap = await resolveRuntimeSource(input.compareSource, context);
    const compareSourceMetrics = getRuntimeSourceMetrics(compareModuleMap);
    const compareTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'source-resolution');
    if (compareTimeout) return presentRuntimeResult(compareTimeout, context.contextStore);
    const parityResult = await runRisuLuaSmoke({
      kind: 'parity',
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        canonical: moduleMap,
        dist: compareModuleMap,
        scenario,
      })),
    }, { signal: actionSignal });
    const executionTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'worker-execution');
    if (executionTimeout) return presentRuntimeResult(executionTimeout, context.contextStore);
    return presentWithinDeadline({
      ...parityResult,
      metrics: {
        source: sourceMetrics,
        compareSource: compareSourceMetrics,
        totalDurationMs: performance.now() - startedAt,
      },
    } as unknown as Record<string, unknown>, context.contextStore, startedAt, input.limits?.timeoutMs);
  }
  const result = await runRisuLuaSmoke({ kind: 'smoke', moduleMap, scenarios }, { signal: actionSignal });
  const executionTimeout = timeoutAfterPhase(startedAt, input.limits?.timeoutMs, 'worker-execution');
  if (executionTimeout) return presentRuntimeResult(executionTimeout, context.contextStore);
  return presentWithinDeadline({
    ...result,
    metrics: {
      source: sourceMetrics,
      totalDurationMs: performance.now() - startedAt,
    },
  } as unknown as Record<string, unknown>, context.contextStore, startedAt, input.limits?.timeoutMs);
}

function presentWithinDeadline(
  result: Record<string, unknown>,
  contextStore: Parameters<typeof presentRuntimeResult>[1],
  startedAt: number,
  timeoutMs: number | undefined,
): PresentedRuntimeResult {
  const presented = presentRuntimeResult(result, contextStore);
  const timeout = timeoutAfterPhase(startedAt, timeoutMs, 'result-presentation');
  return timeout ? presentRuntimeResult(timeout, contextStore) : presented;
}

function timeoutAfterPhase(
  startedAt: number,
  requestedTimeoutMs: number | undefined,
  phase: 'source-resolution' | 'worker-execution' | 'result-presentation',
): Record<string, unknown> | undefined {
  const timeoutMs = requestedTimeoutMs ?? DEFAULT_RISULUA_EXECUTION_LIMITS.timeoutMs;
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs < timeoutMs) return undefined;
  return {
    status: 'error',
    stateDiff: {},
    trace: [],
    diagnostics: [{
      id: 'RUNTIME_TIMEOUT',
      message: `RisuLua action exceeded ${timeoutMs} ms during ${phase}`,
      details: { phase },
    }],
    metrics: {
      instructions: 0,
      hostCalls: 0,
      traceEvents: 0,
      traceTruncated: false,
      timeoutPhase: phase,
      totalDurationMs: elapsedMs,
    },
  };
}

function remainingSignal(startedAt: number, requestedTimeoutMs: number | undefined): AbortSignal {
  const timeoutMs = requestedTimeoutMs ?? DEFAULT_RISULUA_EXECUTION_LIMITS.timeoutMs;
  return AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs - (performance.now() - startedAt))));
}
