/**
 * WorkspaceRefreshExecutor side-effect ordering tests.
 * @file packages/cbs-lsp/tests/controllers/workspace-refresh-executor.test.ts
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Connection } from 'vscode-languageserver/node';
import type { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CodeLensRefreshScheduler } from '../../src/controllers/CodeLensRefreshScheduler';
import type { DiagnosticsPublisher } from '../../src/controllers/DiagnosticsPublisher';
import type { LuaLsCompanionController } from '../../src/controllers/LuaLsCompanionController';
import type { WorkspaceStateRepository } from '../../src/controllers/WorkspaceStateRepository';
import { WorkspaceRefreshExecutor } from '../../src/controllers/workspace-refresh/WorkspaceRefreshExecutor';
import type { WorkspaceDiagnosticsState } from '../../src/helpers/server-workspace-helper';

const roots: string[] = [];

/**
 * createConnectionStub 함수.
 * executor trace 호출을 받아도 side effect가 없는 connection stub를 만듦.
 *
 * @returns trace logger만 가진 connection stub
 */
function createConnectionStub(): Connection {
  return {
    tracer: {
      log: vi.fn(),
    },
  } as unknown as Connection;
}

/**
 * createDocumentsStub 함수.
 * workspace rebuild helper가 열린 문서를 조회할 수 있는 최소 TextDocuments stub를 만듦.
 *
 * @param document - executor가 rebuild에 반영할 열린 문서
 * @returns all/get만 구현한 TextDocuments stub
 */
function createDocumentsStub(document: TextDocument): TextDocuments<TextDocument> {
  return {
    all: () => [document],
    get: (uri: string) => (uri === document.uri ? document : undefined),
  } as unknown as TextDocuments<TextDocument>;
}

/**
 * createWorkspaceFixture 함수.
 * full rebuild가 실제 scanner를 통과할 수 있는 임시 lorebook workspace를 만듦.
 *
 * @returns root/document/cleanup 정보를 담은 fixture
 */
function createWorkspaceFixture() {
  const rootPath = path.join(tmpdir(), `cbs-lsp-executor-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  roots.push(rootPath);
  const filePath = path.join(rootPath, 'lorebooks', 'entry.risulorebook');
  mkdirSync(path.dirname(filePath), { recursive: true });
  const document = TextDocument.create(
    pathToFileURL(filePath).toString(),
    'risulorebook',
    1,
    ['---', 'name: entry', '---', '@@@ CONTENT', '{{getvar::mood}}'].join('\n'),
  );

  return { document, rootPath };
}

describe('WorkspaceRefreshExecutor', () => {
  afterEach(() => {
    for (const rootPath of roots.splice(0)) {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it('runs repository replace before LuaLS, diagnostics, and CodeLens side effects', () => {
    const order: string[] = [];
    const { document, rootPath } = createWorkspaceFixture();
    const workspaceStateRepository = {
      getByRoot: vi.fn(() => null),
      replace: vi.fn((_root: string, state: WorkspaceDiagnosticsState | null) => {
        order.push(`replace:${state?.rootPath ?? 'null'}`);
      }),
    } as unknown as WorkspaceStateRepository;
    const luaLsCompanionController = {
      clearWorkspaceDocuments: vi.fn(() => order.push('lua-clear')),
      refreshWorkspaceConfiguration: vi.fn(() => order.push('lua-config')),
      syncWorkspaceDocuments: vi.fn(() => {
        order.push('lua-sync');
        return {
          closedCount: 0,
          deferredCount: 0,
          luaFileCount: 0,
          oversizedSkipped: 0,
          shadowDurationMs: 0,
          syncedCount: 0,
          totalFiles: 0,
          unchangedSkipped: 0,
        };
      }),
    } as unknown as LuaLsCompanionController;
    const diagnosticsPublisher = {
      publish: vi.fn(() => order.push('diagnostics')),
    } as unknown as DiagnosticsPublisher;
    const codeLensRefreshScheduler = {
      schedule: vi.fn(() => order.push('codelens')),
    } as unknown as CodeLensRefreshScheduler;
    const executor = new WorkspaceRefreshExecutor({
      codeLensRefreshScheduler,
      connection: createConnectionStub(),
      diagnosticsPublisher,
      documents: createDocumentsStub(document),
      luaLsCompanionController,
      workspaceStateRepository,
    });

    const result = executor.refreshChangedUris({
      reason: 'document-change',
      changedUris: [document.uri],
    });

    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.rootPath).toBe(rootPath);
    expect(order).toEqual([
      `replace:${rootPath}`,
      'lua-sync',
      'lua-config',
      'diagnostics',
      'codelens',
    ]);
  });
});
