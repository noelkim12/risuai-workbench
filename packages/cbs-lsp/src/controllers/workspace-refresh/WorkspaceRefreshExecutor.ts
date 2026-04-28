/**
 * Workspace refresh rebuild executor.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/WorkspaceRefreshExecutor.ts
 */

import type { Connection } from 'vscode-languageserver/node';
import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CbsLspPathHelper } from '../../helpers/path-helper';
import {
  createIncrementalWorkspaceDiagnosticsState,
  createWorkspaceDiagnosticsState,
} from '../../helpers/server-workspace-helper';
import { traceFeatureRequest, traceFeatureResult } from '../../utils/server-tracing';
import type { CodeLensRefreshScheduler } from '../CodeLensRefreshScheduler';
import type { DiagnosticsPublisher } from '../DiagnosticsPublisher';
import type { LuaLsCompanionController } from '../LuaLsCompanionController';
import type { WorkspaceStateRepository } from '../WorkspaceStateRepository';
import {
  collectAffectedDiagnosticsUris,
  collectAffectedLorebookCodeLensUris,
  collectWorkspaceLorebookCodeLensUris,
  collectWorkspaceStateUris,
} from './affectedUris';
import {
  publishAffectedDiagnostics,
  refreshLuaLsWorkspaceConfiguration,
  scheduleAffectedCodeLensRefresh,
  syncLuaLsWorkspace,
} from './refreshEffects';
import type {
  RefreshMode,
  WorkspaceFullRefreshRequest,
  WorkspaceRefreshRequest,
  WorkspaceRefreshResult,
  WorkspaceRefreshRootResult,
} from './refreshContracts';

export interface WorkspaceRefreshExecutorOptions {
  codeLensRefreshScheduler: CodeLensRefreshScheduler;
  connection: Connection;
  diagnosticsPublisher: DiagnosticsPublisher;
  documents: TextDocuments<TextDocument>;
  luaLsCompanionController: LuaLsCompanionController;
  workspaceStateRepository: WorkspaceStateRepository;
}

/**
 * WorkspaceRefreshExecutor 클래스.
 * workspace rebuild와 LuaLS/diagnostics/CodeLens 후속 효과 순서를 실행함.
 */
export class WorkspaceRefreshExecutor {
  private readonly codeLensRefreshScheduler: CodeLensRefreshScheduler;

  private readonly connection: Connection;

  private readonly diagnosticsPublisher: DiagnosticsPublisher;

  private readonly documents: TextDocuments<TextDocument>;

  private readonly luaLsCompanionController: LuaLsCompanionController;

  private readonly workspaceStateRepository: WorkspaceStateRepository;

  /**
   * constructor 함수.
   * workspace refresh 실행에 필요한 의존성을 보관함.
   *
   * @param options - executor 의존성 묶음
   */
  constructor(options: WorkspaceRefreshExecutorOptions) {
    this.codeLensRefreshScheduler = options.codeLensRefreshScheduler;
    this.connection = options.connection;
    this.diagnosticsPublisher = options.diagnosticsPublisher;
    this.documents = options.documents;
    this.luaLsCompanionController = options.luaLsCompanionController;
    this.workspaceStateRepository = options.workspaceStateRepository;
  }

  /**
   * refreshChangedUris 함수.
   * 변경 URI가 속한 workspace를 rebuild하고 후속 effect를 실행함.
   *
   * @param request - 변경 URI 기반 refresh 요청
   * @returns root별 refresh 실행 결과
   */
  refreshChangedUris(request: WorkspaceRefreshRequest): WorkspaceRefreshResult {
    const workspaceRoots = collectWorkspaceRoots(request.changedUris);
    const rootResults: WorkspaceRefreshRootResult[] = [];
    const codeLensUris = new Set<string>();

    for (const workspaceRoot of workspaceRoots) {
      const workspaceChangedUris = request.changedUris
        .filter((uri) => resolveWorkspaceRoot(uri) === workspaceRoot)
        .sort((left, right) => left.localeCompare(right));
      const previousState = this.workspaceStateRepository.getByRoot(workspaceRoot);
      const affectedDiagnosticsBefore = collectAffectedDiagnosticsUris(
        workspaceChangedUris,
        previousState,
        null,
      );
      const affectedCodeLensBefore = collectAffectedLorebookCodeLensUris(
        workspaceChangedUris,
        previousState,
        null,
      );
      const refreshMode: RefreshMode = previousState && request.modeHint !== 'full' ? 'incremental' : 'full';
      const rebuildStart = performance.now();

      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-start', {
        rootPath: workspaceRoot,
        reason: request.reason,
        changedUris: workspaceChangedUris.length,
        mode: refreshMode,
      });

