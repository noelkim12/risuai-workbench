export type {
  DistBuildStrategy,
  LuaDetectedRoot,
  LuaHostApiSummary,
  LuaPlanRisk,
  LuaPlannedFile,
  LuaSourceRange,
  LuaTopLevelAtom,
  LuaTopLevelAtomKind,
  ModuleKind,
  RisuLuaSourceProfile,
  RisuLuaSplitMode,
  RisuLuaSplitPlan,
  RisuLuaSplitValidationCode,
  RisuLuaSplitValidationFinding,
  RisuLuaSplitValidationSummary,
  RisuLuaValidatorSeverity,
  LuaRuntimeLoadKind,
  LuaRuntimeRiskId,
  LuaRuntimeRiskLevel,
  LuaRuntimeRiskPolicyFinding,
  LuaRuntimeRiskPolicyInput,
  RisuLuaPreloadModulePlan,
  RisuLuaPreloadRecoveryMetadata,
  RisuLuaPreloadRequireDiagnostic,
  SourceProfileDynamicRequire,
  SourceProfilePackagePathMutation,
  SourceProfilePreloadModule,
  SourceProfileResult,
  SourceProfileRuntimeLoad,
  SourceProfileSectionMarker,
  SourceProfileStaticRequire,
  SourceProfileSummary,
  SplitConfidence,
} from './shared/types';

export { detectRisuLuaSourceProfile } from './profiling/source-profile';
export { classifyLuaRuntimeLoadRisk, evaluateLuaRuntimeRiskPolicy } from './profiling/lua-runtime-risk-policy';
export {
  createRisuLuaReportOnlyArtifacts,
  type CreateRisuLuaReportOnlyPlanInput,
  type RisuLuaReportOnlyArtifacts,
  type RisuLuaReportOnlyPlan,
} from './planners/report-only-planner';
export {
  RISULUA_SPLIT_PLAN_PATH,
  serializeRisuLuaSplitPlan,
  writeRisuLuaSplitPlan,
  type WriteRisuLuaSplitPlanOptions,
  type WriteRisuLuaSplitPlanResult,
} from './output/plan-writer';
export {
  RISULUA_SPLIT_REPORT_PATH,
  renderRisuLuaSplitReport,
  writeRisuLuaSplitReport,
  type RisuLuaSplitReportContext,
  type WriteRisuLuaSplitReportOptions,
  type WriteRisuLuaSplitReportResult,
} from './output/report-writer';

