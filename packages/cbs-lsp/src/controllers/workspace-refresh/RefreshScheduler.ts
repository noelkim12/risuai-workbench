/**
 * Workspace refresh document event scheduler.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/RefreshScheduler.ts
 */

import type { Connection } from 'vscode-languageserver/node';

import { traceFeatureRequest } from '../../utils/server-tracing';
import type { RefreshBatch } from './refreshContracts';

export interface TimerHost {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface RefreshSchedulerOptions {
  connection: Connection;
  documentChangeDebounceMs: number;
  onFlush: (batch: RefreshBatch) => void;
  timerHost?: TimerHost;
}

const DEFAULT_TIMER_HOST: TimerHost = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * RefreshScheduler 클래스.
 * document change/open queue와 timer flush 순서를 관리함.
 */
export class RefreshScheduler {
  private pendingDocumentChangeTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly pendingDocumentChangeUris = new Set<string>();

  private pendingDocumentOpenTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly pendingDocumentOpenUris = new Set<string>();

  private readonly connection: Connection;

  private readonly documentChangeDebounceMs: number;

  private readonly onFlush: (batch: RefreshBatch) => void;

  private readonly timerHost: TimerHost;

  /**
   * constructor 함수.
   * debounce 설정과 timer host, flush callback을 보관함.
   *
   * @param options - scheduler 의존성 묶음
   */
  constructor(options: RefreshSchedulerOptions) {
    this.connection = options.connection;
    this.documentChangeDebounceMs = options.documentChangeDebounceMs;
    this.onFlush = options.onFlush;
    this.timerHost = options.timerHost ?? DEFAULT_TIMER_HOST;
  }

  /**
   * scheduleDocumentChange 함수.
   * document-change refresh를 debounce queue에 추가함.
   *
   * @param uri - 변경된 문서 URI
   */
  scheduleDocumentChange(uri: string): void {
    this.pendingDocumentChangeUris.add(uri);
    if (this.pendingDocumentChangeTimer) {
      this.timerHost.clearTimeout(this.pendingDocumentChangeTimer);
    }

    traceFeatureRequest(this.connection, 'workspace', 'document-change-refresh-scheduled', {
      uri,
      pendingUris: this.pendingDocumentChangeUris.size,
      debounceMs: this.documentChangeDebounceMs,
    });

    this.pendingDocumentChangeTimer = this.timerHost.setTimeout(() => {
      this.pendingDocumentChangeTimer = undefined;
      this.flushDocumentChange();
    }, this.documentChangeDebounceMs);
  }

  /**
   * scheduleDocumentOpen 함수.
   * document-open refresh를 다음 tick queue에 추가함.
   *
   * @param uri - 열린 문서 URI
   */
  scheduleDocumentOpen(uri: string): void {
    this.pendingDocumentOpenUris.add(uri);
    if (this.pendingDocumentOpenTimer) {
      return;
    }

    traceFeatureRequest(this.connection, 'workspace', 'document-open-refresh-scheduled', {
      uri,
      pendingUris: this.pendingDocumentOpenUris.size,
      deferMs: 0,
    });

    this.pendingDocumentOpenTimer = this.timerHost.setTimeout(() => {
      this.pendingDocumentOpenTimer = undefined;
      this.flushDocumentOpen();
    }, 0);
  }

  /**
   * flushDocumentChange 함수.
   * 누적된 document-change refresh를 즉시 실행함.
   */
  flushDocumentChange(): void {
    if (this.pendingDocumentChangeTimer) {
      this.timerHost.clearTimeout(this.pendingDocumentChangeTimer);
      this.pendingDocumentChangeTimer = undefined;
    }

    if (this.pendingDocumentChangeUris.size === 0) {
      return;
    }

    const uris = sortUris(this.pendingDocumentChangeUris);
    this.pendingDocumentChangeUris.clear();

    traceFeatureRequest(this.connection, 'workspace', 'document-change-refresh-flush', {
      changedUris: uris.length,
      debounceMs: this.documentChangeDebounceMs,
    });

    this.onFlush({
      kind: 'document-change',
      reason: 'document-change',
      uris,
      debounceMs: this.documentChangeDebounceMs,
    });
  }

  /**
   * flushDocumentOpen 함수.
   * 누적된 document-open refresh를 즉시 실행함.
   */
  flushDocumentOpen(): void {
    if (this.pendingDocumentOpenTimer) {
      this.timerHost.clearTimeout(this.pendingDocumentOpenTimer);
      this.pendingDocumentOpenTimer = undefined;
    }

    if (this.pendingDocumentOpenUris.size === 0) {
      return;
    }

    const uris = sortUris(this.pendingDocumentOpenUris);
    this.pendingDocumentOpenUris.clear();

    traceFeatureRequest(this.connection, 'workspace', 'document-open-refresh-flush', {
      changedUris: uris.length,
      deferMs: 0,
    });

    this.onFlush({
      kind: 'document-open',
      reason: 'document-open',
      uris,
      deferMs: 0,
    });
  }

  /**
   * flushAll 함수.
   * document-change 후 document-open 순서로 pending refresh를 비움.
   */
  flushAll(): void {
    this.flushDocumentChange();
    this.flushDocumentOpen();
  }

  /**
   * dispose 함수.
   * 남은 timer를 취소하고 queue를 비움.
   */
  dispose(): void {
    if (this.pendingDocumentChangeTimer) {
      this.timerHost.clearTimeout(this.pendingDocumentChangeTimer);
      this.pendingDocumentChangeTimer = undefined;
    }
    if (this.pendingDocumentOpenTimer) {
      this.timerHost.clearTimeout(this.pendingDocumentOpenTimer);
      this.pendingDocumentOpenTimer = undefined;
    }
    this.pendingDocumentChangeUris.clear();
    this.pendingDocumentOpenUris.clear();
  }
}

/**
 * sortUris 함수.
 * Set에 쌓인 URI를 deterministic ordering으로 변환함.
 *
 * @param uris - 정렬할 URI 집합
 * @returns localeCompare 기준 URI 목록
 */
function sortUris(uris: ReadonlySet<string>): readonly string[] {
  return [...uris].sort((left, right) => left.localeCompare(right));
}
