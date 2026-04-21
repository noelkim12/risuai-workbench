/**
 * LuaLS document routing and workspace mirror contract tests.
 * @file packages/cbs-lsp/tests/providers/luals-documents.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createSyntheticDocumentVersion } from '../../src/core/fragment-analysis-service';
import { createWorkspaceScanFileFromText } from '../../src/indexer';
import {
  createLuaLsDocumentRouter,
  createLuaLsTransportUri,
  createLuaLsRoutedDocumentFromTextDocument,
  shouldRouteDocumentToLuaLs,
} from '../../src/providers/lua/lualsDocuments';

describe('lualsDocuments', () => {
  it('maps .risulua documents to deterministic LuaLS virtual URIs', () => {
    const document = TextDocument.create(
      'file:///workspace/lua/trigger.risulua',
      'lua',
      3,
      'local mood = getState("mood")\n',
    );

    expect(shouldRouteDocumentToLuaLs('/workspace/lua/trigger.risulua')).toBe(true);
    expect(createLuaLsTransportUri('/workspace/lua/trigger.risulua')).toBe(
      'risu-luals:///workspace/lua/trigger.risulua.lua',
    );
    expect(createLuaLsRoutedDocumentFromTextDocument(document, '/workspace')).toEqual({
      sourceUri: 'file:///workspace/lua/trigger.risulua',
      sourceFilePath: '/workspace/lua/trigger.risulua',
      transportUri: 'risu-luals:///workspace/lua/trigger.risulua.lua',
      languageId: 'lua',
      rootPath: '/workspace',
      version: 3,
      text: 'local mood = getState("mood")\n',
    });
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
      transportUri: 'risu-luals:///workspace/lua/trigger.risulua.lua',
      languageId: 'lua',
      rootPath: '/workspace',
      version: createSyntheticDocumentVersion('local mood = getState("mood")\n'),
      text: 'local mood = getState("mood")\n',
    });
    expect(processManager.closeDocument).toHaveBeenCalledWith(workspaceLuaFile.uri);
  });
});
