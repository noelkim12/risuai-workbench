/**
 * Server feature registrar request-path guard tests.
 * @file packages/cbs-lsp/tests/helpers/server-helper.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  CancellationToken,
  CompletionItem,
  CompletionParams,
  Connection,
  Definition,
  DefinitionParams,
  HoverParams,
  Range as LSPRange,
  RenameParams,
  TextDocumentPositionParams,
  WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { FragmentAnalysisRequest } from '../../src/core';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../../src/indexer';
import {
  ServerFeatureRegistrar,
  shouldSkipLuaLsProxyForRequest,
  type ServerFeatureRegistrarContext,
} from '../../src/helpers/server-helper';
import { createFragmentRequest } from '../../src/helpers/server-workspace-helper';

type CompletionHandler = (
  params: CompletionParams,
  cancellationToken?: CancellationToken,
) => CompletionItem[] | Promise<CompletionItem[]>;

type DefinitionHandler = (
  params: DefinitionParams,
  cancellationToken?: CancellationToken,
) => Definition | null | Promise<Definition | null>;

type HoverHandler = (params: HoverParams, cancellationToken?: CancellationToken) => unknown;

type PrepareRenameHandler = (
  params: TextDocumentPositionParams,
  cancellationToken?: CancellationToken,
) => LSPRange | { placeholder: string; range: LSPRange } | null | Promise<LSPRange | { placeholder: string; range: LSPRange } | null>;

type RenameHandler = (
  params: RenameParams,
  cancellationToken?: CancellationToken,
) => WorkspaceEdit | null | Promise<WorkspaceEdit | null>;

/**
 * createConnectionStub 함수.
 * completion/hover handler만 캡처하는 최소 connection stub을 만듦.
 *
 * @returns 테스트용 connection과 캡처된 handler 조회 함수
 */
function createConnectionStub(): {
  connection: Connection;
  getCompletionHandler: () => CompletionHandler;
  getDefinitionHandler: () => DefinitionHandler;
  getHoverHandler: () => HoverHandler;
  getPrepareRenameHandler: () => PrepareRenameHandler;
  getRenameHandler: () => RenameHandler;
} {
  let completionHandler: CompletionHandler | null = null;
  let definitionHandler: DefinitionHandler | null = null;
  let hoverHandler: HoverHandler | null = null;
  let prepareRenameHandler: PrepareRenameHandler | null = null;
  let renameHandler: RenameHandler | null = null;
  const connection = {
    console: {
      log: vi.fn(),
      warn: vi.fn(),
    },
    tracer: {
      log: vi.fn(),
    },
    onCompletion: vi.fn((handler: CompletionHandler) => {
      completionHandler = handler;
    }),
    onDefinition: vi.fn((handler: DefinitionHandler) => {
      definitionHandler = handler;
    }),
    onHover: vi.fn((handler: HoverHandler) => {
      hoverHandler = handler;
    }),
    onPrepareRename: vi.fn((handler: PrepareRenameHandler) => {
      prepareRenameHandler = handler;
    }),
    onRenameRequest: vi.fn((handler: RenameHandler) => {
      renameHandler = handler;
    }),
  } as unknown as Connection;

  return {
    connection,
    getCompletionHandler: () => {
      if (!completionHandler) {
        throw new Error('Completion handler was not registered.');
      }
      return completionHandler;
    },
    getDefinitionHandler: () => {
      if (!definitionHandler) {
        throw new Error('Definition handler was not registered.');
      }
      return definitionHandler;
    },
    getHoverHandler: () => {
      if (!hoverHandler) {
        throw new Error('Hover handler was not registered.');
      }
      return hoverHandler;
    },
    getPrepareRenameHandler: () => {
      if (!prepareRenameHandler) {
        throw new Error('Prepare rename handler was not registered.');
      }
      return prepareRenameHandler;
    },
    getRenameHandler: () => {
      if (!renameHandler) {
        throw new Error('Rename handler was not registered.');
      }
      return renameHandler;
    },
  };
}