      const nextState = refreshMode === 'incremental' && previousState
        ? createIncrementalWorkspaceDiagnosticsState(previousState, this.documents, workspaceChangedUris)
        : createWorkspaceDiagnosticsState(workspaceRoot, this.documents);

      this.workspaceStateRepository.replace(workspaceRoot, nextState);
      syncLuaLsWorkspace({
        connection: this.connection,
        luaLsCompanionController: this.luaLsCompanionController,
        nextState,
        prioritySourceUris: filterWorkspaceUris(
          request.prioritySourceUris ?? workspaceChangedUris,
          workspaceRoot,
        ),
        reason: request.reason,
        rootPath: workspaceRoot,
      });
      if (nextState) {
        refreshLuaLsWorkspaceConfiguration(this.luaLsCompanionController, workspaceRoot);
      }

      const affectedDiagnosticsUris = mergeSortedUris(
        affectedDiagnosticsBefore,
        collectAffectedDiagnosticsUris(workspaceChangedUris, null, nextState),
      );
      const affectedCodeLensUris = mergeSortedUris(
        affectedCodeLensBefore,
        collectAffectedLorebookCodeLensUris(workspaceChangedUris, null, nextState),
      );

      for (const uri of affectedCodeLensUris) {
        codeLensUris.add(uri);
      }

      traceFeatureResult(this.connection, 'workspace', 'state-rebuild-end', {
        rootPath: workspaceRoot,
        reason: request.reason,
        mode: refreshMode,
        durationMs: Math.round(performance.now() - rebuildStart),
        affectedDiagnosticsUris: affectedDiagnosticsUris.length,
        affectedCodeLensUris: affectedCodeLensUris.filter((uri) => resolveWorkspaceRoot(uri) === workspaceRoot).length,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });

