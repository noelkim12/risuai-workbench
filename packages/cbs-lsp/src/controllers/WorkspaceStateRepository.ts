/**
 * CBS LSP workspace state repository.
 * @file packages/cbs-lsp/src/controllers/WorkspaceStateRepository.ts
 */

import { CbsLspPathHelper } from '../helpers/path-helper';
import type { WorkspaceDiagnosticsState } from '../helpers/server-workspace-helper';

/**
 * WorkspaceStateRepository 클래스.
 * workspace diagnostics state map의 소유권을 한 객체로 모음.
 */
export class WorkspaceStateRepository {
  private readonly workspaceStateByRoot = new Map<string, WorkspaceDiagnosticsState>();

  /**
   * listRoots 함수.
   * 현재 저장된 workspace root 목록을 deterministic ordering으로 반환함.
   *
   * @returns 정렬된 workspace root 경로 배열
   */
  listRoots(): string[] {
    return [...this.workspaceStateByRoot.keys()].sort((left, right) => left.localeCompare(right));
  }

  /**
   * getByUri 함수.
   * URI가 속한 workspace state를 조회함.
   *
   * @param uri - workspace state를 찾을 문서 URI
   * @returns 해당 URI가 속한 workspace state 또는 null
   */
  getByUri(uri: string): WorkspaceDiagnosticsState | null {
    const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
      CbsLspPathHelper.getFilePathFromUri(uri),
    );
    return workspaceRoot ? this.workspaceStateByRoot.get(workspaceRoot) ?? null : null;
  }

  /**
   * getByRoot 함수.
   * workspace root 기준으로 state를 조회함.
   *
   * @param rootPath - 조회할 workspace root 경로
   * @returns 저장된 workspace state 또는 null
   */
  getByRoot(rootPath: string): WorkspaceDiagnosticsState | null {
    return this.workspaceStateByRoot.get(rootPath) ?? null;
  }

  /**
   * replace 함수.
   * rootPath에 대응하는 state를 새 값으로 교체하거나 제거함.
   *
   * @param rootPath - 갱신할 workspace root 경로
   * @param state - 저장할 새 state, null이면 제거
   */
  replace(rootPath: string, state: WorkspaceDiagnosticsState | null): void {
    if (state) {
      this.workspaceStateByRoot.set(rootPath, state);
      return;
    }

    this.workspaceStateByRoot.delete(rootPath);
  }

  /**
   * clear 함수.
   * 저장된 모든 workspace state를 제거함.
   */
  clear(): void {
    this.workspaceStateByRoot.clear();
  }
}
