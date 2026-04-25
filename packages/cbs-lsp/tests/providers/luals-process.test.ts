/**
 * LuaLS sidecar process manager contract tests.
 * @file packages/cbs-lsp/tests/providers/luals-process.test.ts
 */

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';

import type { Diagnostic } from 'vscode-languageserver/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LUALS_EXECUTABLE_CANDIDATES,
  createLuaLsProcessManager,
  type LuaLsPublishDiagnosticsEvent,
  resolveLuaLsExecutablePathSync,
  type LuaLsProcessEvent,
  type LuaLsSpawnedProcess,
  type LuaLsTransportNotificationHandler,
  type LuaLsTransport,
} from '../../src/providers/lua/lualsProcess';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../../src/indexer';
import type { LuaLsRoutedDocument } from '../../src/providers/lua/lualsDocuments';
import {
  createLuaLsShadowDocumentUri,
  createLuaLsShadowWorkspace,
} from '../../src/providers/lua/lualsShadowWorkspace';
import { createLuaLsWorkspaceConfiguration } from '../../src/providers/lua/lualsWorkspace';

class FakeLuaLsChildProcess extends EventEmitter {
  exitCode: number | null = null;

  killed = false;

  pid = 43110;

  readonly stderr = new PassThrough();

  readonly stdin = new PassThrough();

  readonly stdout = new PassThrough();

  kill(): boolean {
    this.killed = true;
    this.exitCode = this.exitCode ?? 0;
    this.emit('exit', this.exitCode, null);
    return true;
  }

  emitCrash(code: number): void {
    this.exitCode = code;
    this.emit('exit', code, null);
  }
}

class FakeLuaLsTransport implements LuaLsTransport {
  private notificationHandler: LuaLsTransportNotificationHandler = () => undefined;

  readonly notifications: Array<{ method: string; params: unknown }> = [];

  readonly requests: Array<{ method: string; params: unknown }> = [];

  constructor(private readonly requestHandler: (method: string, params: unknown) => Promise<unknown>) {}

  dispose(): void {
    return undefined;
  }

  notify(method: string, params: unknown): void {
    this.notifications.push({ method, params });
  }

  onNotification(handler: LuaLsTransportNotificationHandler): void {
    this.notificationHandler = handler;
  }

  request<TResult>(method: string, params: unknown): Promise<TResult> {
    this.requests.push({ method, params });
    return this.requestHandler(method, params) as Promise<TResult>;
  }

