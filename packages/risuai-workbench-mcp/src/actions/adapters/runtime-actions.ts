import {
  executeRisuLua,
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
import { resolveRuntimeSource } from '../../tools/runtime/source-resolver';
import { presentRuntimeResult, type PresentedRuntimeResult } from '../../tools/runtime/result-presenter';

export function registerRuntimeActions(registry: ActionRegistry): void {
  registry.register({
    id: 'risulua.runtime_smoke',
    title: 'Run RisuLua runtime smoke scenarios',
    summary: 'Execute deterministic Fengari smoke or canonical/dist parity scenarios in isolated Workers.',
    capability: 'risulua.runtime',
    risk: 'read_only',
    inputSchema: RuntimeSmokeInputSchema,
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
    aliases: ['fengari debug', 'execute lua function', 'button action debug'],
    searchText: 'risulua runtime reproduce stack trace host profile',
    execute: async (input, context) => {
      const moduleMap = await resolveRuntimeSource(input.source, context);
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
      });
      return presentRuntimeResult(result as unknown as Record<string, unknown>, context.contextStore);
    },
  } as WorkbenchAction<RuntimeDebugInput, PresentedRuntimeResult>);
}

async function executeRuntimeSmoke(
  input: RuntimeSmokeInput,
  context: Parameters<WorkbenchAction<RuntimeSmokeInput>['execute']>[1],
): Promise<PresentedRuntimeResult> {
  const moduleMap = await resolveRuntimeSource(input.source, context);
  const scenarios = input.scenarios.map((scenario): RisuLuaSmokeScenario => ({
    ...scenario,
    hostProfile: scenario.hostProfile ?? input.hostProfile ?? 'minimal',
    host: scenario.host ?? input.host,
    limits: scenario.limits ?? input.limits,
  }));
  if (input.compareSource) {
    const compareModuleMap = await resolveRuntimeSource(input.compareSource, context);
    const parityResult = await runRisuLuaSmoke({
      kind: 'parity',
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        canonical: moduleMap,
        dist: compareModuleMap,
        scenario,
      })),
    });
    return presentRuntimeResult(parityResult as unknown as Record<string, unknown>, context.contextStore);
  }
  const result = await runRisuLuaSmoke({ kind: 'smoke', moduleMap, scenarios });
  return presentRuntimeResult(result as unknown as Record<string, unknown>, context.contextStore);
}
