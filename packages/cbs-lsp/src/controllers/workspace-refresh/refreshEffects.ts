/**
 * Workspace refresh side-effect helpers.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/refreshEffects.ts
 */

import type { Connection } from 'vscode-languageserver/node';

import type { CodeLensRefreshScheduler } from '../CodeLensRefreshScheduler';
import type { DiagnosticsPublisher } from '../DiagnosticsPublisher';
import type { LuaLsCompanionController } from '../LuaLsCompanionController';
import { traceFeatureResult } from '../../utils/server-tracing';
import type { WorkspaceDiagnosticsState, WorkspaceRefreshReason } from './refreshContracts';

export interface SyncLuaLsWorkspaceInput {
  connection: Connection;
  luaLsCompanionController: LuaLsCompanionController;
  nextState: WorkspaceDiagnosticsState | null;
  prioritySourceUris?: readonly string[];
  reason: WorkspaceRefreshReason;
  rootPath: string;
}

/**
 * syncLuaLsWorkspace 함수.
 * rebuild 결과를 LuaLS workspace mirror에 sync하거나 root mirror를 정리함.
 *
 * @param input - LuaLS sync에 필요한 state와 trace 정보
 */
export function syncLuaLsWorkspace(input: SyncLuaLsWorkspaceInput): void {
  if (!input.nextState) {
    input.luaLsCompanionController.clearWorkspaceDocuments(input.rootPath);
    return;
  }

  const luaSyncStats = input.luaLsCompanionController.syncWorkspaceDocuments(
    input.rootPath,
    input.nextState.scanResult.files,
    input.reason === 'document-open' ? { prioritySourceUris: input.prioritySourceUris ?? [] } : {},
  );
  traceFeatureResult(input.connection, 'luaProxy', 'workspace-sync', {
    rootPath: input.rootPath,
    reason: input.reason,
    totalFiles: luaSyncStats.totalFiles,
    luaFileCount: luaSyncStats.luaFileCount,
    oversizedSkipped: luaSyncStats.oversizedSkipped,
    unchangedSkipped: luaSyncStats.unchangedSkipped,
    syncedCount: luaSyncStats.syncedCount,
    deferredCount: luaSyncStats.deferredCount,
    shadowDurationMs: luaSyncStats.shadowDurationMs,
  });
}

/**
 * refreshLuaLsWorkspaceConfiguration 함수.
 * rebuild된 workspace root의 LuaLS configuration/library를 다시 주입함.
 *
 * @param controller - LuaLS companion façade
 * @param rootPath - 갱신할 workspace root 경로
 */
export function refreshLuaLsWorkspaceConfiguration(
  controller: LuaLsCompanionController,
  rootPath: string,
): void {
  controller.refreshWorkspaceConfiguration({ rootPath });
}

/**
 * publishAffectedDiagnostics 함수.
 * 계산된 diagnostics 대상 URI를 현재 workspace state로 publish함.
 *
 * @param diagnosticsPublisher - diagnostics publish 담당 객체
 * @param uris - publish 대상 URI 목록
 * @param state - diagnostics 계산에 사용할 workspace state
 */
export function publishAffectedDiagnostics(
  diagnosticsPublisher: DiagnosticsPublisher,
  uris: readonly string[],
  state: WorkspaceDiagnosticsState | null,
): void {
  for (const uri of uris) {
    diagnosticsPublisher.publish(uri, state);
  }
}

/**
 * scheduleAffectedCodeLensRefresh 함수.
 * 계산된 lorebook URI에 대한 CodeLens refresh를 요청함.
 *
 * @param scheduler - CodeLens refresh scheduler
 * @param reason - refresh 원인
 * @param uris - 영향받은 lorebook URI 목록
 */
export function scheduleAffectedCodeLensRefresh(
  scheduler: CodeLensRefreshScheduler,
  reason: WorkspaceRefreshReason,
  uris: readonly string[],
): void {
  scheduler.schedule(reason, uris);
}
