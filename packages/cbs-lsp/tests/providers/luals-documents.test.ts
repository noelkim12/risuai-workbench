/**
 * LuaLS document routing and workspace mirror contract tests.
 * @file packages/cbs-lsp/tests/providers/luals-documents.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createSyntheticDocumentVersion } from '../../src/core/fragment-analysis-service';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH, createWorkspaceScanFileFromText } from '../../src/indexer';
import {
  createLuaLsDocumentRouter,
  createLuaLsRoutedDocumentFromTextDocument,
  shouldRouteDocumentToLuaLs,
} from '../../src/providers/lua/lualsDocuments';
import { createLuaLsShadowDocumentUri } from '../../src/providers/lua/lualsShadowWorkspace';

describe('lualsDocuments', () => {
  it('maps .risulua documents to deterministic LuaLS shadow file URIs', () => {
    const document = TextDocument.create(
      'file:///workspace/lua/trigger.risulua',
      'lua',
      3,
      'local mood = getState("mood")\n',
    );

    expect(shouldRouteDocumentToLuaLs('/workspace/lua/trigger.risulua')).toBe(true);
    expect(createLuaLsRoutedDocumentFromTextDocument(document, '/workspace')).toEqual({
      sourceUri: 'file:///workspace/lua/trigger.risulua',
      sourceFilePath: '/workspace/lua/trigger.risulua',
      transportUri: createLuaLsShadowDocumentUri('/workspace/lua/trigger.risulua'),
      languageId: 'lua',
      rootPath: '/workspace',
      version: 3,
      text: 'local mood = getState("mood")\n',
    });
  });

  it('produces file:// transport URIs that LuaLS recognizes as workspace documents', () => {
    const transportUri = createLuaLsShadowDocumentUri('/workspace/lua/trigger.risulua');
    expect(transportUri).toMatch(/^file:\/\//u);
    expect(transportUri).toContain('.lua');
  });

  it('syncs workspace lua files and closes removed mirror documents', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const workspaceLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/trigger.risulua',
      text: 'local mood = getState("mood")\n',
      artifact: 'lua',
    });

    router.syncWorkspaceDocuments('/workspace', [workspaceLuaFile]);
    router.syncWorkspaceDocuments('/workspace', []);

    expect(processManager.syncDocument).toHaveBeenCalledWith({
      sourceUri: workspaceLuaFile.uri,
      sourceFilePath: '/workspace/lua/trigger.risulua',
      transportUri: createLuaLsShadowDocumentUri('/workspace/lua/trigger.risulua'),
      languageId: 'lua',
      rootPath: '/workspace',
      version: createSyntheticDocumentVersion('local mood = getState("mood")\n'),
      text: 'local mood = getState("mood")\n',
    });
    expect(processManager.closeDocument).toHaveBeenCalledWith(workspaceLuaFile.uri);
    expect(router.resolveSourceUriFromTransportUri(createLuaLsShadowDocumentUri('/workspace/lua/trigger.risulua'))).toBeNull();
  });

  it('exposes workspace-wide transport to source URI entries while routed documents are mirrored', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const firstLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/first.risulua',
      text: 'local first = getState("first")',
      artifact: 'lua',
    });
    const secondLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/second.risulua',
      text: 'local second = getState("second")',
      artifact: 'lua',
    });
    const firstTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/first.risulua');
    const secondTransportUri = createLuaLsShadowDocumentUri('/workspace/lua/second.risulua');

    router.syncWorkspaceDocuments('/workspace', [firstLuaFile, secondLuaFile]);

    expect(router.resolveSourceUriFromTransportUri(firstTransportUri)).toBe(firstLuaFile.uri);
    expect(router.resolveSourceUriFromTransportUri(secondTransportUri)).toBe(secondLuaFile.uri);
    expect([...router.getTransportToSourceUriEntries()]).toEqual([
      [firstTransportUri, firstLuaFile.uri],
      [secondTransportUri, secondLuaFile.uri],
    ]);

    router.syncWorkspaceDocuments('/workspace', [secondLuaFile]);

    expect(router.resolveSourceUriFromTransportUri(firstTransportUri)).toBeNull();
    expect(router.resolveSourceUriFromTransportUri(secondTransportUri)).toBe(secondLuaFile.uri);

    router.clearWorkspaceDocuments('/workspace');

    expect(router.resolveSourceUriFromTransportUri(secondTransportUri)).toBeNull();
  });

  it('keeps standalone transport URI entries only while the standalone document is mirrored', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const sourceUri = 'file:///workspace/lua/standalone.risulua';
    const transportUri = createLuaLsShadowDocumentUri('/workspace/lua/standalone.risulua');

    router.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 1, 'return getState("mood")'));

    expect(router.resolveSourceUriFromTransportUri(transportUri)).toBe(sourceUri);

    router.closeStandaloneDocument(sourceUri);

    expect(router.resolveSourceUriFromTransportUri(transportUri)).toBeNull();
  });

  it('keeps reverse URI entries when standalone and workspace mirrors overlap', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const workspaceLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/overlap.risulua',
      text: 'return getState("overlap")',
      artifact: 'lua',
    });
    const transportUri = createLuaLsShadowDocumentUri('/workspace/lua/overlap.risulua');

    router.syncWorkspaceDocuments('/workspace', [workspaceLuaFile]);
    router.syncStandaloneDocument(TextDocument.create(workspaceLuaFile.uri, 'lua', 1, workspaceLuaFile.text));

    expect(router.resolveSourceUriFromTransportUri(transportUri)).toBe(workspaceLuaFile.uri);

    router.closeStandaloneDocument(workspaceLuaFile.uri);

    expect(router.resolveSourceUriFromTransportUri(transportUri)).toBe(workspaceLuaFile.uri);

    router.clearWorkspaceDocuments('/workspace');

    expect(router.resolveSourceUriFromTransportUri(transportUri)).toBeNull();
  });

  it('skips oversized workspace lua files before LuaLS shadow sync', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const workspaceLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/huge.risulua',
      text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
      artifact: 'lua',
    });

    const stats = router.syncWorkspaceDocuments('/workspace', [workspaceLuaFile]);

    expect(stats).toMatchObject({
      luaFileCount: 0,
      oversizedSkipped: 1,
      syncedCount: 0,
    });
    expect(processManager.syncDocument).not.toHaveBeenCalled();
  });

  it('closes a previous workspace LuaLS mirror when a file becomes oversized', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const normalLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/trigger.risulua',
      text: 'return getState("mood")',
      artifact: 'lua',
    });
    const oversizedLuaFile = createWorkspaceScanFileFromText({
      workspaceRoot: '/workspace',
      absolutePath: '/workspace/lua/trigger.risulua',
      text: 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1),
      artifact: 'lua',
    });

    router.syncWorkspaceDocuments('/workspace', [normalLuaFile]);
    const stats = router.syncWorkspaceDocuments('/workspace', [oversizedLuaFile]);

    expect(stats).toMatchObject({
      luaFileCount: 0,
      oversizedSkipped: 1,
      closedCount: 1,
    });
    expect(processManager.closeDocument).toHaveBeenCalledWith(normalLuaFile.uri);
  });

  it('closes an existing standalone LuaLS mirror when the document grows past the sync limit', () => {
    const processManager = {
      closeDocument: vi.fn(),
      syncDocument: vi.fn(),
    };
    const router = createLuaLsDocumentRouter(processManager);
    const sourceUri = 'file:///workspace/lua/trigger.risulua';

    router.syncStandaloneDocument(TextDocument.create(sourceUri, 'lua', 1, 'return getState("mood")'));
    router.syncStandaloneDocument(
      TextDocument.create(sourceUri, 'lua', 2, 'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1)),
    );

    expect(processManager.syncDocument).toHaveBeenCalledTimes(1);
    expect(processManager.closeDocument).toHaveBeenCalledWith(sourceUri);
  });
});
