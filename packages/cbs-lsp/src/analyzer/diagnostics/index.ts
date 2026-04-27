/**
 * cbs-lsp diagnostics 도메인 public export 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/index.ts
 */

/** Deferred diagnostics scope contract 상수 re-export. */
export { DEFERRED_SCOPE_CONTRACT } from '../../core/availability-contract';

/** Deferred diagnostics availability 타입 re-export. */
export type {
  DeferredFeatureAvailabilityMap,
  DeferredScopeContract,
} from '../../core/availability-contract';

/** Block header diagnostics helper public export. */
export * from './block-header';
/** Diagnostics comparator public export. */
export * from './compare';
/** Diagnostics context public export. */
export * from './context';
/** DiagnosticInfo factory public export. */
export * from './diagnostic-info';
/** Diagnostics engine public export. */
export * from './diagnostics-engine';
/** Diagnostics quick-fix public export. */
export * from './quick-fix';
/** Diagnostics taxonomy public export. */
export * from './taxonomy';