      publishAffectedDiagnostics(this.diagnosticsPublisher, affectedDiagnosticsUris, nextState);
      rootResults.push({
        rootPath: workspaceRoot,
        mode: refreshMode,
        changedUris: workspaceChangedUris,
        previousState,
        nextState,
        affectedDiagnosticsUris,
        affectedCodeLensUris,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });
    }

    const sortedCodeLensUris = mergeSortedUris(codeLensUris);
    scheduleAffectedCodeLensRefresh(this.codeLensRefreshScheduler, request.reason, sortedCodeLensUris);

    return {
      reason: request.reason,
      roots: rootResults,
      diagnosticsUris: mergeSortedUris(rootResults.flatMap((root) => root.affectedDiagnosticsUris)),
      codeLensUris: sortedCodeLensUris,
    };
  }

  /**
   * refreshTrackedWorkspaces 함수.
   * 저장소가 추적 중인 workspace root를 full rebuild하고 후속 effect를 실행함.
   *
   * @param request - full refresh 대상 root와 reason
   * @returns root별 refresh 실행 결과
   */
  refreshTrackedWorkspaces(request: WorkspaceFullRefreshRequest): WorkspaceRefreshResult {
    const rootResults: WorkspaceRefreshRootResult[] = [];
    const codeLensUris = new Set<string>();

    for (const workspaceRoot of [...request.workspaceRoots].sort((left, right) => left.localeCompare(right))) {
      const previousState = this.workspaceStateRepository.getByRoot(workspaceRoot);
      const previousUris = collectWorkspaceStateUris(previousState);
      const rebuildStart = performance.now();

      traceFeatureRequest(this.connection, 'workspace', 'state-rebuild-start', {
        rootPath: workspaceRoot,
        reason: request.reason,
        changedUris: 0,
        mode: 'full',
      });

      const nextState = createWorkspaceDiagnosticsState(workspaceRoot, this.documents);
      const nextUris = collectWorkspaceStateUris(nextState);
      const affectedDiagnosticsUris = mergeSortedUris(previousUris, nextUris);

      this.workspaceStateRepository.replace(workspaceRoot, nextState);
      syncLuaLsWorkspace({
        connection: this.connection,
        luaLsCompanionController: this.luaLsCompanionController,
        nextState,
        reason: request.reason,
        rootPath: workspaceRoot,
      });
      if (nextState) {
        refreshLuaLsWorkspaceConfiguration(this.luaLsCompanionController, workspaceRoot);
      }

      const affectedCodeLensUris = mergeSortedUris(
        collectWorkspaceLorebookCodeLensUris(previousState),
        collectWorkspaceLorebookCodeLensUris(nextState),
      );
      for (const uri of affectedCodeLensUris) {
        codeLensUris.add(uri);
      }

      traceFeatureResult(this.connection, 'workspace', 'state-rebuild-end', {
        rootPath: workspaceRoot,
        reason: request.reason,
        mode: 'full',
        durationMs: Math.round(performance.now() - rebuildStart),
        affectedDiagnosticsUris: affectedDiagnosticsUris.length,
        affectedCodeLensUris: affectedCodeLensUris.filter((uri) => resolveWorkspaceRoot(uri) === workspaceRoot).length,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });

      publishAffectedDiagnostics(this.diagnosticsPublisher, affectedDiagnosticsUris, nextState);
      rootResults.push({
        rootPath: workspaceRoot,
        mode: 'full',
        changedUris: [],
        previousState,
        nextState,
        affectedDiagnosticsUris,
        affectedCodeLensUris,
        rebuilt: nextState !== null,
        snapshotVersion: nextState?.workspaceSnapshot.snapshotVersion ?? null,
      });
    }

    const sortedCodeLensUris = mergeSortedUris(codeLensUris);
    scheduleAffectedCodeLensRefresh(this.codeLensRefreshScheduler, request.reason, sortedCodeLensUris);

    return {
      reason: request.reason,
      roots: rootResults,
      diagnosticsUris: mergeSortedUris(rootResults.flatMap((root) => root.affectedDiagnosticsUris)),
      codeLensUris: sortedCodeLensUris,
    };
  }
}

/**
 * filterWorkspaceUris 함수.
 * URI 목록을 특정 workspace root 소속으로 제한하고 정렬함.
 *
 * @param uris - 필터링할 URI 목록
 * @param workspaceRoot - 유지할 workspace root 경로
 * @returns root에 속하는 URI만 정렬한 목록
 */
function filterWorkspaceUris(uris: readonly string[], workspaceRoot: string): readonly string[] {
  return uris
    .filter((uri) => resolveWorkspaceRoot(uri) === workspaceRoot)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * collectWorkspaceRoots 함수.
 * 변경 URI 목록에서 workspace root를 정렬·중복 제거해 수집함.
 *
 * @param uris - 변경 URI 목록
 * @returns 정렬된 workspace root 목록
 */
function collectWorkspaceRoots(uris: readonly string[]): readonly string[] {
  return mergeSortedUris(
    uris
      .map((uri) => resolveWorkspaceRoot(uri))
      .filter((value): value is string => value !== null),
  );
}

/**
 * resolveWorkspaceRoot 함수.
 * URI가 속한 workspace root를 path helper 정책으로 계산함.
 *
 * @param uri - 확인할 문서 URI
 * @returns workspace root 경로 또는 null
 */
function resolveWorkspaceRoot(uri: string): string | null {
  return CbsLspPathHelper.resolveWorkspaceRootFromFilePath(CbsLspPathHelper.getFilePathFromUri(uri));
}

/**
 * mergeSortedUris 함수.
 * 여러 URI iterable을 하나로 합쳐 deterministic ordering으로 정규화함.
 *
 * @param groups - 병합할 URI iterable 목록
 * @returns 중복 제거 후 정렬한 URI 목록
 */
function mergeSortedUris(...groups: readonly Iterable<string>[]): readonly string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const uri of group) {
      merged.add(uri);
    }
  }
  return [...merged].sort((left, right) => left.localeCompare(right));
}
