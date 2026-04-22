/**
 * LuaLS companion controller façade tests.
 * @file packages/cbs-lsp/tests/controllers/luals-companion-controller.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import { createLuaLsCompanionRuntime } from '../../src/core';
import { LuaLsCompanionController } from '../../src/controllers/LuaLsCompanionController';

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
        deferredSurfaces: ['definition', 'signature'],
        liveSurfaces: ['completion', 'diagnostics', 'hover'],
        mirrorMode: 'shadow-file-workspace-and-standalone-risulua',
      },
      runtime: expect.objectContaining({
        executablePath: '/mock/luals',
        health: 'healthy',
        status: 'ready',
      }),
    });
  });
});
