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

function createDocumentsStub(document: TextDocument): TextDocuments<TextDocument> {
  return {
    all: () => [document],
    get: (uri: string) => (uri === document.uri ? document : undefined),
  } as unknown as TextDocuments<TextDocument>;
}

function createLuaLsCompanionStub(): LuaLsCompanionController {
  return {
    clearWorkspaceDocuments: vi.fn(),
    refreshWorkspaceConfiguration: vi.fn(),
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
});
