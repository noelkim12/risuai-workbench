/**
 * LuaLS hover proxy seam tests.
 * @file packages/cbs-lsp/tests/providers/luals-proxy.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import { createLuaLsCompanionRuntime } from '../../src/core';
import {
  createLuaLsProxy,
  normalizeLuaHoverEnvelopeForSnapshot,
} from '../../src/providers/lua/lualsProxy';

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
          uri: expect.stringContaining('/workspace/lua/companion.risulua.lua'),
        },
        position: {
          line: 0,
          character: 7,
        },
      },
      1500,
    );
  });

  it('rewrites source URIs to mirrored Lua transport URIs for completion requests', async () => {
    const requestSpy = vi.fn();
    const request = async <TResult>(
      method: string,
      params: unknown,
      timeoutMs?: number,
    ): Promise<TResult | null> => {
      requestSpy(method, params, timeoutMs);
      return {
        isIncomplete: false,
        items: [{ label: 'getState', kind: 3 }],
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

    const completion = await proxy.provideCompletion({
      textDocument: {
        uri: 'file:///workspace/lua/companion.risulua',
      },
      position: {
        line: 0,
        character: 7,
      },
    });

    expect(completion).toEqual({
      isIncomplete: false,
      items: [{ label: 'getState', kind: 3 }],
    });
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/completion',
      {
        textDocument: {
          uri: expect.stringContaining('/workspace/lua/companion.risulua.lua'),
        },
        position: {
          line: 0,
          character: 7,
        },
      },
      1500,
    );
  });

  it('rewrites source URIs to mirrored Lua transport URIs and maps definition results back', async () => {
    const requestSpy = vi.fn();
    const request = async <TResult>(
      method: string,
      params: unknown,
      timeoutMs?: number,
    ): Promise<TResult | null> => {
      requestSpy(method, params, timeoutMs);
      const transportUri = (params as { textDocument: { uri: string } }).textDocument.uri;
      return [{
        uri: transportUri,
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
      }] as TResult;
    };
    const proxy = createLuaLsProxy({
      getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
      request,
    });

    const definition = await proxy.provideDefinition({
      textDocument: { uri: 'file:///workspace/lua/companion.risulua' },
      position: { line: 1, character: 9 },
    });

    expect(definition).toEqual([
      {
        uri: 'file:///workspace/lua/companion.risulua',
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
      },
    ]);
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/definition',
      {
        textDocument: {
          uri: expect.stringContaining('/workspace/lua/companion.risulua.lua'),
        },
        position: { line: 1, character: 9 },
      },
      1500,
    );
  });

  it('maps LuaLS rename workspace edits from shadow URI back to source URI', async () => {
    const request = async <TResult>(
      _method: string,
      params: unknown,
    ): Promise<TResult | null> => {
      const transportUri = (params as { textDocument: { uri: string } }).textDocument.uri;
      return {
        documentChanges: [
          {
            textDocument: { uri: transportUri, version: null },
            edits: [
              {
                range: {
                  start: { line: 0, character: 6 },
                  end: { line: 0, character: 13 },
                },
                newText: 'renamed',
              },
            ],
          },
        ],
      } as TResult;
    };
    const proxy = createLuaLsProxy({
      getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
      request,
    });

    const edit = await proxy.provideRename({
      textDocument: { uri: 'file:///workspace/lua/companion.risulua' },
      position: { line: 0, character: 8 },
      newName: 'renamed',
    });

    expect(edit).toEqual({
      documentChanges: [
        {
          textDocument: { uri: 'file:///workspace/lua/companion.risulua', version: null },
          edits: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 13 },
              },
              newText: 'renamed',
            },
          ],
        },
      ],
    });
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

  it('builds a stable normalized snapshot envelope for live and unavailable Lua hover states', () => {
    const readyRuntime = createLuaLsCompanionRuntime({
      detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
      executablePath: '/mock/luals',
      health: 'healthy',
      status: 'ready',
    });

    expect(
      normalizeLuaHoverEnvelopeForSnapshot(
        {
          contents: {
            kind: 'markdown',
            value: '```lua\nlocal user: string\n```',
          },
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 10 },
          },
        },
        readyRuntime,
      ),
    ).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        companions: [readyRuntime],
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'luaHover',
            scope: 'local-only',
            source: 'lua-provider:hover-proxy',
          }),
          expect.objectContaining({
            key: 'lua-completion',
            scope: 'local-only',
            source: 'lua-provider:completion-proxy',
          }),
          expect.objectContaining({
            key: 'lua-diagnostics',
            scope: 'local-only',
            source: 'lua-provider:diagnostics-proxy',
          }),
        ]),
      }),
      hover: {
        contents: {
          kind: 'markdown',
          value: '```lua\nlocal user: string\n```',
        },
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
      },
      provenance: {
        reason: 'contextual-inference',
        source: 'lua-provider:hover-proxy',
        detail:
          'Lua hover snapshots normalize live LuaLS hover responses from mirrored `.risulua` documents, preserve range/content deterministically, and keep deferred Lua completion/diagnostics boundaries visible through the shared availability envelope.',
      },
    });

    expect(normalizeLuaHoverEnvelopeForSnapshot(null)).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({
          companions: [
            expect.objectContaining({
              health: 'unavailable',
              status: 'unavailable',
            }),
          ],
        }),
        hover: null,
      }),
    );
  });
});
