/**
 * Fallback policy classification for unsupported/deferred CBS macros.
 * Defines the macro name sets that control preview-empty, literal-inlay
 * preservation, and control-flow unsupported behavior without changing
 * the underlying policies.
 * @file packages/core/src/domain/cbs/simulator/macros/fallback-policy.ts
 */
import type { CbsSupportClass } from '../support-classification';
import { formatSupportClassLabel } from '../support-label';

/** Asset/media macros that produce empty output in preview mode. */
export const PREVIEW_EMPTY_ASSET_MEDIA_MACROS = new Set(['asset', 'audio', 'bg', 'bgm', 'video', 'video-img', 'image', 'img', 'path']);

/** Inlay macros that preserve literal source text in preview mode. */
export const LITERAL_INLAY_MACROS = new Set(['inlay', 'inlayed', 'inlayeddata']);

/** Control-flow macros classified as unsupported by the simulator. */
export const CONTROL_FLOW_UNSUPPORTED_MACROS = new Set(['call', '#func']);

/**
 * Fallback policy result for an unsupported/deferred macro.
 * Describes how the simulator should handle a macro that has no active handler.
 */
export interface FallbackPolicy {
  /** Output behavior: empty string or source text. */
  readonly output: '' | 'source';
  /** Trace phase label for the macro-skip event. */
  readonly traceMessage: string;
  /** Optional structured details attached to the trace event. */
  readonly traceDetails?: Readonly<Record<string, unknown>>;
  /** Diagnostic message, or undefined if no diagnostic should be emitted. */
  readonly diagnosticMessage?: string;
}

/**
 * classifyMacroFallback 함수.
 * Unsupported 또는 deferred macro에 대한 fallback policy를 분류함.
 * Handler가 없는 known macro의 출력, trace, diagnostic 동작을 결정함.
 *
 * @param canonicalName - registry canonical macro name
 * @param supportClass - support classification for the macro
 * @returns fallback policy describing output, trace, and diagnostic behavior
 */
export function classifyMacroFallback(
  canonicalName: string,
  supportClass: CbsSupportClass,
): FallbackPolicy {
  if (supportClass === 'unsupported' && PREVIEW_EMPTY_ASSET_MEDIA_MACROS.has(canonicalName)) {
    return {
      output: '',
      traceMessage: `asset/media macro ${canonicalName} - preview empty fallback`,
      traceDetails: { policy: 'preview-empty-fallback', supportClass },
      diagnosticMessage: `Preview fallback erased unresolved asset/media macro ${JSON.stringify(canonicalName)} without loading assets`,
    };
  }

  if (supportClass === 'unsupported' && LITERAL_INLAY_MACROS.has(canonicalName)) {
    return {
      output: 'source',
      traceMessage: `inlay macro ${canonicalName} - preserving literal source`,
      traceDetails: { policy: 'inlay-literal-preserved', supportClass },
      diagnosticMessage: `Unresolved inlay macro ${JSON.stringify(canonicalName)} preserved literally by preview policy`,
    };
  }

  if (supportClass === 'unsupported' || supportClass === 'runtime-unknown' || supportClass === 'approximate') {
    return {
      output: 'source',
      traceMessage: `${supportClass} macro ${canonicalName} - preserving source`,
      traceDetails: { policy: 'source-preserved', supportClass },
      diagnosticMessage: `${formatSupportClassLabel(supportClass)} CBS macro ${JSON.stringify(canonicalName)} preserved by simulator policy`,
    };
  }

  // supported, effect-only — deferred handler case
  return {
    output: 'source',
    traceMessage: `${supportClass} macro ${canonicalName} - evaluation deferred`,
  };
}
