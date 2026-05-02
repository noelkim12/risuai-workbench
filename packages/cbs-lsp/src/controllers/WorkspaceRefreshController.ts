/**
 * CBS LSP workspace refresh controller.
 * @file packages/cbs-lsp/src/controllers/WorkspaceRefreshController.ts
 */

import type { Connection, DidChangeWatchedFilesParams } from 'vscode-languageserver/node';
import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { fragmentAnalysisService } from '../core';
import { CbsLspPathHelper } from '../helpers/path-helper';
import type { WorkspaceRefreshReason } from '../helpers/server-workspace-helper';
import { shouldRouteDocumentToLuaLs } from '../providers/lua/lualsDocuments';
import { traceFeaturePayload, traceFeatureRequest } from '../utils/server-tracing';
import { CodeLensRefreshScheduler } from './CodeLensRefreshScheduler';
import { DiagnosticsPublisher } from './DiagnosticsPublisher';
import { LuaLsCompanionController } from './LuaLsCompanionController';
import { WorkspaceStateRepository } from './WorkspaceStateRepository';
import { RefreshScheduler } from './workspace-refresh/RefreshScheduler';
import { WorkspaceRefreshExecutor } from './workspace-refresh/WorkspaceRefreshExecutor';
import {
  collectWorkspaceWatchedFileChanges,
  toWatchedFileRefreshRequests,
} from './workspace-refresh/watchedFileRefreshRequests';

export interface WorkspaceRefreshControllerOptions {
  codeLensRefreshScheduler: CodeLensRefreshScheduler;
  connection: Connection;
  diagnosticsPublisher: DiagnosticsPublisher;
  documentChangeDebounceMs?: number;
  documents: TextDocuments<TextDocument>;
  luaLsCompanionController: LuaLsCompanionController;
  workspaceStateRepository: WorkspaceStateRepository;
}

const DEFAULT_DOCUMENT_CHANGE_DEBOUNCE_MS = 150;

/**
 * WorkspaceRefreshController 클래스.
 * document/workspace 이벤트를 scheduler와 executor로 라우팅하는 façade.
 */
export class WorkspaceRefreshController {
  private readonly connection: Connection;

  private readonly diagnosticsPublisher: DiagnosticsPublisher;

  private readonly luaLsCompanionController: LuaLsCompanionController;

  private readonly refreshExecutor: WorkspaceRefreshExecutor;

  private readonly refreshScheduler: RefreshScheduler;

  private readonly workspaceStateRepository: WorkspaceStateRepository;

  /**
   * constructor 함수.
   * 기존 server.ts/test wiring과 호환되는 options로 refresh façade를 구성함.
   *
   * @param options - workspace refresh 의존성 묶음
   */
  constructor(options: WorkspaceRefreshControllerOptions) {
    this.connection = options.connection;
    this.diagnosticsPublisher = options.diagnosticsPublisher;
    this.luaLsCompanionController = options.luaLsCompanionController;
    this.workspaceStateRepository = options.workspaceStateRepository;
    this.refreshExecutor = new WorkspaceRefreshExecutor({
      codeLensRefreshScheduler: options.codeLensRefreshScheduler,
      connection: options.connection,
      diagnosticsPublisher: options.diagnosticsPublisher,
      documents: options.documents,
      luaLsCompanionController: options.luaLsCompanionController,
      workspaceStateRepository: options.workspaceStateRepository,
    });
    this.refreshScheduler = new RefreshScheduler({
      connection: options.connection,
      documentChangeDebounceMs: options.documentChangeDebounceMs ?? DEFAULT_DOCUMENT_CHANGE_DEBOUNCE_MS,
      onFlush: (batch) => {
        this.refreshExecutor.refreshChangedUris({
          reason: batch.reason,
          changedUris: batch.uris,
          prioritySourceUris: batch.kind === 'document-open' ? batch.uris : undefined,
        });
      },
    });
  }

