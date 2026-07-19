import { describe, expect, it } from 'vitest';

import { DEFAULT_RISULUA_EXECUTION_LIMITS } from '../src/node/risulua-runtime/contracts';
import { runRisuLuaInProcess } from '../src/node/risulua-runtime/fengari-engine';

function run(source: string, options: {
  modules?: Record<string, string>;
  target?: { kind: 'module' } | { kind: 'export'; exportName: string; args?: (null | boolean | number | string)[] };
} = {}) {
  return runRisuLuaInProcess({
    moduleMap: {
      entryModuleId: 'main',
      modules: { main: source, ...options.modules },
    },
    target: options.target ?? { kind: 'module' },
    hostProfile: 'minimal',
    limits: { ...DEFAULT_RISULUA_EXECUTION_LIMITS },
  });
}

describe('RisuLua Fengari engine', () => {
  it('executes a module and converts its returned table', () => {
    const result = run('return { answer = 42, items = { "a", "b" } }');

    expect(result.status).toBe('ok');
    expect(result.value).toEqual({ answer: 42, items: ['a', 'b'] });
    expect(result.diagnostics).toEqual([]);
  });

  it('calls a named module export with JSON arguments', () => {
    const result = run('return { add = function(a, b) return a + b end }', {
      target: { kind: 'export', exportName: 'add', args: [7, 5] },
    });

    expect(result.status).toBe('ok');
    expect(result.value).toBe(12);
  });

  it('loads allowlisted modules from the in-memory module map', () => {
    const result = run('local dep = require("foo.bar"); return { value = dep.value }', {
      modules: { 'foo.bar': 'return { value = "loaded" }' },
    });

    expect(result.value).toEqual({ value: 'loaded' });
    expect(result.trace.filter((event) => event.kind === 'module').map((event) => event.name)).toEqual([
      'main',
      'foo.bar',
    ]);
  });

  it('caches a required module once per VM', () => {
    const result = run([
      'local first = require("counter")',
      'local second = require("counter")',
      'return { first = first, second = second }',
    ].join('\n'), {
      modules: {
        counter: 'loadCount = (loadCount or 0) + 1; return loadCount',
      },
    });

    expect(result.value).toEqual({ first: 1, second: 1 });
    expect(result.trace.filter((event) => event.name === 'counter')).toHaveLength(1);
  });

  it('reports a missing module with its requested id', () => {
    const result = run('return require("missing.module")');

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_MODULE_NOT_FOUND',
      moduleId: 'missing.module',
    }));
  });

  it('reports compile errors with module context', () => {
    const result = run('local broken =');

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_COMPILE_ERROR',
      moduleId: 'main',
    }));
  });

  it('reports a lexical-capture regression as a Lua runtime error', () => {
    const result = run('return sensitivityRanges[1].min');

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_LUA_ERROR',
      moduleId: 'main',
    }));
    expect(result.diagnostics[0]?.message).toMatch(/sensitivityRanges|nil/);
  });

  it('does not expose unsafe standard libraries or loaders', () => {
    const result = run([
      'return {',
      '  io = type(io), os = type(os), debug = type(debug),',
      '  package = type(package), load = type(load),',
      '  loadfile = type(loadfile), dofile = type(dofile)',
      '}',
    ].join('\n'));

    expect(result.value).toEqual({
      debug: 'nil',
      dofile: 'nil',
      io: 'nil',
      load: 'nil',
      loadfile: 'nil',
      os: 'nil',
      package: 'nil',
    });
  });

  it('rejects traversal-like require ids before lookup', () => {
    const result = run('return require("../secret")');

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: 'RUNTIME_INVALID_REQUEST',
      moduleId: '../secret',
    }));
  });

  it('applies the result entry limit across nested tables', () => {
    const result = run([
      'local result = {}',
      'for outer = 1, 11 do',
      '  result[outer] = {}',
      '  for inner = 1, 100 do result[outer][inner] = inner end',
      'end',
      'return result',
    ].join('\n'));

    expect(result.status).toBe('error');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'RUNTIME_VALUE_LIMIT' }));
  });
});
