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
import { createLuaLsProxy, normalizeLuaHoverForSnapshot } from '../../src/providers/lua/lualsProxy';

const RUN_LUALS_INTEGRATION = ['1', 'true'].includes(
  process.env.CBS_LSP_RUN_LUALS_INTEGRATION?.toLowerCase() ?? '',
);
const RESOLVED_LUALS_PATH = resolveLuaLsExecutablePathSync({
  overrideExecutablePath: process.env.CBS_LSP_LUALS_PATH ?? null,
});

/**
 * waitForRealLuaHover 함수.
 * LuaLS가 workspace loading placeholder 대신 실제 hover 내용을 돌려줄 때까지 재시도함.
 *
 * @param proxy - real LuaLS hover proxy
 * @param sourceUri - hover 대상 `.risulua` source URI
 * @param expectedSubstring - hover 본문에 포함되길 기대하는 문자열
 * @returns 실제 hover payload
 */
async function waitForRealLuaHover(
  proxy: ReturnType<typeof createLuaLsProxy>,
  sourceUri: string,
  expectedSubstring: string,
): Promise<NonNullable<Awaited<ReturnType<typeof proxy.provideHover>>>> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const hover = await proxy.provideHover({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 7 },
    });
    const value = normalizeLuaHoverForSnapshot(hover)?.contents.value ?? null;

    if (hover && value?.includes(expectedSubstring)) {
      return hover;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for real LuaLS hover content.');
}

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
      transportUri: expect.stringContaining('/tmp/luals-hover.risulua.lua'),
      languageId: 'lua',
      rootPath: process.cwd(),
      version: 1,
      text: luaText,
    });
    const startedRuntime = await manager.start({ rootPath: process.cwd() });
    const hover = await waitForRealLuaHover(proxy, sourceUri, 'greeting');

    expect(startedRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(normalizeLuaHoverForSnapshot(hover)?.contents.value).toContain('greeting');

    const stoppedRuntime = await manager.shutdown();

    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
  }, 30_000);
});
