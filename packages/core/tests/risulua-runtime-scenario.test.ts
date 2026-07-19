import { describe, expect, it } from 'vitest';

import {
  runRisuLuaSmoke,
  type RisuLuaModuleMap,
  type RisuLuaSmokeScenario,
} from '../src/node/risulua-runtime';

const moduleMap: RisuLuaModuleMap = {
  entryModuleId: 'main',
  modules: {
    main: 'return { add = function(a, b) return a + b end, fail = function() return missing.value end }',
  },
};

function scenario(id: string, expectedValue: number): RisuLuaSmokeScenario {
  return {
    id,
    target: { kind: 'export', exportName: 'add', args: [expectedValue - 1, 1] },
    hostProfile: 'minimal',
    expected: { status: 'ok', value: expectedValue },
  };
}

describe('RisuLua smoke and parity scenarios', () => {
  it('passes all matching smoke scenarios', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'smoke',
      moduleMap,
      scenarios: [scenario('one', 1), scenario('two', 2)],
    });

    expect(result.status).toBe('ok');
    expect(result.scenarios.map((item) => ({ id: item.id, status: item.status }))).toEqual([
      { id: 'one', status: 'passed' },
      { id: 'two', status: 'passed' },
    ]);
  });

  it('returns an assertion diagnostic for a value mismatch', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'smoke',
      moduleMap,
      scenarios: [{ ...scenario('wrong-value', 3), expected: { status: 'ok', value: 99 } }],
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_ASSERTION_FAILED',
      details: expect.objectContaining({ scenarioId: 'wrong-value' }),
    }));
  });

  it('can expect a specific runtime error without hiding unexpected diagnostics', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'smoke',
      moduleMap,
      scenarios: [{
        id: 'expected-error',
        target: { kind: 'export', exportName: 'fail' },
        hostProfile: 'minimal',
        expected: { status: 'error', diagnosticIds: ['RUNTIME_LUA_ERROR'] },
      }],
    });

    expect(result.status).toBe('ok');
    expect(result.scenarios[0]?.status).toBe('passed');
    expect(result.scenarios[0]?.execution.status).toBe('error');
  });

  it('passes parity when canonical and dist behavior matches', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'parity',
      scenarios: [{
        id: 'matching-parity',
        canonical: { entryModuleId: 'main', modules: { main: 'return { value = 7 }' } },
        dist: { entryModuleId: '__dist', modules: { __dist: 'return { value = 7 }' } },
        scenario: { id: 'inner', target: { kind: 'module' }, hostProfile: 'minimal' },
      }],
    });

    expect(result.status).toBe('ok');
    expect(result.scenarios[0]?.status).toBe('passed');
  });

  it('reports bounded canonical and dist signatures on parity mismatch', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'parity',
      scenarios: [{
        id: 'mismatch',
        canonical: { entryModuleId: 'main', modules: { main: 'return { value = 7 }' } },
        dist: { entryModuleId: '__dist', modules: { __dist: 'return { value = 8 }' } },
        scenario: { id: 'inner', target: { kind: 'module' }, hostProfile: 'minimal' },
      }],
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics[0]).toEqual(expect.objectContaining({
      id: 'RUNTIME_ASSERTION_FAILED',
      details: expect.objectContaining({
        scenarioId: 'mismatch',
        canonical: expect.any(Object),
        dist: expect.any(Object),
      }),
    }));
  });

  it('runs every scenario in an independent fresh Worker', async () => {
    const isolatedMap = {
      entryModuleId: 'main',
      modules: { main: 'leak = (leak or 0) + 1; return leak' },
    };
    const result = await runRisuLuaSmoke({
      kind: 'smoke',
      moduleMap: isolatedMap,
      scenarios: [
        { id: 'first', target: { kind: 'module' }, hostProfile: 'minimal', expected: { value: 1 } },
        { id: 'second', target: { kind: 'module' }, hostProfile: 'minimal', expected: { value: 1 } },
      ],
    });

    expect(result.status).toBe('ok');
  });

  it.each([
    [[{ ...scenario('', 1) }]],
    [[scenario('duplicate', 1), scenario('duplicate', 1)]],
  ])('rejects empty or duplicate scenario ids', async (scenarios) => {
    const result = await runRisuLuaSmoke({ kind: 'smoke', moduleMap, scenarios });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_INVALID_REQUEST' }));
    expect(result.scenarios).toEqual([]);
  });

  it('rejects more than the bounded number of scenarios before execution', async () => {
    const result = await runRisuLuaSmoke({
      kind: 'smoke',
      moduleMap,
      scenarios: Array.from({ length: 21 }, (_, index) => scenario(`scenario-${index}`, index)),
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_INVALID_REQUEST' }));
    expect(result.scenarios).toEqual([]);
  });
});