  /**
   * refreshDocumentLifecycle 함수.
   * document open/change/close 이벤트를 standalone/workspace 경로로 분기해 처리함.
   *
   * @param document - lifecycle 이벤트가 발생한 문서
   * @param reason - open/change/close 중 현재 문서 이벤트 종류
   */
  refreshDocumentLifecycle(document: TextDocument, reason: 'open' | 'change' | 'close'): void {
    const filePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
    const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(filePath);

    if (!workspaceRoot) {
      this.refreshStandaloneDocumentLifecycle(document, filePath, reason);
      return;
    }

    if (reason === 'close') {
      fragmentAnalysisService.clearUri(document.uri);
    }

    if (reason === 'change') {
      this.refreshScheduler.scheduleDocumentChange(document.uri);
      return;
    }

    this.refreshScheduler.flushDocumentChange();
    if (reason === 'open') {
      this.publishLocalFirstDocumentOpen(document.uri, workspaceRoot);
      this.refreshScheduler.scheduleDocumentOpen(document.uri);
      return;
    }

    this.refreshScheduler.flushDocumentOpen();
    this.refreshExecutor.refreshChangedUris({
      reason: 'document-close',
      changedUris: [document.uri],
    });
  }

  /**
   * refreshWatchedFiles 함수.
   * workspace watched-file 변경을 reason별 URI 묶음으로 분배해 rebuild 경로에 태움.
   *
   * @param params - watched-file 변경 payload
   */
  refreshWatchedFiles(params: DidChangeWatchedFilesParams): void {
    this.refreshScheduler.flushAll();

    const relevantChanges = collectWorkspaceWatchedFileChanges(params);
    if (relevantChanges.length === 0) {
      traceFeatureRequest(this.connection, 'workspace', 'watched-files-skip', {
        changes: 0,
      });
      return;
    }

    traceFeaturePayload(this.connection, 'workspace', 'watched-files-change', {
      changes: relevantChanges.map((change) => ({
        type: change.type,
        uri: change.uri,
      })),
    });

    for (const request of toWatchedFileRefreshRequests(params)) {
      this.refreshExecutor.refreshChangedUris(request);
    }
  }

  /**
   * refreshTrackedWorkspaces 함수.
   * 설정 변경처럼 changed URI 없이 현재 추적 중인 workspace snapshot 전체를 다시 빌드함.
   *
   * @param reason - 전체 rebuild를 유발한 refresh 원인
   */
  refreshTrackedWorkspaces(reason: WorkspaceRefreshReason = 'configuration-change'): void {
    this.refreshScheduler.flushAll();

    const workspaceRoots = this.workspaceStateRepository.listRoots();
    if (workspaceRoots.length === 0) {
      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-skip', {
        reason,
        roots: 0,
      });
      return;
    }

    this.refreshExecutor.refreshTrackedWorkspaces({ reason, workspaceRoots });
  }

  /**
   * flushDocumentChangeRefresh 함수.
   * 테스트와 lifecycle boundary에서 누적된 document-change refresh를 즉시 실행함.
   */
  flushDocumentChangeRefresh(): void {
    this.refreshScheduler.flushDocumentChange();
  }

  /**
   * refreshStandaloneDocumentLifecycle 함수.
   * workspace 밖 문서의 LuaLS mirror와 diagnostics clear를 처리함.
   *
   * @param document - lifecycle 이벤트가 발생한 문서
   * @param filePath - URI에서 계산한 로컬 파일 경로
   * @param reason - open/change/close 중 현재 문서 이벤트 종류
   */
  private refreshStandaloneDocumentLifecycle(
    document: TextDocument,
    filePath: string,
    reason: 'open' | 'change' | 'close',
  ): void {
    if (shouldRouteDocumentToLuaLs(filePath)) {
      if (reason === 'close') {
        this.luaLsCompanionController.closeStandaloneDocument(document.uri);
      } else {
        this.luaLsCompanionController.syncStandaloneDocument(document);
      }
    }

    if (reason === 'close') {
      fragmentAnalysisService.clearUri(document.uri);
    }

    this.diagnosticsPublisher.publish(document.uri, null);
  }

  /**
   * publishLocalFirstDocumentOpen 함수.
   * 첫 didOpen에서 full rebuild 전에도 현재 문서 local diagnostics를 즉시 publish함.
   *
   * @param uri - 열린 문서 URI
   * @param workspaceRoot - 문서가 속한 workspace root
   */
  private publishLocalFirstDocumentOpen(uri: string, workspaceRoot: string): void {
    this.diagnosticsPublisher.publish(uri, this.workspaceStateRepository.getByRoot(workspaceRoot));
  }
}
