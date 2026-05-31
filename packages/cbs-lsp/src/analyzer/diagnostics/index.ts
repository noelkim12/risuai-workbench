/**
 * cbs-lsp diagnostics 도메인 public export — explicit named surface.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/index.ts
 */

export { DiagnosticsEngine } from './diagnostics-engine';
export {
  DiagnosticCode,
  DIAGNOSTIC_TAXONOMY,
  getDiagnosticDefinition,
  createDiagnosticRuleExplanation,
  type DiagnosticOwner,
  type DiagnosticRuleCategory,
} from './taxonomy';
export { createDiagnosticInfo, normalizeDiagnosticInfo, stabilizeDiagnostics } from './diagnostic-info';
export { createDiagnosticsContext, type DiagnosticsContext } from './context';
export { collectParserDiagnostics } from './collectors/parser-diagnostic.collector';
export { collectMacroDiagnostics } from './collectors/macro.collector';
export { collectBlockDiagnostics } from './collectors/block.collector';
export { collectLegacyAngleBracketDiagnostics } from './collectors/legacy-angle.collector';
export { collectSymbolDiagnostics } from './symbol-diagnostics';
export { filterPureModeDiagnostics } from './pure-mode-filter';
export type { DiagnosticQuickFix, DiagnosticMachineData } from './quick-fix';
export { extractBlockHeaderInfo } from './block-header';
export { DEFERRED_SCOPE_CONTRACT } from '../../core/availability-contract';
export type { DeferredFeatureAvailabilityMap, DeferredScopeContract } from '../../core/availability-contract';
