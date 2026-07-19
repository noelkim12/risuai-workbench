import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import type { ActionExecutionContext } from '../src/actions/types';
import { createPatchPlanStore } from '../src/mutation/patch-store';
import { handlePrepareAction } from '../src/tools/facade';
import { handleRouteIntent } from '../src/tools/intent-route';

function route(request: string) {
  return handleRouteIntent({ request }).then((result) => result.data!.route);
}

describe('RisuLua runtime intent gate', () => {
  it.each([
    'execute the RisuLua function vg_Init with Fengari',
    'RisuLua 함수 vg_Init을 실행해줘',
  ])('routes an interactive runtime call: %s', async (request) => {
    const result = await route(request);

    expect(result.intent).toBe('risulua_runtime_debug');
    expect(result.targetKind).toBe('lua_runtime');
    expect(result.nextStep).toBe('execute');
    expect(result.recommendedActions).toContain('risulua.debug_call');
  });

  it.each([
    'run a RisuLua runtime smoke regression and canonical dist parity',
    'RisuLua 런타임 회귀 스모크를 실행해줘',
    'split 후 실행 오류를 재현해줘',
  ])('routes runtime regression smoke: %s', async (request) => {
    const result = await route(request);

    expect(result.intent).toBe('risulua_runtime_smoke');
    expect(result.recommendedActions).toContain('risulua.runtime_smoke');
  });

  it('routes button-action debugging with profile guidance', async () => {
    const result = await route('debug this RisuLua button action in Fengari');

    expect(result.intent).toBe('risulua_runtime_debug');
    expect(result.explanation).toContain('button-action');
  });

  it('recommends context before prepare/run for large runtime source', async () => {
    const result = await route('run this very large RisuLua file with Fengari');

    expect(result.routingSignals).toContain('large_input:context_required');
    expect(result.recommendedTools).toContain('workbench.context');
    expect(result.recommendedTools.indexOf('workbench.context')).toBeLessThan(
      result.recommendedTools.indexOf('workbench.prepare_action'),
    );
  });

  it('keeps plain Lua syntax and static analysis on the analyzer route', async () => {
    const result = await route('analyze RisuLua syntax and call graph');

    expect(result.intent).toBe('analyze.lua_handler');
    expect(result.recommendedActions).toContain('analyze.query_lua_analysis');
    expect(result.recommendedActions).not.toContain('risulua.debug_call');
  });

  it.each([
    '앱 실행 오류를 확인해줘',
    'run regression checks for the documentation pipeline',
  ])('does not treat a generic regression as RisuLua runtime smoke: %s', async (request) => {
    const result = await route(request);

    expect(result.intent).not.toBe('risulua_runtime_smoke');
    expect(result.recommendedActions).not.toContain('risulua.runtime_smoke');
  });

  it('orders mixed runtime guidance as analyze then debug then smoke', async () => {
    const result = await route('analyze, debug, and smoke test this RisuLua split runtime regression');

    expect(result.recommendedActions.slice(0, 3)).toEqual([
      'analyze.query_lua_analysis',
      'risulua.debug_call',
      'risulua.runtime_smoke',
    ]);
  });

  it('prepare_action explains large input and the two contextId roles', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-runtime-intent-'));
    const context: ActionExecutionContext = {
      workspace: { ok: true, path: root, reason: null },
      mutationMode: 'preview-only',
      patchStore: createPatchPlanStore(),
    };
    const registry = createWorkbenchActionRegistry(context);

    for (const actionId of ['risulua.debug_call', 'risulua.runtime_smoke']) {
      const prepared = handlePrepareAction({ actionId }, registry);
      expect(prepared?.contextHint).toContain('128 KiB');
      expect(prepared?.contextHint).toContain('source.contextId');
      expect(prepared?.contextHint).toContain('run_action.contextId');
      expect(prepared?.contextHint).toContain('workspace');
    }
  });
});
