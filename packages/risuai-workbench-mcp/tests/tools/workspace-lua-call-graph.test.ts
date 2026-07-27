import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import {
  handleQueryLuaAnalysis,
  handleQueryLuaCallGraph,
} from '../../src/tools/analyze/query-analyze';

describe('workspace Lua call graph', () => {
  it('resolves exported require member calls and preserves unresolved locations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-lua-graph-'));
    const luaRoot = path.join(root, 'lua');
    await mkdir(path.join(luaRoot, 'runtime'), { recursive: true });
    await mkdir(path.join(luaRoot, 'domain'), { recursive: true });
    await mkdir(path.join(luaRoot, 'private'), { recursive: true });
    await writeFile(path.join(luaRoot, 'main.risulua'), [
      'local output = require("runtime.output")',
      'local missing = require("missing.module")',
      'local private = require("private.module")',
      'function onOutput(triggerId)',
      '  return output.onOutput(triggerId)',
      'end',
      'function onMissing()',
      '  return missing.run()',
      'end',
      'function onPrivate()',
      '  return private.reset()',
      'end',
    ].join('\n'), 'utf8');
    await writeFile(path.join(luaRoot, 'runtime', 'output.risulua'), [
      'local outfit = require("domain.outfit")',
      'local M = {}',
      'local onOutput',
      'onOutput = function(triggerId)',
      '  return outfit.prepareReward(triggerId)',
      'end',
      'M.onOutput = onOutput',
      'return M',
    ].join('\n'), 'utf8');
    await writeFile(path.join(luaRoot, 'domain', 'outfit.risulua'), [
      'local M = {}',
      'function M.prepareReward(triggerId)',
      '  return triggerId',
      'end',
      'return M',
    ].join('\n'), 'utf8');
    await writeFile(path.join(luaRoot, 'private', 'module.risulua'), [
      'local function reset()',
      '  return true',
      'end',
      'local M = {}',
      'return M',
    ].join('\n'), 'utf8');
    const workspace: WorkspaceRootStatus = { ok: true, path: root, reason: null };

    const result = await handleQueryLuaCallGraph({ sourcePath: 'lua/main.risulua' }, workspace);
    const analysisResult = await handleQueryLuaAnalysis({ sourcePath: 'lua/main.risulua' }, workspace);

    expect(result.data).toMatchObject({
      crossModuleEdges: expect.arrayContaining([
        expect.objectContaining({ caller: 'main.onOutput', callee: 'runtime.output.onOutput', status: 'resolved' }),
        expect.objectContaining({ caller: 'runtime.output.onOutput', callee: 'domain.outfit.prepareReward', status: 'resolved' }),
        expect.objectContaining({ caller: 'main.onMissing', callee: 'missing.module.run', status: 'unresolved', targetPath: null }),
        expect.objectContaining({ caller: 'main.onPrivate', callee: 'private.module.reset', status: 'unresolved' }),
      ]),
    });
    expect(analysisResult.data).toMatchObject({
      analyzeSummary: {
        callGraph: expect.arrayContaining([
          expect.objectContaining({ caller: 'main.onOutput', callees: ['runtime.output.onOutput'] }),
          expect.objectContaining({ caller: 'runtime.output.onOutput', callees: ['domain.outfit.prepareReward'] }),
        ]),
        resolvedModuleCalls: expect.arrayContaining([
          expect.objectContaining({ caller: 'main.onOutput', callee: 'runtime.output.onOutput', status: 'resolved' }),
        ]),
        unresolvedModuleCalls: expect.arrayContaining([
          expect.objectContaining({ caller: 'main.onMissing', callee: 'missing.module.run', line: 8, status: 'unresolved' }),
          expect.objectContaining({ caller: 'main.onPrivate', callee: 'private.module.reset', status: 'unresolved' }),
        ]),
      },
    });
  });
});
