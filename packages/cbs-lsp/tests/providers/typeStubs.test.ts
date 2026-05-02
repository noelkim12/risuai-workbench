/**
 * RisuAI Lua type stub generator tests.
 * @file packages/cbs-lsp/tests/providers/typeStubs.test.ts
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createMinimalRisuAiLuaTypeStub,
  createRisuAiLuaTypeStubWorkspace,
  getRisuAiLuaDiagnosticGlobals,
} from '../../src/providers/lua/typeStubs';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const rootPath of temporaryRoots.splice(0)) {
    rmSync(rootPath, { force: true, recursive: true });
  }
});

describe('typeStubs', () => {
  it('creates a minimal LuaLS definition file for the core RisuAI runtime APIs', () => {
    const stub = createMinimalRisuAiLuaTypeStub();

    expect(stub).toContain('---@meta');
    expect(stub).toContain('---@type fun(id: string, name: string): RisuStateValue');
    expect(stub).toContain('getState = function(id, name) end');
    expect(stub).toContain('setState = function(id, name, value) end');
    expect(stub).toContain('getLoreBooks = function(id, search) end');
    expect(stub).toContain('log = function(value) end');
    expect(stub).toContain('logMain = function(value) end');
    expect(stub).toContain('LLMMain = function(id, promptStr, useMultimodal) end');
    expect(stub).toContain('listenEdit = function(type, func) end');
    expect(stub).toContain('json = {}');
    expect(stub).toContain('Promise = {}');
    expect(stub).toContain('---@class RisuLoreBook');
  });

  it('exposes upstream runtime globals for LuaLS undefined-global suppression', () => {
    const globals = getRisuAiLuaDiagnosticGlobals();

    for (const globalName of [
      'getChatVar',
      'setChatVar',
      'log',
      'logMain',
      'LLM',
      'LLMMain',
      'listenEdit',
      'json',
      'Promise',
      'onInput',
      'onOutput',
    ]) {
      expect(globals).toContain(globalName);
    }
  });

  it('writes the generated runtime stub into a deterministic Lua file inside the stub root', () => {
    const rootPath = mkdtempSync(path.join(tmpdir(), 'cbs-lsp-risu-stubs-test-'));
    temporaryRoots.push(rootPath);
    const workspace = createRisuAiLuaTypeStubWorkspace(rootPath);

    const stubFilePath = workspace.syncRuntimeStub();

    expect(stubFilePath).toBe(path.join(rootPath, 'risu-runtime.lua'));
    expect(existsSync(stubFilePath)).toBe(true);
    expect(readFileSync(stubFilePath, 'utf8')).toBe(createMinimalRisuAiLuaTypeStub());
  });
});
