/**
 * RisuAI Lua runtime type stub generation tests.
 * @file packages/core/tests/domain/analyze/lua-type-stubs.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  RISUAI_LUA_RUNTIME_STUB_FILE_NAME,
  createMinimalRisuAiLuaTypeStub,
  getRisuAiLuaDiagnosticGlobals,
  getRisuAiLuaRuntimeDocumentation,
  getRisuAiLuaRuntimeSignatures,
} from '../../../src/domain/analyze/lua-type-stubs';

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

  it('creates _G field aliases for runtime globals to avoid LuaLS undefined-field diagnostics', () => {
    const stub = createMinimalRisuAiLuaTypeStub();

    expect(stub).toContain('_G.axLLM = axLLM');
    expect(stub).toContain('_G.LLM = LLM');
    expect(stub).toContain('_G.getState = getState');
    expect(stub).toContain('_G.json = json');
  });

  it('includes rich documentation comments for LLM runtime navigation targets', () => {
    const stub = createMinimalRisuAiLuaTypeStub();

    expect(stub).toContain('--- Wrapper: LLM convenience function (main model).');
    expect(stub).toContain('--- Internally decodes LLMMain(id, json.encode(prompt), useMultimodal):await().');
    expect(stub).toContain('--- @param prompt OpenAI-style prompt item array or compatible table.');
    expect(stub).toContain('--- @return Result envelope with success and result text.');
    expect(stub).toContain('--- @usage local result = LLM(id, {');
    expect(stub).toContain('--- Wrapper: axLLM convenience function (secondary model).');
    expect(stub).toContain('--- Use this when a script should call the configured secondary model instead of the main model.');
  });

  it('includes useful documentation comments for common non-LLM runtime targets', () => {
    const stub = createMinimalRisuAiLuaTypeStub();

    expect(stub).toContain('--- Wrapper: get JSON-backed state from chat variables.');
    expect(stub).toContain('--- @usage local state = getState(id, "game")');
    expect(stub).toContain('--- Wrapper: register edit listeners for prompt/display/input/output hooks.');
    expect(stub).toContain('--- (Injected) Generate an image and return inlay markup.');
    expect(stub).toContain('--- wasmoon Promise bridge namespace.');
    expect(stub).toContain('--- Script hook: called after AI output is received.');
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

  it('exposes stable signatures for overlay hover rendering', () => {
    const signatures = getRisuAiLuaRuntimeSignatures();

    expect(signatures.get('log')).toBe('log(message: any): void');
    expect(signatures.get('getState')).toContain('getState');
    expect(signatures.get('LLM')).toContain('LLM');
    expect([...signatures.keys()]).toEqual(expect.arrayContaining([...getRisuAiLuaDiagnosticGlobals()]));
  });

  it('exposes runtime documentation for enriched overlay hover rendering', () => {
    const documentation = getRisuAiLuaRuntimeDocumentation();

    expect(documentation.size).toBe(getRisuAiLuaDiagnosticGlobals().length);
    expect(documentation.get('LLM')?.summary).toContain('main model');
    expect(documentation.get('LLM')?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'prompt', description: expect.stringContaining('prompt item') }),
    ]));
    expect(documentation.get('LLM')?.examples.join('\n')).toContain('LLM(id,');
    expect(documentation.get('axLLM')?.summary).toContain('secondary model');
    expect(documentation.get('getState')?.summary).toContain('JSON-backed state');
    expect(documentation.get('listenEdit')?.summary).toContain('edit listeners');
    expect(documentation.get('getName')?.summary).toContain('RisuAI runtime global');
  });

  it('keeps exported signatures aligned with generated stub content', () => {
    const stub = createMinimalRisuAiLuaTypeStub();
    const signatures = getRisuAiLuaRuntimeSignatures();

    for (const [name] of signatures) {
      expect(stub).toContain(name);
    }
  });
});