  emitNotification(method: string, params: unknown): void {
    this.notificationHandler({ method, params });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SHADOW_ROOT = mkdtempSync(path.join(tmpdir(), 'cbs-lsp-test-shadow-'));

function createLuaLsRoutedDocument(
  overrides: Partial<LuaLsRoutedDocument> = {},
): LuaLsRoutedDocument {
  const sourceFilePath = '/workspace/lua/companion.risulua';
  return {
    sourceUri: 'file:///workspace/lua/companion.risulua',
    sourceFilePath,
    transportUri: createLuaLsShadowDocumentUri(sourceFilePath, SHADOW_ROOT),
    languageId: 'lua',
    rootPath: '/workspace',
    version: 1,
    text: 'local mood = getState("mood")\n',
    ...overrides,
  };
}

describe('LuaLsProcessManager', () => {
  it('resolves override paths before PATH candidates', () => {
    const resolved = resolveLuaLsExecutablePathSync({
      cwd: '/workspace',
      env: {
        PATH: '/usr/local/bin:/usr/bin',
      },
      exists: (filePath) => filePath === '/workspace/tools/lua-language-server',
      overrideExecutablePath: './tools/lua-language-server',
    });

    expect(resolved).toBe('/workspace/tools/lua-language-server');
  });

  it('falls back to unavailable when no executable is discoverable', () => {
    const events: LuaLsProcessEvent[] = [];
    const manager = createLuaLsProcessManager({
      onEvent: (event) => {
        events.push(event);
      },
      resolveExecutablePath: () => null,
    });

    const runtime = manager.prepareForInitialize();

    expect(runtime).toMatchObject({
      executablePath: null,
      health: 'unavailable',
      status: 'unavailable',
    });
    expect(runtime.detail).toContain('--luals-path');
    expect(runtime.detail).toContain('lua-language-server');
    expect(events.at(-1)?.type).toBe('unavailable');
  });

  it('exports the default PATH candidates used by the compatibility contract', () => {
    expect(DEFAULT_LUALS_EXECUTABLE_CANDIDATES).toEqual([
      'lua-language-server',
      'lua-language-server.exe',
    ]);
  });

  it('spawns, initializes, health-checks, and shuts down through a mock transport', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const fakeTransport = new FakeLuaLsTransport(async (method) => {
      if (method === 'initialize') {
        return { capabilities: {} };
      }

      if (method === 'shutdown') {
        fakeChild.kill();
        return null;
      }

      throw new Error(`Unexpected request: ${method}`);
    });
    const events: LuaLsProcessEvent[] = [];
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => fakeTransport,
      },
      healthCheckIntervalMs: 60_000,
      onEvent: (event) => {
        events.push(event);
      },
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      shutdownTimeoutMs: 50,
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });

    manager.prepareForInitialize({ rootPath: '/workspace' });
    const startedRuntime = await manager.start({ rootPath: '/workspace' });
    const healthyRuntime = manager.checkHealth();
    const stoppedRuntime = await manager.shutdown();

    expect(startedRuntime).toMatchObject({
      executablePath: '/mock/bin/lua-language-server',
      health: 'healthy',
      status: 'ready',
    });
    expect(healthyRuntime).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(stoppedRuntime).toMatchObject({
      health: 'idle',
      status: 'stopped',
    });
    expect(fakeTransport.requests.map((entry) => entry.method)).toEqual(['initialize', 'shutdown']);
    expect(fakeTransport.notifications.map((entry) => entry.method)).toEqual([
      'initialized',
      'workspace/didChangeConfiguration',
      'exit',
    ]);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'prepared',
        'spawn-start',
        'spawned',
        'initialize-start',
        'initialized',
        'health-check',
        'shutdown-start',
        'shutdown-end',
      ]),
    );
  });

  it('marks the runtime as crashed when the sidecar exits unexpectedly', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => new FakeLuaLsTransport(async () => ({ capabilities: {} })),
      },
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });

    manager.prepareForInitialize();
    await manager.start({ rootPath: '/workspace' });
    fakeChild.emitCrash(9);

    expect(manager.getRuntime()).toMatchObject({
      health: 'degraded',
      status: 'crashed',
    });
  });

  it('schedules a bounded automatic restart after unexpected crashes', async () => {
    vi.useFakeTimers();

    const firstChild = new FakeLuaLsChildProcess();
    const secondChild = new FakeLuaLsChildProcess();
    const spawnedChildren = [firstChild, secondChild];
    const events: LuaLsProcessEvent[] = [];
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => new FakeLuaLsTransport(async () => ({ capabilities: {} })),
      },
      onEvent: (event) => {
        events.push(event);
      },
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      restartBackoffMs: [25],
      spawnProcess: () => spawnedChildren.shift() as unknown as LuaLsSpawnedProcess,
    });

    manager.prepareForInitialize({ rootPath: '/workspace' });
    await manager.start({ rootPath: '/workspace' });
    firstChild.emitCrash(9);

    expect(manager.getRuntime()).toMatchObject({
      health: 'degraded',
      status: 'crashed',
    });
    expect(manager.getRestartPolicy()).toEqual({
      attemptsRemaining: 0,
      lastStartRootPath: '/workspace',
      maxAttempts: 1,
      mode: 'automatic-on-crash',
      nextDelayMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['crashed', 'restart-scheduled', 'restart-attempt', 'initialized']),
    );
    expect(manager.getRuntime()).toMatchObject({
      health: 'healthy',
      status: 'ready',
    });
    expect(manager.getRuntime().detail).toContain('automatic restart attempt');
  });

  it('flushes queued Lua document mirrors on startup and forwards didChange/didClose notifications', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const fakeTransport = new FakeLuaLsTransport(async (method) => {
      if (method === 'initialize') {
        return { capabilities: {} };
      }

      if (method === 'shutdown') {
        fakeChild.kill();
        return null;
      }

      throw new Error(`Unexpected request: ${method}`);
    });
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => fakeTransport,
      },
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      shutdownTimeoutMs: 50,
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });
    const openedDocument = createLuaLsRoutedDocument();
    const changedDocument = createLuaLsRoutedDocument({
      text: 'local mood = getState("nextMood")\n',
      version: 2,
    });
    const shadowTransportUri = createLuaLsShadowDocumentUri(
      openedDocument.sourceFilePath,
      SHADOW_ROOT,
    );

    manager.prepareForInitialize({ rootPath: '/workspace' });
    manager.syncDocument(openedDocument);
    await manager.start({ rootPath: '/workspace' });
    manager.syncDocument(changedDocument);
    manager.closeDocument(openedDocument.sourceUri);
    await manager.shutdown();

    expect(fakeTransport.notifications.map((entry) => entry.method)).toEqual([
      'initialized',
      'workspace/didChangeConfiguration',
      'textDocument/didOpen',
      'textDocument/didChange',
      'textDocument/didClose',
      'exit',
    ]);
    expect(fakeTransport.notifications[1]).toEqual({
      method: 'workspace/didChangeConfiguration',
      params: createLuaLsWorkspaceConfiguration({
        diagnosticsEnableSchemes: ['file', 'risu-luals'],
        rootPath: '/workspace',
        shadowRootPath: SHADOW_ROOT,
      }),
    });
    expect(fakeTransport.notifications[2]).toEqual({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: shadowTransportUri,
          languageId: 'lua',
          version: 1,
          text: openedDocument.text,
        },
      },
    });
    expect(fakeTransport.notifications[3]).toEqual({
      method: 'textDocument/didChange',
      params: {
        textDocument: {
          uri: shadowTransportUri,
          version: 2,
        },
        contentChanges: [
          {
            text: changedDocument.text,
          },
        ],
      },
    });
    expect(fakeTransport.notifications[4]).toEqual({
      method: 'textDocument/didClose',
      params: {
        textDocument: {
          uri: shadowTransportUri,
        },
      },
    });
  });

  it('closes an existing mirror instead of writing oversized Lua text to the shadow workspace', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const fakeTransport = new FakeLuaLsTransport(async (method) => {
      if (method === 'initialize') {
        return { capabilities: {} };
      }

      throw new Error(`Unexpected request: ${method}`);
    });
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => fakeTransport,
      },
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });
    const openedDocument = createLuaLsRoutedDocument();
    const oversizedDocument = createLuaLsRoutedDocument({
      text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
      version: 2,
    });
    const shadowTransportUri = createLuaLsShadowDocumentUri(
      openedDocument.sourceFilePath,
      SHADOW_ROOT,
    );

    manager.prepareForInitialize({ rootPath: '/workspace' });
    manager.syncDocument(openedDocument);
    await manager.start({ rootPath: '/workspace' });
    manager.syncDocument(oversizedDocument);

    expect(fakeTransport.notifications.map((entry) => entry.method)).toEqual([
      'initialized',
      'workspace/didChangeConfiguration',
      'textDocument/didOpen',
      'textDocument/didClose',
    ]);
    expect(fakeTransport.notifications[3]).toEqual({
      method: 'textDocument/didClose',
      params: {
        textDocument: {
          uri: shadowTransportUri,
        },
      },
    });
  });

  it('maps LuaLS diagnostics notifications back to source URIs and clears them after crashes', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const fakeTransport = new FakeLuaLsTransport(async (method) => {
      if (method === 'initialize') {
        return { capabilities: {} };
      }

      throw new Error(`Unexpected request: ${method}`);
    });
    const published: LuaLsPublishDiagnosticsEvent[] = [];
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => fakeTransport,
      },
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });
    const openedDocument = createLuaLsRoutedDocument();
    const shadowTransportUri = createLuaLsShadowDocumentUri(
      openedDocument.sourceFilePath,
      SHADOW_ROOT,
    );
    const diagnostics: Diagnostic[] = [
      {
        message: 'Undefined global `missingValue`',
        range: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 25 },
        },
        severity: 1,
        source: 'LuaLS',
      },
    ];

    manager.onPublishDiagnostics((event) => {
      published.push(event);
    });
    manager.prepareForInitialize({ rootPath: '/workspace' });
    manager.syncDocument(openedDocument);
    await manager.start({ rootPath: '/workspace' });

    fakeTransport.emitNotification('textDocument/publishDiagnostics', {
      uri: shadowTransportUri,
      version: 1,
      diagnostics,
    });
    fakeChild.emitCrash(9);

    expect(published).toEqual([
      {
        diagnostics,
        sourceUri: openedDocument.sourceUri,
        transportUri: shadowTransportUri,
        version: 1,
      },
      {
        diagnostics: [],
        sourceUri: openedDocument.sourceUri,
        transportUri: shadowTransportUri,
        version: 1,
      },
    ]);
  });

  it('reinjects workspace/library configuration after startup refreshes', async () => {
    const fakeChild = new FakeLuaLsChildProcess();
    const fakeTransport = new FakeLuaLsTransport(async (method) => {
      if (method === 'initialize') {
        return { capabilities: {} };
      }

      if (method === 'shutdown') {
        fakeChild.kill();
        return null;
      }

      throw new Error(`Unexpected request: ${method}`);
    });
    const manager = createLuaLsProcessManager({
      createShadowWorkspace: () => createLuaLsShadowWorkspace(SHADOW_ROOT),
      createTransport: {
        create: () => fakeTransport,
      },
      healthCheckIntervalMs: 60_000,
      resolveExecutablePath: () => '/mock/bin/lua-language-server',
      shutdownTimeoutMs: 50,
      spawnProcess: () => fakeChild as unknown as LuaLsSpawnedProcess,
    });

    manager.prepareForInitialize({ rootPath: '/workspace' });
    await manager.start({ rootPath: '/workspace' });
    manager.refreshWorkspaceConfiguration({
      rootPath: '/workspace',
      stubRootPaths: ['.generated/luals-stubs', '/workspace/vendor/luals'],
    });

    const didChangeConfigurationNotifications = fakeTransport.notifications.filter(
      (entry) => entry.method === 'workspace/didChangeConfiguration',
    );

    expect(didChangeConfigurationNotifications).toEqual([
      {
        method: 'workspace/didChangeConfiguration',
        params: createLuaLsWorkspaceConfiguration({
          diagnosticsEnableSchemes: ['file', 'risu-luals'],
          rootPath: '/workspace',
          shadowRootPath: SHADOW_ROOT,
        }),
      },
      {
        method: 'workspace/didChangeConfiguration',
        params: createLuaLsWorkspaceConfiguration({
          diagnosticsEnableSchemes: ['file', 'risu-luals'],
          rootPath: '/workspace',
          shadowRootPath: SHADOW_ROOT,
          stubRootPaths: ['.generated/luals-stubs', '/workspace/vendor/luals'],
        }),
      },
    ]);
  });
});
