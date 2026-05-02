/**
 * CBS LSP CodeLens refresh scheduler.
 * @file packages/cbs-lsp/src/controllers/CodeLensRefreshScheduler.ts
 */

import { CodeLensRefreshRequest, type Connection } from 'vscode-languageserver/node';

import type { WorkspaceRefreshReason } from '../helpers/server-workspace-helper';
import { traceFeaturePayload, traceFeatureRequest } from '../utils/server-tracing';

export interface CodeLensRefreshSchedulerOptions {
  connection: Connection;
  supportsRefresh: () => boolean;
}

/**
 * CodeLensRefreshScheduler 클래스.
 * workspace/codeLens/refresh 요청 정책을 한 곳에서 관리함.
 */
export class CodeLensRefreshScheduler {
  private readonly connection: Connection;

  private readonly supportsRefresh: () => boolean;

  /**
   * constructor 함수.
   * refresh capability와 request transport를 보관함.
   *
   * @param options - scheduler 의존성 묶음
   */
  constructor(options: CodeLensRefreshSchedulerOptions) {
    this.connection = options.connection;
    this.supportsRefresh = options.supportsRefresh;
  }

  /**
   * schedule 함수.
   * 조건이 맞을 때만 workspace/codeLens/refresh 요청을 즉시 스케줄링함.
   *
   * @param reason - 이번 refresh가 발생한 원인
   * @param affectedUris - 영향을 받은 lorebook URI 목록
   */
  schedule(reason: WorkspaceRefreshReason, affectedUris: readonly string[]): void {
    if (reason === 'document-open' || affectedUris.length === 0) {
      traceFeatureRequest(this.connection, 'workspace', 'codelens-refresh-skip', {
        reason,
        affectedLorebooks: affectedUris.length,
        supported: this.supportsRefresh(),
      });
      return;
    }

    if (!this.supportsRefresh()) {
      traceFeatureRequest(this.connection, 'workspace', 'codelens-refresh-skip', {
        reason,
        affectedLorebooks: affectedUris.length,
        supported: false,
      });
      return;
    }

    traceFeaturePayload(this.connection, 'workspace', 'codelens-refresh-requested', {
      reason,
      affectedUris,
    });
    void this.flush();
  }

  /**
   * flush 함수.
   * 누적된 refresh 요청을 connection으로 전송함.
   *
   * @returns refresh request 완료 promise
   */
  async flush(): Promise<void> {
    await this.connection.sendRequest(CodeLensRefreshRequest.type);
  }
}
