import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RISULUA_EXECUTION_LIMITS,
  type RisuLuaExecutionRequest,
  type RisuLuaJsonValue,
} from '../src/node/risulua-runtime/contracts';
import { runRisuLuaInProcess } from '../src/node/risulua-runtime/fengari-engine';

function run(
  source: string,
  options: Partial<Pick<RisuLuaExecutionRequest, 'hostProfile' | 'host' | 'limits'>> = {},
) {
  return runRisuLuaInProcess({
    moduleMap: { entryModuleId: 'main', modules: { main: source } },
    target: { kind: 'module' },
    hostProfile: options.hostProfile ?? 'minimal',
    host: options.host,
    limits: { ...DEFAULT_RISULUA_EXECUTION_LIMITS, ...options.limits },
  });
}

describe('RisuLua runtime host profiles', () => {
  it('minimal exposes async as an identity wrapper without mutable chat APIs', () => {
    const result = run('return { value = async(function() return 5 end)(), chat = type(getChatVar) }');

    expect(result.value).toEqual({ chat: 'nil', value: 5 });
  });

  it('button-action exposes the approved variable and action functions', () => {
    const result = run([
      'setChatVar("mood", "happy")',
      'setGlobalVar("route", 3)',
      'addChat("user", "hello")',
      'reloadDisplay()',
      'return { mood = getChatVar("mood"), route = getGlobalVar("route") }',
    ].join('\n'), { hostProfile: 'button-action' });

    expect(result.value).toEqual({ mood: 'happy', route: 3 });
    expect(result.metrics.hostCalls).toBe(6);
    expect(result.trace.filter((event) => event.kind === 'host-call').map((event) => event.name)).toEqual([
      'setChatVar',
      'setGlobalVar',
      'addChat',
      'reloadDisplay',
      'getChatVar',
      'getGlobalVar',
    ]);
  });

  it('chat-state adds getState and setState', () => {
    const result = run('setState("screen", "intro"); return getState("screen")', {
      hostProfile: 'chat-state',
    });

    expect(result.value).toBe('intro');
    expect(result.state).toEqual(expect.objectContaining({ state: { screen: 'intro' } }));
  });

  it('alert functions return an inert awaitable-compatible table', () => {
    const result = run([
      'local notice = alertError("problem")',
      'local normal = alertNormal("ok")',
      'notice.await()',
      'normal.await()',
      'return { notice = type(notice), await = type(notice.await) }',
    ].join('\n'), { hostProfile: 'button-action' });

    expect(result.value).toEqual({ await: 'function', notice: 'table' });
  });

  it('seeds declarative globals and variable maps', () => {
    const result = run('return { range = sensitivityRanges[1].min, mood = getChatVar("mood") }', {
      hostProfile: 'button-action',
      host: {
        globals: { sensitivityRanges: [{ min: -2, max: 2 }] },
        chatVariables: { mood: 'neutral' },
      },
    });

    expect(result.value).toEqual({ mood: 'neutral', range: -2 });
  });

  it('enforces the host-call budget', () => {
    const result = run('for i = 1, 4 do reloadDisplay() end; return true', {
      hostProfile: 'button-action',
      limits: { hostCallLimit: 3 },
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_HOST_CALL_LIMIT' }));
    expect(result.metrics.hostCalls).toBe(4);
  });

  it('uses deterministic random for the same seed', () => {
    const source = 'return { math.random(), math.random(10), math.random(5, 8) }';
    const host = { randomSeed: 77 };

    expect(run(source, { host }).value).toEqual(run(source, { host }).value);
  });

  it('reports only added, changed, and removed state keys', () => {
    const result = run([
      'setChatVar("same", "keep")',
      'setChatVar("changed", "after")',
      'setChatVar("removed", nil)',
      'setChatVar("added", 9)',
      'return true',
    ].join('\n'), {
      hostProfile: 'button-action',
      host: { chatVariables: { same: 'keep', changed: 'before', removed: 'old' } },
    });

    expect(result.stateDiff.chatVariables).toEqual({
      added: 9,
      changed: 'after',
      removed: null,
    });
  });

  it('supports a vg_Init-style read across ten sensitivity ranges', () => {
    const ranges = Array.from({ length: 10 }, (_, index) => ({ min: index, max: index + 10 }));
    const result = run([
      'local total = 0',
      'for i = 1, 10 do total = total + sensitivityRanges[i].min end',
      'return total',
    ].join('\n'), {
      host: { globals: { sensitivityRanges: ranges as RisuLuaJsonValue } },
    });

    expect(result.status).toBe('ok');
    expect(result.value).toBe(45);
  });
});
