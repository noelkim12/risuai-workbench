/**
 * cbs-lsp server feature trace helpers.
 * @file packages/cbs-lsp/src/server-tracing.ts
 */

import type { Connection } from 'vscode-languageserver/node';

export type CbsLspFeatureName =
  | 'server'
  | 'diagnostics'
  | 'completion'
  | 'hover'
  | 'signature'
  | 'folding'
  | 'semanticTokens';

export interface FeatureTraceDetails {
  uri?: string;
  version?: number | string;
  [key: string]: number | string | boolean | null | undefined;
}

export type FeatureTracePayload = unknown;

/**
 * formatFeatureTraceMessage 함수.
 * feature 이름과 phase를 사람이 읽기 쉬운 trace 메시지로 정리함.
 *
 * @param feature - trace를 남길 기능 이름
 * @param phase - 기능 내부 phase 이름
 * @returns 공통 prefix가 포함된 trace 메시지
 */
function formatFeatureTraceMessage(feature: CbsLspFeatureName, phase: string): string {
  return `[cbs-lsp:${feature}] ${phase}`;
}

/**
 * formatFeatureTraceDetails 함수.
 * verbose trace payload를 안정적인 key=value 문자열로 정규화함.
 *
 * @param details - trace에 실을 부가 정보
 * @returns trace verbose 문자열, 내용이 없으면 undefined
 */
function formatFeatureTraceDetails(details?: FeatureTraceDetails): string | undefined {
  if (!details) {
    return undefined;
  }

  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
}

/**
 * traceFeature 함수.
 * connection tracer를 통해 feature-scoped trace를 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param details - 선택적 상세 정보
 */
export function traceFeature(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  details?: FeatureTraceDetails,
): void {
  connection.tracer.log(
    formatFeatureTraceMessage(feature, phase),
    formatFeatureTraceDetails(details),
  );
}

function stableSerializeFeatureTracePayload(payload: FeatureTracePayload): string {
  if (payload === null || typeof payload !== 'object') {
    return JSON.stringify(payload);
  }

  if (Array.isArray(payload)) {
    return `[${payload.map((entry) => stableSerializeFeatureTracePayload(entry)).join(',')}]`;
  }

  const entries = Object.entries(payload).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(
      ([key, value]) => `${JSON.stringify(key)}:${stableSerializeFeatureTracePayload(value)}`,
    )
    .join(',')}}`;
}

/**
 * traceFeaturePayload 함수.
 * machine-readable JSON payload를 trace verbose 채널에 고정된 순서로 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param phase - trace phase 이름
 * @param payload - JSON으로 읽을 수 있는 structured payload
 */
export function traceFeaturePayload(
  connection: Connection,
  feature: CbsLspFeatureName,
  phase: string,
  payload: FeatureTracePayload,
): void {
  connection.tracer.log(
    formatFeatureTraceMessage(feature, phase),
    stableSerializeFeatureTracePayload(payload),
  );
}

/**
 * logFeature 함수.
 * connection console을 통해 feature-scoped 운영 로그를 남김.
 *
 * @param connection - 활성 LSP connection
 * @param feature - 기능 이름
 * @param message - 기록할 운영 메시지
 * @param details - 선택적 상세 정보
 */
export function logFeature(
  connection: Connection,
  feature: CbsLspFeatureName,
  message: string,
  details?: FeatureTraceDetails,
): void {
  const verboseDetails = formatFeatureTraceDetails(details);
  const suffix = verboseDetails ? ` ${verboseDetails}` : '';
  connection.console.log(`${formatFeatureTraceMessage(feature, message)}${suffix}`);
}