/**
 * createRegistrarContext 함수.
 * oversized Lua request를 반환하는 registrar context를 구성함.
 *
 * @param request - handler가 조회할 현재 문서 request
 * @param luaLsProxy - LuaLS proxy mock
 * @returns ServerFeatureRegistrar 생성 context
 */
function createRegistrarContext(
  request: FragmentAnalysisRequest,
  luaLsProxy: ServerFeatureRegistrarContext['luaLsProxy'],
): ServerFeatureRegistrarContext {
  return {
    connection: createConnectionStub().connection,
    luaLsProxy,
    providers: {
      codeActionProvider: {} as ServerFeatureRegistrarContext['providers']['codeActionProvider'],
      codeLensProvider: {} as ServerFeatureRegistrarContext['providers']['codeLensProvider'],
      completionProvider: {
        provideUnresolved: vi.fn(() => [
          {
            label: 'cbs-local',
            data: { cbs: { category: 'builtin', kind: 'function' } },
          },
        ]),
      } as unknown as ServerFeatureRegistrarContext['providers']['completionProvider'],
      documentHighlightProvider: {} as ServerFeatureRegistrarContext['providers']['documentHighlightProvider'],
      documentSymbolProvider: {} as ServerFeatureRegistrarContext['providers']['documentSymbolProvider'],
      foldingProvider: {} as ServerFeatureRegistrarContext['providers']['foldingProvider'],
      formattingProvider: {} as ServerFeatureRegistrarContext['providers']['formattingProvider'],
      hoverProvider: {
        provide: vi.fn(() => null),
      } as unknown as ServerFeatureRegistrarContext['providers']['hoverProvider'],
      inlayHintProvider: {} as ServerFeatureRegistrarContext['providers']['inlayHintProvider'],
      resolveRequest: () => request,
      selectionRangeProvider: {} as ServerFeatureRegistrarContext['providers']['selectionRangeProvider'],
      semanticTokensProvider: {} as ServerFeatureRegistrarContext['providers']['semanticTokensProvider'],
      signatureHelpProvider: {} as ServerFeatureRegistrarContext['providers']['signatureHelpProvider'],
      workspaceSymbolProvider: {} as ServerFeatureRegistrarContext['providers']['workspaceSymbolProvider'],
    },
    registry: {} as ServerFeatureRegistrarContext['registry'],
    resolveWorkspaceRequest: () => request,
    resolveWorkspaceVariableFlowContext: () => null,
  };
}

