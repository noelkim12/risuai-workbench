/**
 * Watched-file payload to workspace refresh request adapter.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/watchedFileRefreshRequests.ts
 */

import { FileChangeType, type DidChangeWatchedFilesParams } from 'vscode-languageserver/node';

import { CbsLspPathHelper } from '../../helpers/path-helper';
import type { WorkspaceRefreshReason, WorkspaceRefreshRequest } from './refreshContracts';

/**
 * toWatchedFileRefreshRequests 함수.
 * watched-file 변경 payload를 workspace refresh request 목록으로 변환함.
 *
 * @param params - LSP watched-file 변경 payload
 * @returns reason 첫 등장 순서와 reason별 URI 정렬을 보존한 refresh request 목록
 */
export function toWatchedFileRefreshRequests(
  params: DidChangeWatchedFilesParams,
): readonly WorkspaceRefreshRequest[] {
  const urisByReason = new Map<WorkspaceRefreshReason, Set<string>>();

  for (const change of params.changes) {
    if (!isWorkspaceFileUri(change.uri)) {
      continue;
    }

    const reason = toWatchedFileRefreshReason(change.type);
    if (!urisByReason.has(reason)) {
      urisByReason.set(reason, new Set<string>());
    }
    urisByReason.get(reason)?.add(change.uri);
  }

  return [...urisByReason].map(([reason, uris]) => ({
    reason,
    changedUris: [...uris].sort((left, right) => left.localeCompare(right)),
  }));
}

/**
 * collectWorkspaceWatchedFileChanges 함수.
 * trace payload용 workspace 내부 watched-file 변경만 수집함.
 *
 * @param params - LSP watched-file 변경 payload
 * @returns workspace root가 확인되는 변경 목록
 */
export function collectWorkspaceWatchedFileChanges(
  params: DidChangeWatchedFilesParams,
): DidChangeWatchedFilesParams['changes'] {
  return params.changes.filter((change) => isWorkspaceFileUri(change.uri));
}

/**
 * toWatchedFileRefreshReason 함수.
 * LSP 파일 변경 타입을 workspace refresh reason으로 변환함.
 *
 * @param type - LSP FileChangeType 값
 * @returns watched-file refresh reason
 */
function toWatchedFileRefreshReason(type: FileChangeType): WorkspaceRefreshReason {
  if (type === FileChangeType.Created) {
    return 'watched-file-create';
  }
  if (type === FileChangeType.Deleted) {
    return 'watched-file-delete';
  }
  return 'watched-file-change';
}

/**
 * isWorkspaceFileUri 함수.
 * URI가 현재 workspace root 정책에 포함되는지 확인함.
 *
 * @param uri - 검사할 문서 URI
 * @returns workspace root를 찾으면 true
 */
function isWorkspaceFileUri(uri: string): boolean {
  return (
    CbsLspPathHelper.resolveWorkspaceRootFromFilePath(CbsLspPathHelper.getFilePathFromUri(uri)) !== null
  );
}
