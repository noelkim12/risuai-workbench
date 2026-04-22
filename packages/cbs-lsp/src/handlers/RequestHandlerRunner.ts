/**
 * CBS LSP request handler execution helper.
 * @file packages/cbs-lsp/src/handlers/RequestHandlerRunner.ts
 */

import type { CancellationToken, Connection } from 'vscode-languageserver/node';

import { isRequestCancelled } from '../utils/request-cancellation';
import {
  traceFeatureRequest,
  traceFeatureResult,
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

    const result = options.run();
    traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
      uri,
      ...options.summarize?.(result),
    });
    return result;
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

    const result = await options.run();
    traceFeatureResult(this.connection, options.feature, options.phases?.end ?? 'end', {
      uri,
      ...options.summarize?.(result),
    });
    return result;
  }
}
