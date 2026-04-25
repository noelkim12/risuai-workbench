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
  HoverParams,
} from 'vscode-languageserver/node';

import type { FragmentAnalysisRequest } from '../../src/core';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../../src/indexer';
import {
  ServerFeatureRegistrar,
  shouldSkipLuaLsProxyForRequest,
  type ServerFeatureRegistrarContext,
} from '../../src/helpers/server-helper';

type CompletionHandler = (
  params: CompletionParams,
  cancellationToken?: CancellationToken,
) => CompletionItem[] | Promise<CompletionItem[]>;

type HoverHandler = (params: HoverParams, cancellationToken?: CancellationToken) => unknown;

/**
 * createConnectionStub 함수.
 * completion/hover handler만 캡처하는 최소 connection stub을 만듦.
 *
 * @returns 테스트용 connection과 캡처된 handler 조회 함수
 */
function createConnectionStub(): {
  connection: Connection;
  getCompletionHandler: () => CompletionHandler;
  getHoverHandler: () => HoverHandler;
} {
  let completionHandler: CompletionHandler | null = null;
  let hoverHandler: HoverHandler | null = null;
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
    onHover: vi.fn((handler: HoverHandler) => {
      hoverHandler = handler;
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
    getHoverHandler: () => {
      if (!hoverHandler) {
        throw new Error('Hover handler was not registered.');
      }
      return hoverHandler;
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
});
