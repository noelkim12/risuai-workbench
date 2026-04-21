/**
 * LuaLS sidecar process manager contract tests.
 * @file packages/cbs-lsp/tests/providers/luals-process.test.ts
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLuaLsProcessManager,
  resolveLuaLsExecutablePathSync,
  type LuaLsProcessEvent,
  type LuaLsSpawnedProcess,
  type LuaLsTransport,
} from '../../src/providers/lua/lualsProcess';
import type { LuaLsRoutedDocument } from '../../src/providers/lua/lualsDocuments';

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
  readonly notifications: Array<{ method: string; params: unknown }> = [];

  readonly requests: Array<{ method: string; params: unknown }> = [];

  constructor(private readonly requestHandler: (method: string, params: unknown) => Promise<unknown>) {}

  dispose(): void {
    return undefined;
  }

  notify(method: string, params: unknown): void {
    this.notifications.push({ method, params });
  }

  request<TResult>(method: string, params: unknown): Promise<TResult> {
    this.requests.push({ method, params });
    return this.requestHandler(method, params) as Promise<TResult>;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function createLuaLsRoutedDocument(
  overrides: Partial<LuaLsRoutedDocument> = {},
): LuaLsRoutedDocument {
  return {
    sourceUri: 'file:///workspace/lua/companion.risulua',
    sourceFilePath: '/workspace/lua/companion.risulua',
    transportUri: 'risu-luals:///workspace/lua/companion.risulua.lua',
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
    expect(events.at(-1)?.type).toBe('unavailable');
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
      params: {
        settings: {
          Lua: {
            diagnostics: {
              validScheme: ['file', 'risu-luals'],
            },
          },
        },
      },
    });
    expect(fakeTransport.notifications[2]).toEqual({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: openedDocument.transportUri,
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
          uri: changedDocument.transportUri,
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
          uri: openedDocument.transportUri,
        },
      },
    });
  });
});
