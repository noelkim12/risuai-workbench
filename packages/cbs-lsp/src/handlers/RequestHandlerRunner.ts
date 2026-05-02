/**
 * CBS LSP request handler execution helper.
 * @file packages/cbs-lsp/src/handlers/RequestHandlerRunner.ts
 */

import type { CancellationToken, Connection } from 'vscode-languageserver/node';

import { isRequestCancelled } from '../utils/request-cancellation';
import {
  traceFeatureRequest,
  traceFeatureResult,
  warnFeature,
  type CbsLspFeatureName,
  type FeatureTraceDetails,
} from '../utils/server-tracing';

interface RunnerPhases {
  cancelled?: string;
  end?: string;
  start?: string;
}

interface RunnerOptions<TParams, TResult> {
  empty: TResult;
  feature: CbsLspFeatureName;
  getUri: (params: TParams) => string;
  params: TParams;
  phases?: RunnerPhases;
  recoverOnError?: boolean;
  run: () => TResult;
  startDetails?: (params: TParams) => FeatureTraceDetails | undefined;
  summarize?: (result: TResult) => FeatureTraceDetails | undefined;
  token?: CancellationToken;
}

interface AsyncRunnerOptions<TParams, TResult> extends Omit<RunnerOptions<TParams, TResult>, 'run'> {
  run: () => Promise<TResult>;
}

/**
 * RequestHandlerRunner 클래스.
 * feature handler의 trace 시작/취소/종료 패턴을 공통으로 실행함.
 */
export class RequestHandlerRunner {
  /**
   * constructor 함수.
   * trace를 남길 LSP connection을 보관함.
   *
   * @param connection - feature trace/result를 기록할 LSP connection
   */
  constructor(private readonly connection: Connection) {}

  /**
   * runSync 함수.
   * 동기 handler의 공통 trace/cancellation 흐름을 실행함.
   *
   * @param options - handler 실행에 필요한 trace/run 요약 옵션
   * @returns 취소 시 empty, 아니면 run 결과
   */
  runSync<TParams, TResult>(options: RunnerOptions<TParams, TResult>): TResult {
    const uri = options.getUri(options.params);
    const cancelled = isRequestCancelled(options.token);
    traceFeatureRequest(this.connection, options.feature, options.phases?.start ?? 'start', {
      uri,
      cancelled,
      ...options.startDetails?.(options.params),
    });

    if (cancelled) {
      traceFeatureResult(this.connection, options.feature, options.phases?.cancelled ?? 'cancelled', {
        uri,
      });
      return options.empty;
    }

    try {
      const result = options.run();
      traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
        uri,
        ...options.summarize?.(result),
      });
      return result;
    } catch (error) {
      this.logFailure(options.feature, uri, error);
      traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
        uri,
        error: this.formatErrorMessage(error),
      });
      if (!options.recoverOnError) {
        throw error;
      }
      return options.empty;
    }
  }

  /**
   * runAsync 함수.
   * 비동기 handler의 공통 trace/cancellation 흐름을 실행함.
   *
   * @param options - handler 실행에 필요한 trace/run 요약 옵션
   * @returns 취소 시 empty, 아니면 await된 run 결과
   */
  async runAsync<TParams, TResult>(options: AsyncRunnerOptions<TParams, TResult>): Promise<TResult> {
    const uri = options.getUri(options.params);
    const cancelled = isRequestCancelled(options.token);
    traceFeatureRequest(this.connection, options.feature, options.phases?.start ?? 'start', {
      uri,
      cancelled,
      ...options.startDetails?.(options.params),
    });

    if (cancelled) {
      traceFeatureResult(this.connection, options.feature, options.phases?.cancelled ?? 'cancelled', {
        uri,
      });
      return options.empty;
    }

    try {
      const result = await options.run();
      traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
        uri,
        ...options.summarize?.(result),
      });
      return result;
    } catch (error) {
      this.logFailure(options.feature, uri, error);
      traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
        uri,
        error: this.formatErrorMessage(error),
      });
      if (!options.recoverOnError) {
        throw error;
      }
      return options.empty;
    }
  }

  /**
   * logFailure 함수.
   * handler 실패를 운영 로그에 남겨 LSP request가 열린 채 멈춘 것처럼 보이지 않게 함.
   *
   * @param feature - 실패한 feature 이름
   * @param uri - 요청 대상 문서 URI
   * @param error - handler에서 던져진 원본 오류
   */
  private logFailure(feature: CbsLspFeatureName, uri: string, error: unknown): void {
    warnFeature(this.connection, feature, 'error', {
      uri,
      error: this.formatErrorMessage(error),
    });
  }

  /**
   * formatErrorMessage 함수.
   * unknown 오류 값을 trace/log에 넣을 수 있는 짧은 문자열로 정규화함.
   *
   * @param error - handler에서 던져진 원본 오류
   * @returns 사람이 읽을 수 있는 오류 메시지
   */
  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unknown request handler error';
  }
}