export { buildTopLevelInventory, atomToSourceRange, type InventoryOptions } from './inventory/top-level-inventory';
export {
  buildLineStarts,
  offsetToLineColumn,
  lineAtOffset,
  totalLineCount,
  clampOffset,
  lineStartAtOffset,
  lineEndAtOffset,
  type LineInfo,
} from './shared/range-utils';
export {
  sliceSourceRange,
  sliceSourceOffsets,
  reconstructTopLevelText,
  rangesAreNonOverlapping,
} from './shared/source-slice';
export {
  sanitizePathSegment,
  isPathSafe,
  buildSafeRelativePath,
  sanitizePreloadId,
  evaluatePathPolicy,
  type PathPolicyResult,
  type PathPolicyAcceptance,
  type PathPolicyRejection,
} from './shared/path-policy';
export {
  extractRisuLuaSections,
  type ExtractRisuLuaSectionsResult,
  type RisuLuaExtractedSection,
} from './extractors/section-extractor';
export {
  createRisuLuaSectionRecoveryArtifacts,
  renderSectionMain,
  writeRisuLuaSectionRecoveryWorkspace,
  type CreateRisuLuaSectionRecoveryInput,
  type RisuLuaSectionRecoveryArtifacts,
  type WriteRisuLuaSectionRecoveryWorkspaceOptions,
} from './planners/section-recovery-planner';
export {
  collectStaticRequires,
  extractRisuLuaPreloadModules,
  type ExtractRisuLuaPreloadModulesResult,
  type RisuLuaExtractedPreloadModule,
} from './extractors/preload-extractor';
export {
  createRisuLuaPreloadRecoveryArtifacts,
  renderPreloadMain,
  writeRisuLuaPreloadRecoveryWorkspace,
  type CreateRisuLuaPreloadRecoveryInput,
  type RisuLuaPreloadRecoveryArtifacts,
  type RisuLuaPreloadRecoveryPlan,
  type WriteRisuLuaPreloadRecoveryWorkspaceOptions,
} from './planners/preload-recovery-planner';
export {
  writeRisuLuaWorkspaceFiles,
  type RisuLuaWorkspaceFile,
  type WriteRisuLuaWorkspaceFilesOptions,
  type WriteRisuLuaWorkspaceFilesResult,
} from './output/workspace-writer';
export {
  classifyAtomForCoarseSplit,
  isAtomScopeSafe,
  filePathToModuleId,
  type AtomClassification,
} from './inventory/confidence';
export {
  createRisuLuaPlainCoarseArtifacts,
  renderPlainCoarseMain,
  writeRisuLuaPlainCoarseWorkspace,
  type CreateRisuLuaPlainCoarseInput,
  type RisuLuaPlainCoarseArtifacts,
  type WriteRisuLuaPlainCoarseWorkspaceOptions,
} from './planners/plain-coarse-planner';
export {
  createRisuLuaMixedPreserveArtifacts,
  renderMixedPreserveMain,
  writeRisuLuaMixedPreserveWorkspace,
  type CreateRisuLuaMixedPreserveInput,
  type RisuLuaMixedPreserveArtifacts,
  type RisuLuaMixedPreservePlan,
  type WriteRisuLuaMixedPreserveWorkspaceOptions,
} from './planners/mixed-preserve-planner';
export {
  buildRisuLuaSplitDist,
  type BuildRisuLuaSplitDistOptions,
  type RisuLuaSplitDistBuildResult,
} from './output/dist-builder';
export {
  attachRisuLuaSplitValidation,
  validateRisuLuaSplitWorkspace,
  type ValidateRisuLuaSplitWorkspaceOptions,
} from './output/validators';
export {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_CLASSIFICATION_CODES,
  RISULUA_MODULE_TABLE_CLASSIFIER_PRECEDENCE,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES,
  RISULUA_MODULE_TABLE_MVP_ARTIFACT_PATHS,
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  createEmptyRisuLuaModuleTableHostEffects,
  isAllowedRisuLuaModuleTableMvpTarget,
  isForbiddenRisuLuaModuleTableMvpTarget,
  isRisuLuaModuleTableClassificationCode,
  validateRisuLuaModuleTableDomainCandidates,
  validateRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableBridgeMetadata,
  type RisuLuaModuleTableClassificationCode,
  type RisuLuaModuleTableClassifierPrecedence,
  type RisuLuaModuleTableDeclarationKind,
  type RisuLuaModuleTableDomainCandidateContract,
  type RisuLuaModuleTableHostEffectClass,
  type RisuLuaModuleTableHostEffects,
  type RisuLuaModuleTableInvariantCode,
  type RisuLuaModuleTableInvariantFinding,
  type RisuLuaModuleTableMainAssignment,
  type RisuLuaModuleTableModuleCategory,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableParentContract,
  type RisuLuaModuleTablePreservedContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table/module-table-contracts';
export {
  createRisuLuaModuleTableDomainCandidatesDocument,
  createRisuLuaModuleTableRefactorMapDocument,
  renderRisuLuaModuleTableReportSections,
  serializeRisuLuaModuleTableDomainCandidates,
  serializeRisuLuaModuleTableRefactorMap,
  writeRisuLuaModuleTableDomainCandidates,
  writeRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableArtifactSummary,
  type RisuLuaModuleTableBridgeSummary,
  type RisuLuaModuleTableDomainCandidatesDocument,
  type RisuLuaModuleTableRefactorMapDocument,
  type WriteRisuLuaModuleTableJsonOptions,
  type WriteRisuLuaModuleTableJsonResult,
} from './module-table/module-table-rendering';
export {
  parseRisuLuaModuleTableSource,
  type RisuLuaModuleTableParserRange,
  type RisuLuaModuleTableParseFailure,
  type RisuLuaModuleTableParseResult,
  type RisuLuaModuleTableParseSuccess,
  type RisuLuaModuleTableRangeKind,
  type RisuLuaModuleTableSyntaxError,
  type RisuLuaTreeSitterPoint,
  type RisuLuaTreeSitterPointRange,
} from './module-table/module-table-parser';
export {
  analyzeRisuLuaModuleTable,
  type RisuLuaModuleTableAnalyzerInput,
  type RisuLuaModuleTableAnalyzerResult,
  type RisuLuaModuleTableCallSiteFact,
  type RisuLuaModuleTableLexicalSymbolFact,
  type RisuLuaModuleTableMutationFact,
  type RisuLuaModuleTableNestedHandlerHelperFact,
  type RisuLuaModuleTableProceduralBlockFact,
  type RisuLuaModuleTablePublicGlobalFact,
  type RisuLuaModuleTablePublicGlobalKind,
  type RisuLuaModuleTableReferenceFact,
  type RisuLuaModuleTableRuntimeRootFact,
  type RisuLuaModuleTableRuntimeRootKind,
  type RisuLuaModuleTableScopeFact,
  type RisuLuaModuleTableScopeKind,
  type RisuLuaModuleTableWrapperKind,
} from './module-table/module-table-analyzer';
export {
  classifyRisuLuaModuleTableDecisions,
  type RisuLuaModuleTableClassificationResult,
  type RisuLuaModuleTableClassifierInput,
  type RisuLuaModuleTableParameterizedHelperDecision,
} from './module-table/module-table-classifier';
export {
  createRisuLuaUtf8ByteStringMap,
  type RisuLuaStringIndexRange,
  type RisuLuaUtf8ByteRange,
  type RisuLuaUtf8ByteStringMap,
} from './shared/utf8-byte-range-map';
export {
  planDryRunRefactorMap,
  validateDryRunEditPlan,
  validateWriterParity,
  type DryRunEdit,
  type DryRunEditIntent,
  type DryRunEditPlan,
  type DryRunPlanInput,
  type DryRunPlanResult,
  type DryRunValidationCode,
  type DryRunValidationFinding,
  type DryRunValidationResult,
} from './module-table/module-table-refactor-map';
export {
  planTopLevelRewrite,
  type ModuleBodyPlan,
  type MainRewritePlan,
  type TopLevelRewriteResult,
  type TopLevelRewriteInput,
} from './module-table/module-table-top-level-rewrite';
export {
  planNestedHandlerRewrite,
  type HandlerHelperModulePlan,
  type HandlerBodyRewritePlan,
  type NestedHandlerRewriteResult,
  type NestedHandlerRewriteInput,
} from './module-table/module-table-nested-handler-rewrite';
export {
  createRisuLuaModuleTableArtifacts,
  writeRisuLuaModuleTableWorkspace,
  type CreateRisuLuaModuleTableArtifactsInput,
  type RisuLuaModuleTableArtifacts,
  type WriteRisuLuaModuleTableWorkspaceOptions,
} from './module-table/module-table-writer';
