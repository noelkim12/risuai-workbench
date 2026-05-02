/**
 * WorkspaceRefreshController focused behavior tests.
 * @file packages/cbs-lsp/tests/controllers/workspace-refresh-controller.test.ts
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Connection } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { TextDocuments } from 'vscode-languageserver/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeLensRefreshScheduler } from '../../src/controllers/CodeLensRefreshScheduler';
import type { DiagnosticsPublisher } from '../../src/controllers/DiagnosticsPublisher';
import type { LuaLsCompanionController } from '../../src/controllers/LuaLsCompanionController';
import { WorkspaceRefreshController } from '../../src/controllers/WorkspaceRefreshController';
import { WorkspaceStateRepository } from '../../src/controllers/WorkspaceStateRepository';

function createConnectionStub(): Connection {
  return {
    tracer: {
      log: vi.fn(),
    },
    sendDiagnostics: vi.fn(),
    sendRequest: vi.fn(() => Promise.resolve()),
  } as unknown as Connection;
}

function createDocumentsStub(...documents: readonly TextDocument[]): TextDocuments<TextDocument> {
  return {
    all: () => [...documents],
    get: (uri: string) => documents.find((document) => document.uri === uri),
  } as unknown as TextDocuments<TextDocument>;
}

function createLuaLsCompanionStub(): LuaLsCompanionController {
  return {
    closeStandaloneDocument: vi.fn(),
    clearWorkspaceDocuments: vi.fn(),
    refreshWorkspaceConfiguration: vi.fn(),
    syncStandaloneDocument: vi.fn(),
    syncWorkspaceDocuments: vi.fn(() => ({
      totalFiles: 0,
      luaFileCount: 0,
      oversizedSkipped: 0,
      unchangedSkipped: 0,
      syncedCount: 0,
      closedCount: 0,
      deferredCount: 0,
      shadowDurationMs: 0,
    })),
  } as unknown as LuaLsCompanionController;
}

function createStandaloneControllerFixture(debounceMs: number) {
  const rootPath = mkdtempWorkspaceRoot();
  const filePath = path.join(rootPath, 'loose.risulua');
  const document = TextDocument.create(filePath, 'risulua', 1, 'setState("mood", "happy")');
  const connection = createConnectionStub();
  const diagnosticsPublisher = {
    publish: vi.fn(),
  } as unknown as DiagnosticsPublisher;
  const luaLsCompanionController = createLuaLsCompanionStub();
  const controller = new WorkspaceRefreshController({
    codeLensRefreshScheduler: new CodeLensRefreshScheduler({
      connection,
      supportsRefresh: () => false,
    }),
    connection,
    diagnosticsPublisher,
    documentChangeDebounceMs: debounceMs,
    documents: createDocumentsStub(document),
    luaLsCompanionController,
    workspaceStateRepository: new WorkspaceStateRepository(),
  });

  return {
    controller,
    diagnosticsPublisher,
    document,
    luaLsCompanionController,
    rootPath,
  };
}

function createControllerFixture(debounceMs: number) {
  const rootPath = path.join(mkdtempWorkspaceRoot(), 'workspace');
  const lorebookDir = path.join(rootPath, 'lorebooks');
  mkdirSync(lorebookDir, { recursive: true });
  const filePath = path.join(lorebookDir, 'entry.risulorebook');
  const uri = pathToFileURL(filePath).toString();
  const document = TextDocument.create(
    uri,
    'risulorebook',
    1,
    ['---', 'name: entry', '---', '@@@ CONTENT', '{{'].join('\n'),
  );
  const connection = createConnectionStub();
  const documents = createDocumentsStub(document);
  const diagnosticsPublisher = {
    publish: vi.fn(),
  } as unknown as DiagnosticsPublisher;
  const controller = new WorkspaceRefreshController({
    codeLensRefreshScheduler: new CodeLensRefreshScheduler({
      connection,
      supportsRefresh: () => false,
    }),
    connection,
    diagnosticsPublisher,
    documentChangeDebounceMs: debounceMs,
    documents,
    luaLsCompanionController: createLuaLsCompanionStub(),
    workspaceStateRepository: new WorkspaceStateRepository(),
  });

  return {
    controller,
    diagnosticsPublisher,
    document,
    rootPath,
  };
}

function createMultiRootOpenFixture(debounceMs: number) {
  const firstRootPath = path.join(mkdtempWorkspaceRoot(), 'first-workspace');
  const secondRootPath = path.join(mkdtempWorkspaceRoot(), 'second-workspace');
  const firstFilePath = path.join(firstRootPath, 'lorebooks', 'first.risulorebook');
  const secondFilePath = path.join(secondRootPath, 'lorebooks', 'second.risulorebook');
  mkdirSync(path.dirname(firstFilePath), { recursive: true });
  mkdirSync(path.dirname(secondFilePath), { recursive: true });

  const firstDocument = TextDocument.create(
    pathToFileURL(firstFilePath).toString(),
    'risulorebook',
    1,
    ['---', 'name: first', '---', '@@@ CONTENT', '{{getvar::mood}}'].join('\n'),
  );
  const secondDocument = TextDocument.create(
    pathToFileURL(secondFilePath).toString(),
    'risulorebook',
    1,
    ['---', 'name: second', '---', '@@@ CONTENT', '{{getvar::weather}}'].join('\n'),
  );
  const connection = createConnectionStub();
  const luaLsCompanionController = createLuaLsCompanionStub();
  const diagnosticsPublisher = {
    publish: vi.fn(),
  } as unknown as DiagnosticsPublisher;
  const controller = new WorkspaceRefreshController({
    codeLensRefreshScheduler: new CodeLensRefreshScheduler({
      connection,
      supportsRefresh: () => false,
    }),
    connection,
    diagnosticsPublisher,
    documentChangeDebounceMs: debounceMs,
    documents: createDocumentsStub(firstDocument, secondDocument),
    luaLsCompanionController,
    workspaceStateRepository: new WorkspaceStateRepository(),
  });

  return {
    controller,
    firstDocument,
    firstRootPath,
    luaLsCompanionController,
    secondDocument,
    secondRootPath,
  };
}

function mkdtempWorkspaceRoot(): string {
  return path.join(tmpdir(), `cbs-lsp-refresh-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

describe('WorkspaceRefreshController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces document-change workspace refresh so completion requests are not blocked immediately', () => {
    vi.useFakeTimers();
    const { controller, diagnosticsPublisher, document, rootPath } = createControllerFixture(50);

    try {
      controller.refreshDocumentLifecycle(document, 'change');
      expect(diagnosticsPublisher.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(49);
      expect(diagnosticsPublisher.publish).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(diagnosticsPublisher.publish).toHaveBeenCalled();
    } finally {
      rmSync(path.dirname(rootPath), { recursive: true, force: true });
    }
  });

  it('flushes pending document-change refresh before document-close refresh', () => {
    vi.useFakeTimers();
    const { controller, diagnosticsPublisher, document, rootPath } = createControllerFixture(50);

    try {
      controller.refreshDocumentLifecycle(document, 'change');
      expect(diagnosticsPublisher.publish).not.toHaveBeenCalled();

      controller.refreshDocumentLifecycle(document, 'close');
      expect(diagnosticsPublisher.publish).toHaveBeenCalled();
    } finally {
      rmSync(path.dirname(rootPath), { recursive: true, force: true });
    }
  });

  it('publishes local diagnostics immediately and defers first document-open workspace refresh', () => {
    vi.useFakeTimers();
    const { controller, diagnosticsPublisher, document, rootPath } = createControllerFixture(50);

    try {
      controller.refreshDocumentLifecycle(document, 'open');
      expect(diagnosticsPublisher.publish).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(0);
      expect(diagnosticsPublisher.publish).toHaveBeenCalled();
      expect(vi.mocked(diagnosticsPublisher.publish).mock.calls.length).toBeGreaterThan(1);
    } finally {
      rmSync(path.dirname(rootPath), { recursive: true, force: true });
    }
  });

  it('routes standalone Lua documents without workspace executor refreshes', () => {
    vi.useFakeTimers();
    const { controller, diagnosticsPublisher, document, luaLsCompanionController, rootPath } =
      createStandaloneControllerFixture(50);

    try {
      controller.refreshDocumentLifecycle(document, 'change');
      vi.advanceTimersByTime(50);

      expect(luaLsCompanionController.syncStandaloneDocument).toHaveBeenCalledWith(document);
      expect(diagnosticsPublisher.publish).toHaveBeenCalledTimes(1);
      expect(diagnosticsPublisher.publish).toHaveBeenCalledWith(document.uri, null);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it('keeps document-open prioritySourceUris scoped to each workspace root', () => {
    vi.useFakeTimers();
    const {
      controller,
      firstDocument,
      firstRootPath,
      luaLsCompanionController,
      secondDocument,
      secondRootPath,
    } = createMultiRootOpenFixture(50);

    try {
      controller.refreshDocumentLifecycle(secondDocument, 'open');
      controller.refreshDocumentLifecycle(firstDocument, 'open');
      vi.advanceTimersByTime(0);

      expect(luaLsCompanionController.syncWorkspaceDocuments).toHaveBeenCalledWith(
        firstRootPath,
        expect.any(Array),
        { prioritySourceUris: [firstDocument.uri] },
      );
      expect(luaLsCompanionController.syncWorkspaceDocuments).toHaveBeenCalledWith(
        secondRootPath,
        expect.any(Array),
        { prioritySourceUris: [secondDocument.uri] },
      );
    } finally {
      rmSync(path.dirname(firstRootPath), { recursive: true, force: true });
      rmSync(path.dirname(secondRootPath), { recursive: true, force: true });
    }
  });
});
