/**
 * Workspace refresh module contracts.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/refreshContracts.ts
 */

import type {
  WorkspaceDiagnosticsState,
  WorkspaceRefreshReason,
} from '../../helpers/server-workspace-helper';

export type { WorkspaceDiagnosticsState, WorkspaceRefreshReason } from '../../helpers/server-workspace-helper';

export type RefreshMode = 'full' | 'incremental';

export interface WorkspaceRefreshRequest {
  reason: WorkspaceRefreshReason;
  changedUris: readonly string[];
  modeHint?: 'auto' | 'full';
  prioritySourceUris?: readonly string[];
}

export interface WorkspaceFullRefreshRequest {
  reason: WorkspaceRefreshReason;
  workspaceRoots: readonly string[];
}

export type RefreshBatch =
  | {
      kind: 'document-change';
      reason: 'document-change';
      uris: readonly string[];
      debounceMs: number;
    }
  | {
      kind: 'document-open';
      reason: 'document-open';
      uris: readonly string[];
      deferMs: 0;
    };

export interface WorkspaceRefreshRootResult {
  rootPath: string;
  mode: RefreshMode;
  changedUris: readonly string[];
  previousState: WorkspaceDiagnosticsState | null;
  nextState: WorkspaceDiagnosticsState | null;
  affectedDiagnosticsUris: readonly string[];
  affectedCodeLensUris: readonly string[];
  rebuilt: boolean;
  snapshotVersion: number | null;
}

export interface WorkspaceRefreshResult {
  reason: WorkspaceRefreshReason;
  roots: readonly WorkspaceRefreshRootResult[];
  diagnosticsUris: readonly string[];
  codeLensUris: readonly string[];
}
