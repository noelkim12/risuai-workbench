/**
 * LuaLS hover proxy seam tests.
 * @file packages/cbs-lsp/tests/providers/luals-proxy.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import { createLuaLsCompanionRuntime } from '../../src/core';
import {
  createLuaLsProxy,
  normalizeLuaHoverEnvelopeForSnapshot,
  type LuaLsUriRemapResolver,
} from '../../src/providers/lua/lualsProxy';
import { createLuaLsShadowDocumentUri } from '../../src/providers/lua/lualsShadowWorkspace';

function createUriRemapResolver(entries: readonly (readonly [string, string])[]): LuaLsUriRemapResolver {
  const transportToSourceUri = new Map(entries);
  return {
    getTransportToSourceUriEntries: () => transportToSourceUri.entries(),
    resolveSourceUriFromTransportUri: (uri) => transportToSourceUri.get(uri) ?? null,
  };
}

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

  it('maps cross-file definition and references through the workspace-wide URI resolver', async () => {
    const sourceUri = 'file:///workspace/lua/companion.risulua';
    const otherSourceUri = 'file:///workspace/lua/shared.risulua';
    const otherTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/shared.risulua');
    const request = async <TResult>(method: string): Promise<TResult | null> => {
      if (method === 'textDocument/references') {
        return [
          {
            uri: otherTransportUri,
            range: {
              start: { line: 2, character: 4 },
              end: { line: 2, character: 10 },
            },
          },
        ] as TResult;
      }

      return [
        {
          uri: otherTransportUri,
          range: {
            start: { line: 1, character: 6 },
            end: { line: 1, character: 12 },
          },
        },
      ] as TResult;
    };
    const proxy = createLuaLsProxy(
      {
        getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
        request,
      },
      {
        uriRemapResolver: createUriRemapResolver([[otherTransportUri, otherSourceUri]]),
      },
    );

    const definition = await proxy.provideDefinition({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 8 },
    });
    const references = await proxy.provideReferences({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 8 },
      context: { includeDeclaration: true },
    });

    expect(definition).toEqual([
      {
        uri: otherSourceUri,
        range: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 12 },
        },
      },
    ]);
    expect(references).toEqual([
      {
        uri: otherSourceUri,
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 10 },
        },
      },
    ]);
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

  it('maps cross-file rename edits and merges changes keys that resolve to the same source URI', async () => {
    const sourceUri = 'file:///workspace/lua/companion.risulua';
    const sourceTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/companion.risulua');
    const otherSourceUri = 'file:///workspace/lua/shared.risulua';
    const otherTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/shared.risulua');
    const request = async <TResult>(): Promise<TResult | null> => ({
      changes: {
        [sourceTransportUri]: [
          {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 13 },
            },
            newText: 'renamedLocal',
          },
        ],
        [otherTransportUri]: [
          {
            range: {
              start: { line: 1, character: 4 },
              end: { line: 1, character: 11 },
            },
            newText: 'renamedRemote',
          },
        ],
        [otherSourceUri]: [
          {
            range: {
              start: { line: 2, character: 4 },
              end: { line: 2, character: 11 },
            },
            newText: 'renamedAlreadySource',
          },
        ],
      },
      documentChanges: [
        {
          textDocument: { uri: otherTransportUri, version: null },
          edits: [],
        },
        {
          kind: 'rename',
          oldUri: otherTransportUri,
          newUri: sourceTransportUri,
        },
      ],
    }) as TResult;
    const proxy = createLuaLsProxy(
      {
        getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
        request,
      },
      {
        uriRemapResolver: createUriRemapResolver([[otherTransportUri, otherSourceUri]]),
      },
    );

    const edit = await proxy.provideRename({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 8 },
      newName: 'renamed',
    });

    expect(edit?.changes?.[sourceUri]).toEqual([
      {
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        newText: 'renamedLocal',
      },
    ]);
    expect(edit?.changes?.[otherSourceUri]).toEqual([
      {
        range: {
          start: { line: 1, character: 4 },
          end: { line: 1, character: 11 },
        },
        newText: 'renamedRemote',
      },
      {
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 11 },
        },
        newText: 'renamedAlreadySource',
      },
    ]);
    expect(edit?.documentChanges).toEqual([
      {
        textDocument: { uri: otherSourceUri, version: null },
        edits: [],
      },
      {
        kind: 'rename',
        oldUri: otherSourceUri,
        newUri: sourceUri,
      },
    ]);
  });

  it('remaps hover and completion display text without touching completion data', async () => {
    const sourceUri = 'file:///workspace/lua/companion.risulua';
    const otherSourceUri = 'file:///workspace/lua/shared.risulua';
    const otherTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/shared.risulua');
    const opaqueData = { uri: otherTransportUri, serverToken: 'keep-shadow-uri' };
    const request = async <TResult>(method: string): Promise<TResult | null> => {
      if (method === 'textDocument/hover') {
        return {
          contents: {
            kind: 'markdown',
            value: `[shared](${otherTransportUri})`,
          },
        } as TResult;
      }

      return {
        isIncomplete: false,
        items: [
          {
            label: 'sharedCall',
            detail: `defined at ${otherTransportUri}`,
            documentation: {
              kind: 'markdown',
              value: `[shared](${otherTransportUri})`,
            },
            data: opaqueData,
          },
        ],
      } as TResult;
    };
    const proxy = createLuaLsProxy(
      {
        getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
        request,
      },
      {
        uriRemapResolver: createUriRemapResolver([[otherTransportUri, otherSourceUri]]),
      },
    );

    const hover = await proxy.provideHover({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 8 },
    });
    const completion = await proxy.provideCompletion({
      textDocument: { uri: sourceUri },
      position: { line: 0, character: 8 },
    });

    expect(hover).toEqual({
      contents: {
        kind: 'markdown',
        value: `[shared](${otherSourceUri})`,
      },
    });
    expect(completion).toEqual({
      isIncomplete: false,
      items: [
        {
          label: 'sharedCall',
          detail: `defined at ${otherSourceUri}`,
          documentation: {
            kind: 'markdown',
            value: `[shared](${otherSourceUri})`,
          },
          data: opaqueData,
        },
      ],
    });
  });

  it('proxies Lua references, document highlights, document symbols, and signature help for risulua mirrors', async () => {
    const requestSpy = vi.fn();
    const request = async <TResult>(method: string, params: unknown): Promise<TResult | null> => {
      requestSpy(method, params);
      const transportUri = (params as { textDocument: { uri: string } }).textDocument.uri;
      if (method === 'textDocument/references') {
        return [
          {
            uri: transportUri,
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 13 },
            },
          },
        ] as TResult;
      }

      if (method === 'textDocument/documentHighlight') {
        return [
          {
            range: {
              start: { line: 1, character: 7 },
              end: { line: 1, character: 14 },
            },
          },
        ] as TResult;
      }

      if (method === 'textDocument/documentSymbol') {
        return [
          {
            name: 'greeting',
            kind: 12,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 1, character: 14 },
            },
            selectionRange: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 14 },
            },
          },
        ] as TResult;
      }

      return {
        activeParameter: 0,
        activeSignature: 0,
        signatures: [{ label: 'print(value)' }],
      } as TResult;
    };
    const proxy = createLuaLsProxy({
      getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
      request,
    });
    const textDocument = { uri: 'file:///workspace/lua/companion.risulua' };
    const position = { line: 1, character: 9 };

    const references = await proxy.provideReferences({ textDocument, position, context: { includeDeclaration: true } });
    const highlights = await proxy.provideDocumentHighlight({ textDocument, position });
    const symbols = await proxy.provideDocumentSymbol({ textDocument });
    const signature = await proxy.provideSignatureHelp({ textDocument, position });

    expect(references).toEqual([
      {
        uri: 'file:///workspace/lua/companion.risulua',
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
      },
    ]);
    expect(highlights).toEqual([
      {
        range: {
          start: { line: 1, character: 7 },
          end: { line: 1, character: 14 },
        },
      },
    ]);
    expect(symbols).toHaveLength(1);
    expect(signature).toEqual({
      activeParameter: 0,
      activeSignature: 0,
      signatures: [{ label: 'print(value)' }],
    });
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/references',
      expect.objectContaining({
        textDocument: { uri: expect.stringContaining('/workspace/lua/companion.risulua.lua') },
      }),
    );
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/documentHighlight',
      expect.objectContaining({
        textDocument: { uri: expect.stringContaining('/workspace/lua/companion.risulua.lua') },
      }),
    );
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/documentSymbol',
      expect.objectContaining({
        textDocument: { uri: expect.stringContaining('/workspace/lua/companion.risulua.lua') },
      }),
    );
    expect(requestSpy).toHaveBeenCalledWith(
      'textDocument/signatureHelp',
      expect.objectContaining({
        textDocument: { uri: expect.stringContaining('/workspace/lua/companion.risulua.lua') },
      }),
    );
  });

  it('maps SymbolInformation documentSymbol locations through the URI resolver', async () => {
    const sourceUri = 'file:///workspace/lua/companion.risulua';
    const otherSourceUri = 'file:///workspace/lua/shared.risulua';
    const otherTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/shared.risulua');
    const request = async <TResult>(): Promise<TResult | null> => [
      {
        name: 'sharedSymbol',
        kind: 12,
        location: {
          uri: otherTransportUri,
          range: {
            start: { line: 3, character: 2 },
            end: { line: 3, character: 14 },
          },
        },
      },
    ] as TResult;
    const proxy = createLuaLsProxy(
      {
        getRuntime: () => createLuaLsCompanionRuntime({ status: 'ready', health: 'healthy' }),
        request,
      },
      {
        uriRemapResolver: createUriRemapResolver([[otherTransportUri, otherSourceUri]]),
      },
    );

    const symbols = await proxy.provideDocumentSymbol({ textDocument: { uri: sourceUri } });

    expect(symbols).toEqual([
      {
        name: 'sharedSymbol',
        kind: 12,
        location: {
          uri: otherSourceUri,
          range: {
            start: { line: 3, character: 2 },
            end: { line: 3, character: 14 },
          },
        },
      },
    ]);
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
