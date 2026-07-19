import { describe, expect, it } from 'vitest';

import { executeRisuLua } from '../src/node/risulua-runtime/worker-runner';

function request(source: string, limits: { timeoutMs?: number; instructionLimit?: number } = {}) {
  return {
    moduleMap: { entryModuleId: 'main', modules: { main: source } },
    target: { kind: 'module' as const },
    limits,
  };
}

describe('RisuLua runtime Worker isolation', () => {
  it('serializes successful values and diagnostics across the Worker boundary', async () => {
    const result = await executeRisuLua(request('return { worker = true, answer = 42 }'));

    expect(result.status).toBe('ok');
    expect(result.value).toEqual({ answer: 42, worker: true });
    expect(result.diagnostics).toEqual([]);
  });

  it('stops an infinite loop at the Lua instruction budget', async () => {
    const result = await executeRisuLua(request('while true do end', {
      timeoutMs: 1_000,
      instructionLimit: 5_000,
    }));

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_INSTRUCTION_LIMIT',
    }));
    expect(result.metrics.instructions).toBeGreaterThanOrEqual(5_000);
  });

  it('forcibly terminates execution at the wall-clock timeout', async () => {
    const startedAt = Date.now();
    const result = await executeRisuLua(request('while true do end', {
      timeoutMs: 40,
      instructionLimit: 1_000_000_000,
    }));

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_TIMEOUT' }));
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('terminates the Worker when its AbortSignal is aborted', async () => {
    const controller = new AbortController();
    const pending = executeRisuLua(request('while true do end', {
      timeoutMs: 1_000,
      instructionLimit: 1_000_000_000,
    }), { signal: controller.signal });
    controller.abort();

    const result = await pending;
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_ABORTED' }));
  });

  it('does not share Lua globals or module cache between requests', async () => {
    const first = await executeRisuLua(request('leaked = 9; return leaked'));
    const second = await executeRisuLua(request('return type(leaked)'));

    expect(first.value).toBe(9);
    expect(second.value).toBe('nil');
  });

  it('removes abort handling after normal completion', async () => {
    const controller = new AbortController();
    const result = await executeRisuLua(request('return "complete"'), { signal: controller.signal });

    controller.abort();
    expect(result.value).toBe('complete');
  });
});
