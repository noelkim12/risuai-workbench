/**
 * LuaLS companion controller façade tests.
 * @file packages/cbs-lsp/tests/controllers/luals-companion-controller.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';

import { createLuaLsCompanionRuntime } from '../../src/core';
import { LuaLsCompanionController } from '../../src/controllers/LuaLsCompanionController';
import { createRisuAiLuaTypeStubWorkspace } from '../../src/providers/lua/typeStubs';

describe('LuaLsCompanionController', () => {
  it('reports subsystem status with live/deferred surfaces and restart policy', () => {
    const controller = new LuaLsCompanionController({
      getRestartPolicy: vi.fn(() => ({
        attemptsRemaining: 2,
        lastStartRootPath: '/workspace',
        maxAttempts: 2,
        mode: 'automatic-on-crash',
        nextDelayMs: null,
      })),
      getRuntime: vi.fn(() =>
        createLuaLsCompanionRuntime({
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      ),
      prepareForInitialize: vi.fn(),
      onPublishDiagnostics: vi.fn(() => () => undefined),
      request: vi.fn(async () => null),
      restart: vi.fn(async () => createLuaLsCompanionRuntime()),
      shutdown: vi.fn(async () => createLuaLsCompanionRuntime()),
      start: vi.fn(async () => createLuaLsCompanionRuntime()),
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    } as any);

    expect(controller.getSubsystemStatus()).toEqual({
      restartPolicy: {
        attemptsRemaining: 2,
        lastStartRootPath: '/workspace',
        maxAttempts: 2,
        mode: 'automatic-on-crash',
        nextDelayMs: null,
      },
      routing: {
        deferredSurfaces: ['signature'],
        liveSurfaces: ['completion', 'definition', 'diagnostics', 'hover', 'rename'],
        mirrorMode: 'shadow-file-workspace-and-standalone-risulua',
      },
      runtime: expect.objectContaining({
        executablePath: '/mock/luals',
        health: 'healthy',
        status: 'ready',
      }),
    });
  });

  it('injects and mirrors the generated RisuAI stub file into start, restart, and refresh calls', async () => {
    const stubWorkspace = createRisuAiLuaTypeStubWorkspace('/tmp/cbs-lsp-risu-stubs-controller-test');
    const processManager = {
      closeDocument: vi.fn(),
      getRestartPolicy: vi.fn(() => ({
        attemptsRemaining: 0,
        lastStartRootPath: '/workspace',
        maxAttempts: 2,
        mode: 'automatic-on-crash',
        nextDelayMs: null,
      })),
      getRuntime: vi.fn(() => createLuaLsCompanionRuntime()),
      onPublishDiagnostics: vi.fn(() => () => undefined),
      prepareForInitialize: vi.fn(),
      refreshWorkspaceConfiguration: vi.fn(),
      request: vi.fn(async () => null),
      restart: vi.fn(async () => createLuaLsCompanionRuntime()),
      shutdown: vi.fn(async () => createLuaLsCompanionRuntime()),
      start: vi.fn(async () => createLuaLsCompanionRuntime()),
      syncDocument: vi.fn(),
    } as any;
    const controller = new LuaLsCompanionController(processManager, stubWorkspace);

    await controller.start('/workspace');
    await controller.restart({ rootPath: '/workspace', stubRootPaths: ['/workspace/vendor/luals'] });
    controller.refreshWorkspaceConfiguration({ rootPath: '/workspace' });

    expect(processManager.start).toHaveBeenCalledWith({
      rootPath: '/workspace',
      stubRootPaths: [stubWorkspace.getRuntimeStubFilePath()],
    });
    expect(processManager.restart).toHaveBeenCalledWith({
      rootPath: '/workspace',
      stubRootPaths: [stubWorkspace.getRuntimeStubFilePath(), '/workspace/vendor/luals'],
    });
    expect(processManager.refreshWorkspaceConfiguration).toHaveBeenCalledWith({
      rootPath: '/workspace',
      stubRootPaths: [stubWorkspace.getRuntimeStubFilePath()],
    });
    expect(processManager.syncDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFilePath: stubWorkspace.getRuntimeStubFilePath(),
        sourceUri: pathToFileURL(stubWorkspace.getRuntimeStubFilePath()).href,
        text: stubWorkspace.getRuntimeStubContents(),
      }),
    );
  });
});