describe('ServerFeatureRegistrar LuaLS oversized request guard', () => {
  it('keeps fragment requests for oversized opened .risulua documents so cheap CBS features can run', () => {
    const text = 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1);
    const document = TextDocument.create('file:///workspace/lua/huge.risulua', 'risulua', 1, text);

    expect(createFragmentRequest(document)).toMatchObject({
      uri: document.uri,
      version: 1,
      filePath: '/workspace/lua/huge.risulua',
      text,
    });
  });

  it('keeps fragment requests for small opened .risulua documents', () => {
    const text = '{{user}}';
    const document = TextDocument.create('file:///workspace/lua/small.risulua', 'risulua', 1, text);

    expect(createFragmentRequest(document)).toMatchObject({
      uri: document.uri,
      version: 1,
      filePath: '/workspace/lua/small.risulua',
      text,
    });
  });

  it('detects oversized LuaLS proxy requests from current document text', () => {
    expect(
      shouldSkipLuaLsProxyForRequest({
        uri: 'file:///workspace/lua/huge.risulua',
        filePath: '/workspace/lua/huge.risulua',
        version: 1,
        text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
      }),
    ).toBe(true);
  });

  it('treats null routed .risulua requests as LuaLS proxy skips', () => {
    expect(shouldSkipLuaLsProxyForRequest(null, '/workspace/lua/huge.risulua')).toBe(true);
    expect(shouldSkipLuaLsProxyForRequest(null, '/workspace/notes/readme.md')).toBe(false);
  });

  it('returns CBS completion without calling LuaLS for oversized .risulua documents', async () => {
    const connectionFixture = createConnectionStub();
    const request: FragmentAnalysisRequest = {
      uri: 'file:///workspace/lua/huge.risulua',
      filePath: '/workspace/lua/huge.risulua',
      version: 1,
      text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
    };
    const luaLsProxy = {
      getRuntime: vi.fn(() => ({ status: 'ready' })),
      provideCompletion: vi.fn(async () => [{ label: 'lua-item' }]),
      provideHover: vi.fn(async () => ({ contents: 'lua-hover' })),
    } as unknown as ServerFeatureRegistrarContext['luaLsProxy'];
    const registrar = new ServerFeatureRegistrar({
      ...createRegistrarContext(request, luaLsProxy),
      connection: connectionFixture.connection,
    });
    (registrar as unknown as { registerCompletionHandler: () => void }).registerCompletionHandler();

    const result = await connectionFixture.getCompletionHandler()({
      textDocument: { uri: request.uri },
      position: { line: 0, character: 1 },
    });

    expect(luaLsProxy.provideCompletion).not.toHaveBeenCalled();
    expect(result).toMatchObject([{ label: 'cbs-local' }]);
  });

  it('returns null hover without calling LuaLS for oversized .risulua documents', async () => {
    const connectionFixture = createConnectionStub();
    const request: FragmentAnalysisRequest = {
      uri: 'file:///workspace/lua/huge.risulua',
      filePath: '/workspace/lua/huge.risulua',
      version: 1,
      text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
    };
    const luaLsProxy = {
      getRuntime: vi.fn(() => ({ status: 'ready' })),
      provideCompletion: vi.fn(async () => [{ label: 'lua-item' }]),
      provideHover: vi.fn(async () => ({ contents: 'lua-hover' })),
    } as unknown as ServerFeatureRegistrarContext['luaLsProxy'];
    const registrar = new ServerFeatureRegistrar({
      ...createRegistrarContext(request, luaLsProxy),
      connection: connectionFixture.connection,
    });
    (registrar as unknown as { registerHoverHandler: () => void }).registerHoverHandler();

    const result = await connectionFixture.getHoverHandler()({
      textDocument: { uri: request.uri },
      position: { line: 0, character: 1 },
    });

    expect(luaLsProxy.provideHover).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns CBS hover immediately without calling LuaLS for small .risulua CBS targets', async () => {
    const connectionFixture = createConnectionStub();
    const request: FragmentAnalysisRequest = {
      uri: 'file:///workspace/lua/small.risulua',
      filePath: '/workspace/lua/small.risulua',
      version: 1,
      text: 'local greeting = "hello"\n{{user}}\n',
    };
    const luaLsProxy = {
      getRuntime: vi.fn(() => ({ status: 'ready' })),
      provideCompletion: vi.fn(async () => [{ label: 'lua-item' }]),
      provideHover: vi.fn(async () => ({ contents: 'lua-hover' })),
    } as unknown as ServerFeatureRegistrarContext['luaLsProxy'];
    const registrar = new ServerFeatureRegistrar({
      ...createRegistrarContext(request, luaLsProxy),
      connection: connectionFixture.connection,
      providers: {
        ...createRegistrarContext(request, luaLsProxy).providers,
        hoverProvider: {
          provide: vi.fn(() => ({ contents: 'cbs-hover' })),
        } as unknown as ServerFeatureRegistrarContext['providers']['hoverProvider'],
      },
    });
    (registrar as unknown as { registerHoverHandler: () => void }).registerHoverHandler();

    const result = await connectionFixture.getHoverHandler()({
      textDocument: { uri: request.uri },
      position: { line: 1, character: 3 },
    });

    expect(luaLsProxy.provideHover).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain('cbs-hover');
    expect(JSON.stringify(result)).not.toContain('lua-hover');
  });

  it('proxies definition to LuaLS for small .risulua Lua symbols', async () => {
    const connectionFixture = createConnectionStub();
    const request: FragmentAnalysisRequest = {
      uri: 'file:///workspace/lua/small.risulua',
      filePath: '/workspace/lua/small.risulua',
      version: 1,
      text: 'local greeting = "hello"\nreturn greeting\n',
    };
    const luaLsProxy = {
      getRuntime: vi.fn(() => ({ status: 'ready' })),
      provideCompletion: vi.fn(async () => [{ label: 'lua-item' }]),
      provideDefinition: vi.fn(async () => [
        {
          uri: request.uri,
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 14 },
          },
        },
      ]),
      provideHover: vi.fn(async () => ({ contents: 'lua-hover' })),
      prepareRename: vi.fn(async () => null),
      provideRename: vi.fn(async () => null),
    } as unknown as ServerFeatureRegistrarContext['luaLsProxy'];
    const registrar = new ServerFeatureRegistrar({
      ...createRegistrarContext(request, luaLsProxy),
      connection: connectionFixture.connection,
    });
    (registrar as unknown as { registerDefinitionHandler: () => void }).registerDefinitionHandler();

    const result = await connectionFixture.getDefinitionHandler()({
      textDocument: { uri: request.uri },
      position: { line: 1, character: 9 },
    });

    expect(luaLsProxy.provideDefinition).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        uri: request.uri,
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 14 },
        },
      },
    ]);
  });

  it('falls back to LuaLS prepareRename and rename for small .risulua Lua symbols', async () => {
    const connectionFixture = createConnectionStub();
    const request: FragmentAnalysisRequest = {
      uri: 'file:///workspace/lua/small.risulua',
      filePath: '/workspace/lua/small.risulua',
      version: 1,
      text: 'local greeting = "hello"\nreturn greeting\n',
    };
    const renameRange = {
      start: { line: 0, character: 6 },
      end: { line: 0, character: 14 },
    };
    const luaLsProxy = {
      getRuntime: vi.fn(() => ({ status: 'ready' })),
      provideCompletion: vi.fn(async () => [{ label: 'lua-item' }]),
      provideDefinition: vi.fn(async () => null),
      provideHover: vi.fn(async () => ({ contents: 'lua-hover' })),
      prepareRename: vi.fn(async () => renameRange),
      provideRename: vi.fn(async () => ({
        documentChanges: [
          {
            textDocument: { uri: request.uri, version: null },
            edits: [{ range: renameRange, newText: 'renamedGreeting' }],
          },
        ],
      })),
    } as unknown as ServerFeatureRegistrarContext['luaLsProxy'];
    const registrar = new ServerFeatureRegistrar({
      ...createRegistrarContext(request, luaLsProxy),
      connection: connectionFixture.connection,
    });
    (registrar as unknown as { registerPrepareRenameHandler: () => void }).registerPrepareRenameHandler();
    (registrar as unknown as { registerRenameHandler: () => void }).registerRenameHandler();

    const prepared = await connectionFixture.getPrepareRenameHandler()({
      textDocument: { uri: request.uri },
      position: { line: 1, character: 9 },
    });
    const edit = await connectionFixture.getRenameHandler()({
      textDocument: { uri: request.uri },
      position: { line: 1, character: 9 },
      newName: 'renamedGreeting',
    });

    expect(luaLsProxy.prepareRename).toHaveBeenCalledOnce();
    expect(luaLsProxy.provideRename).toHaveBeenCalledOnce();
    expect(prepared).toEqual(renameRange);
    expect(edit).toEqual({
      documentChanges: [
        {
          textDocument: { uri: request.uri, version: null },
          edits: [{ range: renameRange, newText: 'renamedGreeting' }],
        },
      ],
    });
  });
});
