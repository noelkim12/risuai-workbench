/**
 * LuaLS hover proxy seam tests.
 * @file packages/cbs-lsp/tests/providers/luals-proxy.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import { createLuaLsCompanionRuntime } from '../../src/core';
import { createLuaLsProxy } from '../../src/providers/lua/lualsProxy';

describe('LuaLsProxy', () => {
  it('rewrites source URIs to mirrored Lua transport URIs for hover requests', async () => {
    const requestSpy = vi.fn();
    const request = async <TResult>(
      method: string,
      params: unknown,
      timeoutMs?: number,
    ): Promise<TResult | null> => {
      requestSpy(method, params, timeoutMs);
      return {
        contents: {
          kind: 'markdown',
          value: '```lua\nlocal user: string\n```',
        },
      } as TResult;
    };
    const proxy = createLuaLsProxy({
      getRuntime: () =>
        createLuaLsCompanionRuntime({
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        }),
      request,
    });

    const hover = await proxy.provideHover({
      textDocument: {
        uri: 'file:///workspace/lua/companion.risulua',
      },
      position: {
        line: 0,
        character: 7,
      },
    });

    expect(hover).toEqual({
      contents: {
        kind: 'markdown',
        value: '```lua\nlocal user: string\n```',
      },
    });
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/hover',
      {
        textDocument: {
          uri: 'risu-luals:///workspace/lua/companion.risulua.lua',
        },
        position: {
          line: 0,
          character: 7,
        },
      },
      1500,
    );
  });

  it('returns null when the request is cancelled or the companion request fails', async () => {
    const requestSpy = vi.fn();
    const request = async <TResult>(): Promise<TResult | null> => {
      requestSpy();
      throw new Error('LuaLS unavailable');
    };
    const proxy = createLuaLsProxy({
      getRuntime: () => createLuaLsCompanionRuntime(),
      request,
    });

    const cancelledHover = await proxy.provideHover(
      {
        textDocument: {
          uri: 'file:///workspace/lua/companion.risulua',
        },
        position: {
          line: 0,
          character: 0,
        },
      },
      {
        isCancellationRequested: true,
        onCancellationRequested: () => ({ dispose() {} }),
      },
    );

    const failedHover = await proxy.provideHover({
      textDocument: {
        uri: 'file:///workspace/lua/companion.risulua',
      },
      position: {
        line: 0,
        character: 0,
      },
    });

    expect(cancelledHover).toBeNull();
    expect(failedHover).toBeNull();
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});
