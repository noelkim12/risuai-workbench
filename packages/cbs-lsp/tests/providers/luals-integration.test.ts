/**
 * Opt-in real LuaLS lifecycle smoke test.
 * @file packages/cbs-lsp/tests/providers/luals-integration.test.ts
 */

import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  createLuaLsProcessManager,
  resolveLuaLsExecutablePathSync,
} from '../../src/providers/lua/lualsProcess';
import { createLuaLsProxy } from '../../src/providers/lua/lualsProxy';

const RUN_LUALS_INTEGRATION = ['1', 'true'].includes(
  process.env.CBS_LSP_RUN_LUALS_INTEGRATION?.toLowerCase() ?? '',
);
const RESOLVED_LUALS_PATH = resolveLuaLsExecutablePathSync({
  overrideExecutablePath: process.env.CBS_LSP_LUALS_PATH ?? null,
});

describe.runIf(RUN_LUALS_INTEGRATION && Boolean(RESOLVED_LUALS_PATH))('real LuaLS integration', () => {
  it('completes initialize, hover roundtrip, and shutdown handshake against a real LuaLS binary', async () => {
    const manager = createLuaLsProcessManager({
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => RESOLVED_LUALS_PATH,
      shutdownTimeoutMs: 5_000,
    });
    const proxy = createLuaLsProxy(manager);
    const sourceUri = 'file:///tmp/luals-hover.risulua';
    const sourceFilePath = '/tmp/luals-hover.risulua';
    const luaText = 'local greeting = "hello"\nreturn greeting\n';

    manager.prepareForInitialize({ rootPath: process.cwd() });
    manager.syncDocument({
      sourceUri,
      sourceFilePath,
      transportUri: 'risu-luals:///tmp/luals-hover.risulua.lua',
      languageId: 'lua',
      rootPath: process.cwd(),
      version: 1,
      text: luaText,
    });
    const startedRuntime = await manager.start({ rootPath: process.cwd() });
    const hover = await proxy.provideHover({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 7 },
    });

    expect(startedRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(hover).not.toBeNull();

    const stoppedRuntime = await manager.shutdown();

    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
  });
});
