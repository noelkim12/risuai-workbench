/**
 * RisuAI Lua runtime type stub generation tests.
 * @file packages/core/tests/domain/analyze/lua-type-stubs.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  RISUAI_LUA_RUNTIME_STUB_FILE_NAME,
  createMinimalRisuAiLuaTypeStub,
  getRisuAiLuaDiagnosticGlobals,
} from 'risu-workbench-core';

describe('lua-type-stubs', () => {
  it('exports the canonical RisuAI Lua runtime stub file name', () => {
    expect(RISUAI_LUA_RUNTIME_STUB_FILE_NAME).toBe('risu-runtime.lua');
  });

  it('creates LuaLS-readable declarations for RisuAI runtime globals', () => {
    const stub = createMinimalRisuAiLuaTypeStub();

    expect(stub).toContain('---@meta');
    expect(stub).toContain('getState = function(id, name) end');
    expect(stub).toContain('setState = function(id, name, value) end');
    expect(stub).toContain('log = function(value) end');
    expect(stub).toContain('LLMMain = function(id, promptStr, useMultimodal) end');
    expect(stub).toContain('json = {}');
    expect(stub).toContain('Promise = {}');
  });

  it('returns deterministic Lua diagnostics globals shared by cbs-lsp and vscode', () => {
    const globals = getRisuAiLuaDiagnosticGlobals();

    expect(globals).toEqual([...globals].sort((left, right) => left.localeCompare(right)));
    for (const globalName of [
      'log',
      'logMain',
      'LLM',
      'listenEdit',
      'json',
      'Promise',
      'onInput',
    ]) {
      expect(globals).toContain(globalName);
    }
  });
});
