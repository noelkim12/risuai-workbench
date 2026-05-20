/**
 * Opt-in real LuaLS lifecycle smoke test.
 * @file packages/cbs-lsp/tests/providers/luals-integration.test.ts
 *
 * Execution conditions:
 * - Requires real LuaLS binary at CBS_LSP_LUALS_PATH or in PATH
 * - Set CBS_LSP_RUN_LUALS_INTEGRATION=true to enable
 * - Diagnostics require shadow-file workspace + Lua.workspace.library injection
 *
 * Failure recovery:
 * - If diagnostics are empty: Check LuaLS is writing to shadow files and workspace/library config is injected
 * - If hover fails: Check transport connection and shadow file mapping
 * - See docs/LUALS_COMPANION.md and docs/TROUBLESHOOTING.md for detailed recovery steps
 */

import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { CompletionItem, Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createLuaLsCompanionController } from '../../src/controllers/LuaLsCompanionController';
import {
  createLuaLsProcessManager,
  resolveLuaLsExecutablePathSync,
  type LuaLsPublishDiagnosticsEvent,
} from '../../src/providers/lua/lualsProcess';
import { createLuaLsProxy, normalizeLuaHoverForSnapshot } from '../../src/providers/lua/lualsProxy';
import { getCompletionItems, positionAt } from '../helpers/lsp-test-utils';

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
  proxy: Pick<ReturnType<typeof createLuaLsProxy>, 'provideHover'>,
  sourceUri: string,
  position: { character: number; line: number },
  expectedSubstrings: readonly string[],
): Promise<NonNullable<Awaited<ReturnType<typeof proxy.provideHover>>>> {
  const deadline = Date.now() + 20_000;
  let lastValue: string | null = null;

  while (Date.now() < deadline) {
    const hover = await proxy.provideHover({
      textDocument: { uri: sourceUri },
      position,
    });
    const value = normalizeLuaHoverForSnapshot(hover)?.contents.value ?? null;
    lastValue = value;

    if (hover && value && expectedSubstrings.every((substring) => value.includes(substring))) {
      return hover;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for real LuaLS hover content. Last value: ${lastValue ?? 'null'}`);
}

/**
 * waitForRealLuaCompletion 함수.
 * LuaLS가 generated runtime stub 기반 completion 후보를 돌려줄 때까지 재시도함.
 *
 * @param proxy - real LuaLS completion proxy
 * @param sourceUri - completion 대상 `.risulua` source URI
 * @param position - completion 요청 위치
 * @param predicate - completion item 배열이 만족해야 할 조건
 * @returns predicate를 만족한 completion item 배열
 */
async function waitForRealLuaCompletion(
  proxy: Pick<ReturnType<typeof createLuaLsProxy>, 'provideCompletion'>,
  sourceUri: string,
  position: { character: number; line: number },
  predicate: (items: readonly CompletionItem[]) => boolean,
): Promise<readonly CompletionItem[]> {
  const deadline = Date.now() + 20_000;
  let lastLabels: readonly string[] = [];

  while (Date.now() < deadline) {
    const completion = await proxy.provideCompletion({
      textDocument: { uri: sourceUri },
      position,
    });
    const items = getCompletionItems(completion);
    lastLabels = items.map((item) => item.label);

    if (predicate(items)) {
      return items;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for real LuaLS completion items from generated RisuAI stubs. ` +
      `Last labels: ${lastLabels.join(', ') || '(none)'}`,
  );
}

/**
 * waitForDiagnostics 함수.
 * LuaLS가 non-empty diagnostics를 방출할 때까지 재시도함.
 * shadow-file + workspace/library 구현 이후 검증 가능.
 *
 * @param manager - LuaLS process manager
 * @param sourceUri - diagnostics 대상 `.risulua` source URI
 * @param predicate - diagnostics 배열이 만족해야 할 조건 (기본: non-empty)
 * @returns 실제 diagnostics payload
 */
async function waitForDiagnostics(
  manager: ReturnType<typeof createLuaLsProcessManager>,
  sourceUri: string,
  predicate: (diagnostics: readonly Diagnostic[]) => boolean = (diagnostics) => diagnostics.length > 0,
): Promise<LuaLsPublishDiagnosticsEvent> {
  const deadline = Date.now() + 20_000;
  const receivedEvents: LuaLsPublishDiagnosticsEvent[] = [];
  let received = false;

  const unsubscribe = manager.onPublishDiagnostics((event) => {
    if (event.sourceUri === sourceUri) {
      receivedEvents.push(event);
      if (predicate(event.diagnostics)) {
        received = true;
      }
    }
  });

  try {
    while (Date.now() < deadline && !received) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const lastEvent = receivedEvents[receivedEvents.length - 1];
    const lastDiagnosticCount = lastEvent?.diagnostics.length;
    if (!received || !lastEvent) {
      throw new Error(
        `Timed out waiting for real LuaLS diagnostics. ` +
          `Last received: ${lastDiagnosticCount === undefined ? 'none' : `${lastDiagnosticCount} diagnostics`}. ` +
          `Ensure shadow-file workspace is configured and Lua.workspace.library includes shadow root.`,
      );
    }

    return lastEvent;
  } finally {
    unsubscribe();
  }
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
    const hover = await waitForRealLuaHover(proxy, sourceUri, positionAt(luaText, 'greeting', 2), ['greeting']);

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

  it('receives non-empty diagnostics from real LuaLS via shadow-file workspace', async () => {
    const manager = createLuaLsProcessManager({
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => RESOLVED_LUALS_PATH,
      shutdownTimeoutMs: 5_000,
    });
    const sourceUri = 'file:///tmp/luals-diagnostics.risulua';
    const sourceFilePath = '/tmp/luals-diagnostics.risulua';
    // Intentionally problematic Lua to trigger diagnostics
    const luaTextWithIssues = 'local x = 1\nlocal x = 2\nreturn x\n';

    manager.prepareForInitialize({ rootPath: process.cwd() });
    manager.syncDocument({
      sourceUri,
      sourceFilePath,
      transportUri: expect.stringContaining('/tmp/luals-diagnostics.risulua.lua'),
      languageId: 'lua',
      rootPath: process.cwd(),
      version: 1,
      text: luaTextWithIssues,
    });

    const startedRuntime = await manager.start({ rootPath: process.cwd() });

    expect(startedRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });

    // Wait for non-empty diagnostics from LuaLS
    const diagnosticsEvent = await waitForDiagnostics(manager, sourceUri, (diagnostics) => diagnostics.length > 0);

    expect(diagnosticsEvent.diagnostics.length).toBeGreaterThan(0);
    expect(diagnosticsEvent.sourceUri).toBe(sourceUri);

    const stoppedRuntime = await manager.shutdown();

    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
  }, 30_000);

  it('surfaces generated RisuAI stub hover details for getState and getLoreBooks through the controller injection path', async () => {
    const manager = createLuaLsProcessManager({
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => RESOLVED_LUALS_PATH,
      shutdownTimeoutMs: 5_000,
    });
    const controller = createLuaLsCompanionController(manager);
    const sourceUri = 'file:///tmp/luals-risu-stub-hover.risulua';
    const luaText = [
      'local mood = getState("character", "mood")',
      'local books = getLoreBooks("character", "hero")',
      'return mood, books',
      '',
    ].join('\n');

    manager.prepareForInitialize({ rootPath: process.cwd() });
    controller.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 1, luaText));
    const startedRuntime = await controller.start(process.cwd());
    controller.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 2, luaText));
    const getStateHover = await waitForRealLuaHover(
      controller,
      sourceUri,
      positionAt(luaText, 'getState', 3),
      ['getState', 'id', 'name'],
    );
    const getLoreBooksHover = await waitForRealLuaHover(
      controller,
      sourceUri,
      positionAt(luaText, 'getLoreBooks', 3),
      ['getLoreBooks', 'RisuLoreBook'],
    );

    expect(startedRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(normalizeLuaHoverForSnapshot(getStateHover)?.contents.value).toContain('getState');
    expect(normalizeLuaHoverForSnapshot(getStateHover)?.contents.value).toContain('name');
    expect(normalizeLuaHoverForSnapshot(getLoreBooksHover)?.contents.value).toContain('getLoreBooks');
    expect(normalizeLuaHoverForSnapshot(getLoreBooksHover)?.contents.value).toContain(
      'RisuLoreBook',
    );

    const stoppedRuntime = await controller.shutdown();

    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
  }, 30_000);

  it('surfaces generated RisuAI stub completion entries for getState and getLoreBooks through the controller injection path', async () => {
    const manager = createLuaLsProcessManager({
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => RESOLVED_LUALS_PATH,
      shutdownTimeoutMs: 5_000,
    });
    const controller = createLuaLsCompanionController(manager);
    const sourceUri = 'file:///tmp/luals-risu-stub-completion.risulua';
    const luaText = 'local runtimeValue = get\n';

    manager.prepareForInitialize({ rootPath: process.cwd() });
    controller.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 1, luaText));
    const startedRuntime = await controller.start(process.cwd());
    controller.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 2, luaText));
    const completionItems = await waitForRealLuaCompletion(
      controller,
      sourceUri,
      positionAt(luaText, 'get', 3),
      (items) =>
        items.some((item) => item.label.startsWith('getState')) &&
        items.some((item) => item.label.startsWith('getLoreBooks')),
    );

    expect(startedRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(completionItems.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^getState\(/u),
        expect.stringMatching(/^getLoreBooks\(/u),
      ]),
    );

    const stoppedRuntime = await controller.shutdown();

    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
  }, 30_000);
});
