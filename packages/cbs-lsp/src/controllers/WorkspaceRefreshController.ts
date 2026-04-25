/**
 * CBS LSP workspace refresh controller.
 * @file packages/cbs-lsp/src/controllers/WorkspaceRefreshController.ts
 */

import type { Connection, DidChangeWatchedFilesParams } from 'vscode-languageserver/node';
import { FileChangeType, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { fragmentAnalysisService } from '../core';
import { CbsLspPathHelper } from '../helpers/path-helper';
import {
  createIncrementalWorkspaceDiagnosticsState,
  createWorkspaceDiagnosticsState,
  type WorkspaceRefreshReason,
} from '../helpers/server-workspace-helper';
import { shouldRouteDocumentToLuaLs } from '../providers/lua/lualsDocuments';
import { traceFeaturePayload, traceFeatureRequest, traceFeatureResult } from '../utils/server-tracing';
import { CodeLensRefreshScheduler } from './CodeLensRefreshScheduler';
import { DiagnosticsPublisher } from './DiagnosticsPublisher';
import { LuaLsCompanionController } from './LuaLsCompanionController';
import { WorkspaceStateRepository } from './WorkspaceStateRepository';
import type { WorkspaceDiagnosticsState } from '../helpers/server-workspace-helper';

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
 * workspace state rebuild, diagnostics republish, CodeLens refresh, LuaLS mirror sync를 조율함.
 */
export class WorkspaceRefreshController {
  private readonly codeLensRefreshScheduler: CodeLensRefreshScheduler;

  private readonly connection: Connection;

  private readonly diagnosticsPublisher: DiagnosticsPublisher;

  private readonly documentChangeDebounceMs: number;

  private readonly documents: TextDocuments<TextDocument>;

  private readonly luaLsCompanionController: LuaLsCompanionController;

  private readonly workspaceStateRepository: WorkspaceStateRepository;

  private pendingDocumentChangeTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly pendingDocumentChangeUris = new Set<string>();

  /**
   * constructor 함수.
   * workspace refresh에 필요한 state owner와 후속 controller를 보관함.
   *
   * @param options - workspace refresh 의존성 묶음
   */
  constructor(options: WorkspaceRefreshControllerOptions) {
    this.codeLensRefreshScheduler = options.codeLensRefreshScheduler;
    this.connection = options.connection;
    this.diagnosticsPublisher = options.diagnosticsPublisher;
    this.documentChangeDebounceMs = options.documentChangeDebounceMs ?? DEFAULT_DOCUMENT_CHANGE_DEBOUNCE_MS;
    this.documents = options.documents;
    this.luaLsCompanionController = options.luaLsCompanionController;
    this.workspaceStateRepository = options.workspaceStateRepository;
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
      return;
    }

    if (reason === 'close') {
      fragmentAnalysisService.clearUri(document.uri);
    }

    if (reason === 'change') {
      this.scheduleDocumentChangeRefresh(document.uri);
      return;
    }

    this.flushPendingDocumentChangeRefresh();
    this.refreshWorkspaceUris([document.uri], reason === 'open' ? 'document-open' : 'document-close');
  }

  /**
   * refreshWatchedFiles 함수.
   * workspace watched-file 변경을 reason별 URI 묶음으로 분배해 rebuild 경로에 태움.
   *
   * @param params - watched-file 변경 payload
   */
  refreshWatchedFiles(params: DidChangeWatchedFilesParams): void {
    this.flushPendingDocumentChangeRefresh();

    const relevantChanges = params.changes.filter(
      (change) =>
        CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
          CbsLspPathHelper.getFilePathFromUri(change.uri),
        ) !== null,
    );
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

    const urisByReason = new Map<WorkspaceRefreshReason, Set<string>>();
    for (const change of relevantChanges) {
      const reason =
        change.type === FileChangeType.Created
          ? 'watched-file-create'
          : change.type === FileChangeType.Deleted
            ? 'watched-file-delete'
            : 'watched-file-change';
      if (!urisByReason.has(reason)) {
        urisByReason.set(reason, new Set<string>());
      }
      urisByReason.get(reason)?.add(change.uri);
    }

    for (const [reason, uris] of urisByReason) {
      this.refreshWorkspaceUris(
        [...uris].sort((left, right) => left.localeCompare(right)),
        reason,
      );
    }
  }

  /**
   * refreshTrackedWorkspaces 함수.
   * 설정 변경처럼 changed URI 없이도 현재 추적 중인 workspace snapshot 전체를 다시 빌드하고 diagnostics/CodeLens/LuaLS 후속 작업을 연결함.
   *
   * @param reason - 전체 rebuild를 유발한 refresh 원인
   */
  refreshTrackedWorkspaces(reason: WorkspaceRefreshReason = 'configuration-change'): void {
    this.flushPendingDocumentChangeRefresh();

    const workspaceRoots = this.workspaceStateRepository.listRoots();
    if (workspaceRoots.length === 0) {
      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-skip', {
        reason,
        roots: 0,
      });
      return;
    }

    const affectedCodeLensUris = new Set<string>();

    for (const workspaceRoot of workspaceRoots) {
      const previousState = this.workspaceStateRepository.getByRoot(workspaceRoot);
      const previousUris = this.collectWorkspaceStateUris(previousState);

      const rebuildStart = performance.now();
      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-start', {
        rootPath: workspaceRoot,
        reason,
        changedUris: 0,
        mode: 'full',
      });

      const nextState = createWorkspaceDiagnosticsState(workspaceRoot, this.documents);
      const nextUris = this.collectWorkspaceStateUris(nextState);
      const affectedUris = new Set<string>([...previousUris, ...nextUris]);

      this.workspaceStateRepository.replace(workspaceRoot, nextState);
      if (nextState) {
        this.luaLsCompanionController.syncWorkspaceDocuments(workspaceRoot, nextState.scanResult.files);
        this.luaLsCompanionController.refreshWorkspaceConfiguration({
          rootPath: workspaceRoot,
        });
      } else {
        this.luaLsCompanionController.clearWorkspaceDocuments(workspaceRoot);
      }

      for (const uri of this.collectWorkspaceCodeLensUris(previousState)) {
        affectedCodeLensUris.add(uri);
      }
      for (const uri of this.collectWorkspaceCodeLensUris(nextState)) {
        affectedCodeLensUris.add(uri);
      }

      traceFeatureResult(this.connection, 'workspace', 'state-rebuild-end', {
        rootPath: workspaceRoot,
        reason,
        mode: 'full',
        durationMs: Math.round(performance.now() - rebuildStart),
        affectedDiagnosticsUris: affectedUris.size,
        affectedCodeLensUris: [...affectedCodeLensUris].filter(
          (uri) =>
            CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
              CbsLspPathHelper.getFilePathFromUri(uri),
            ) === workspaceRoot,
        ).length,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });

      for (const uri of [...affectedUris].sort((left, right) => left.localeCompare(right))) {
        this.diagnosticsPublisher.publish(uri, nextState);
      }
    }

    this.codeLensRefreshScheduler.schedule(
      reason,
      [...affectedCodeLensUris].sort((left, right) => left.localeCompare(right)),
    );
  }

  /**
   * flushDocumentChangeRefresh 함수.
   * 테스트와 lifecycle boundary에서 누적된 document-change refresh를 즉시 실행함.
   */
  flushDocumentChangeRefresh(): void {
    this.flushPendingDocumentChangeRefresh();
  }

  /**
   * scheduleDocumentChangeRefresh 함수.
   * 빠른 타이핑 중 workspace rebuild/diagnostics가 completion을 막지 않도록 document-change를 debounce함.
   *
   * @param uri - 변경된 문서 URI
   */
  private scheduleDocumentChangeRefresh(uri: string): void {
    this.pendingDocumentChangeUris.add(uri);
    if (this.pendingDocumentChangeTimer) {
      clearTimeout(this.pendingDocumentChangeTimer);
    }

    traceFeatureRequest(this.connection, 'workspace', 'document-change-refresh-scheduled', {
      uri,
      pendingUris: this.pendingDocumentChangeUris.size,
      debounceMs: this.documentChangeDebounceMs,
    });

    this.pendingDocumentChangeTimer = setTimeout(() => {
      this.pendingDocumentChangeTimer = undefined;
      this.flushPendingDocumentChangeRefresh();
    }, this.documentChangeDebounceMs);
  }

  /**
   * flushPendingDocumentChangeRefresh 함수.
   * debounce 중인 document-change URI 묶음을 한 번의 workspace refresh로 처리함.
   */
  private flushPendingDocumentChangeRefresh(): void {
    if (this.pendingDocumentChangeTimer) {
      clearTimeout(this.pendingDocumentChangeTimer);
      this.pendingDocumentChangeTimer = undefined;
    }

    if (this.pendingDocumentChangeUris.size === 0) {
      return;
    }

    const uris = [...this.pendingDocumentChangeUris].sort((left, right) => left.localeCompare(right));
    this.pendingDocumentChangeUris.clear();

    traceFeatureRequest(this.connection, 'workspace', 'document-change-refresh-flush', {
      changedUris: uris.length,
      debounceMs: this.documentChangeDebounceMs,
    });

    this.refreshWorkspaceUris(uris, 'document-change');
  }

  /**
   * collectAffectedUris 함수.
   * 변경 URI 전후 상태를 비교해 다시 publish해야 할 diagnostics 대상을 수집함.
   *
   * @param changedUri - 직접 변경된 문서 URI
   * @param previousState - 변경 전 workspace state
   * @param nextState - 변경 후 workspace state
   * @returns diagnostics 영향을 받는 URI 목록
   */
  private collectAffectedUris(
    changedUri: string,
    previousState: WorkspaceDiagnosticsState | null,
    nextState: WorkspaceDiagnosticsState | null,
  ): readonly string[] {
    const affected = new Set<string>([changedUri]);

    for (const state of [previousState, nextState]) {
      if (!state) {
        continue;
      }

      for (const uri of state.variableFlowService.collectAffectedUris([changedUri])) {
        affected.add(uri);
      }
    }

    return [...affected].sort((left, right) => left.localeCompare(right));
  }

  /**
   * collectWorkspaceStateUris 함수.
   * workspace snapshot 전체 rebuild 후 다시 publish해야 할 diagnostics 대상 URI를 수집함.
   *
   * @param state - URI를 읽어올 workspace snapshot
   * @returns snapshot이 담고 있는 전체 문서 URI 목록
   */
  private collectWorkspaceStateUris(state: WorkspaceDiagnosticsState | null): readonly string[] {
    if (!state) {
      return [];
    }

    return state.scanResult.files
      .map((file) => file.uri)
      .sort((left, right) => left.localeCompare(right));
  }

  /**
   * collectAffectedCodeLensUris 함수.
   * activation-chain 변화로 다시 계산해야 할 lorebook CodeLens 대상을 수집함.
   *
   * @param changedUris - 직접 변경된 문서 URI 목록
   * @param previousState - 변경 전 workspace state
   * @param nextState - 변경 후 workspace state
   * @returns CodeLens refresh가 필요한 lorebook URI 목록
   */
  private collectAffectedCodeLensUris(
    changedUris: readonly string[],
    previousState: WorkspaceDiagnosticsState | null,
    nextState: WorkspaceDiagnosticsState | null,
  ): readonly string[] {
    const affected = new Set<string>();

    for (const state of [previousState, nextState]) {
      if (!state) {
        continue;
      }

      for (const uri of state.activationChainService.collectAffectedUris(changedUris)) {
        if (state.registry.getFileByUri(uri)?.artifact === 'lorebook') {
          affected.add(uri);
        }
      }
    }

    return [...affected].sort((left, right) => left.localeCompare(right));
  }

  /**
   * collectWorkspaceCodeLensUris 함수.
   * workspace snapshot 전체에서 CodeLens refresh 대상으로 다시 알려야 할 lorebook URI를 수집함.
   *
   * @param state - lorebook URI를 읽어올 workspace snapshot
   * @returns 현재 snapshot이 보유한 lorebook URI 목록
   */
  private collectWorkspaceCodeLensUris(state: WorkspaceDiagnosticsState | null): readonly string[] {
    if (!state) {
      return [];
    }

    return state.scanResult.files
      .filter((file) => file.artifact === 'lorebook')
      .map((file) => file.uri)
      .sort((left, right) => left.localeCompare(right));
  }

  /**
   * refreshWorkspaceUris 함수.
   * 변경 URI가 속한 workspace를 다시 빌드하고 diagnostics/CodeLens/LuaLS 후속 작업을 연결함.
   *
   * @param changedUris - 갱신을 유발한 문서 URI 목록
   * @param reason - refresh 원인
   */
  private refreshWorkspaceUris(
    changedUris: readonly string[],
    reason: WorkspaceRefreshReason,
  ): void {
    const workspaceRoots = [
      ...new Set(
        changedUris
          .map((uri) =>
            CbsLspPathHelper.resolveWorkspaceRootFromFilePath(CbsLspPathHelper.getFilePathFromUri(uri)),
          )
          .filter((value): value is string => value !== null),
      ),
    ].sort((left, right) => left.localeCompare(right));

    const affectedCodeLensUris = new Set<string>();

    for (const workspaceRoot of workspaceRoots) {
      const workspaceChangedUris = changedUris
        .filter(
          (uri) =>
            CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
              CbsLspPathHelper.getFilePathFromUri(uri),
            ) === workspaceRoot,
        )
        .sort((left, right) => left.localeCompare(right));
      const previousState = this.workspaceStateRepository.getByRoot(workspaceRoot);
      const affectedUris = new Set<string>();

      for (const uri of workspaceChangedUris) {
        for (const affectedUri of this.collectAffectedUris(uri, previousState, null)) {
          affectedUris.add(affectedUri);
        }
        for (const affectedUri of this.collectAffectedCodeLensUris([uri], previousState, null)) {
          affectedCodeLensUris.add(affectedUri);
        }
      }

      const refreshMode = previousState ? 'incremental' : 'full';
      const rebuildStart = performance.now();
      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-start', {
        rootPath: workspaceRoot,
        reason,
        changedUris: workspaceChangedUris.length,
        mode: refreshMode,
      });

      const nextState = previousState
        ? createIncrementalWorkspaceDiagnosticsState(previousState, this.documents, workspaceChangedUris)
        : createWorkspaceDiagnosticsState(workspaceRoot, this.documents);

      this.workspaceStateRepository.replace(workspaceRoot, nextState);
      if (nextState) {
        this.luaLsCompanionController.syncWorkspaceDocuments(workspaceRoot, nextState.scanResult.files);
        this.luaLsCompanionController.refreshWorkspaceConfiguration({
          rootPath: workspaceRoot,
        });
      } else {
        this.luaLsCompanionController.clearWorkspaceDocuments(workspaceRoot);
      }

      for (const uri of workspaceChangedUris) {
        for (const affectedUri of this.collectAffectedUris(uri, null, nextState)) {
          affectedUris.add(affectedUri);
        }
        for (const affectedUri of this.collectAffectedCodeLensUris([uri], null, nextState)) {
          affectedCodeLensUris.add(affectedUri);
        }
      }

      traceFeatureResult(this.connection, 'workspace', 'state-rebuild-end', {
        rootPath: workspaceRoot,
        reason,
        mode: refreshMode,
        durationMs: Math.round(performance.now() - rebuildStart),
        affectedDiagnosticsUris: affectedUris.size,
        affectedCodeLensUris: [...affectedCodeLensUris].filter(
          (uri) =>
            CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
              CbsLspPathHelper.getFilePathFromUri(uri),
            ) === workspaceRoot,
        ).length,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });

      for (const uri of [...affectedUris].sort((left, right) => left.localeCompare(right))) {
        this.diagnosticsPublisher.publish(uri, nextState);
      }
    }

    this.codeLensRefreshScheduler.schedule(
      reason,
      [...affectedCodeLensUris].sort((left, right) => left.localeCompare(right)),
    );
  }
}
