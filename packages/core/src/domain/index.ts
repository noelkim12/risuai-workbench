export { asRecord, type GenericRecord } from './types';
export * from './cbs';
export * from './custom-extension';
export {
  buildFolderMap as buildRisuFolderMap,
  resolveFolderName as resolveRisuFolderName,
  toPosix,
  getLorebookFolderKey,
  createLorebookDirAllocator,
  buildLorebookFolderDirMap,
  planLorebookExtraction,
  type FolderMapOptions,
  type RisuCharbookEntry,
  type LorebookExtractionEntry,
  type LorebookExtractionPlan,
} from './lorebook/folders';
export { sanitizeFilename } from '../utils/filenames';
export {
  getModuleLorebookEntriesFromModule,
  getModuleRegexScriptsFromModule,
  getModuleTriggersFromModule,
  getModuleBackgroundEmbeddingFromModule,
  type MCPModule,
  type RisuModule,
} from './module/index';
export {
  getPresetPromptTextsFromPreset,
  getPresetPromptTemplateItemsFromPreset,
} from './preset/index';
export {
  getCharacterName as getCharxName,
  getCharacterName as getCardName,
  getLorebookEntriesFromCharx as getCharacterBookEntries,
  getModuleLorebookEntries,
  getAllLorebookEntriesFromCharx as getAllLorebookEntries,
  getCustomScriptsFromCharx as getCustomScripts,
  getDefaultVariablesRawFromCharx as getDefaultVariablesRaw,
  type CardData,
  type CharxData,
  type CharxStructure,
  type LorebookEntry,
  type RegexScript,
  type CharxStructure as CardLike,
  type Variable,
} from './charx/data';
export {
  resolveAssetUri,
  guessMimeExt,
  type AssetDict,
  type ResolvedAsset,
} from './asset/asset-uri';
export {
  analyzeLorebookStructure,
  analyzeLorebookStructureFromCharx,
  analyzeLorebookStructureFromCharx as analyzeLorebookStructureFromCard,
  collectLorebookCBS,
  collectLorebookCBSFromCharx,
  collectLorebookCBSFromCharx as collectLorebookCBSFromCard,
  type LorebookStructureEntry,
  type LorebookStructureResult,
} from './lorebook/structure';
export {
  analyzeLorebookActivationChains,
  analyzeLorebookActivationChainsFromCharx,
  analyzeLorebookActivationChainsFromModule,
  type LorebookActivationBlockReason,
  type LorebookActivationChainResult,
  type LorebookActivationEdge,
  type LorebookActivationEdgeStatus,
  type LorebookActivationEntry,
  type LorebookRecursionMode,
} from './lorebook/activation-chain';
export {
  collectRegexCBSFromCharx,
  collectRegexCBSFromCharx as collectRegexCBSFromCard,
  collectRegexCBSFromScripts,
  parseRegexContent,
  serializeRegexContent,
  extractRegexFromCharx,
  extractRegexFromModule,
  extractRegexFromPreset,
  injectRegexIntoCharx,
  injectRegexIntoModule,
  injectRegexIntoPreset,
  buildRegexPath,
  REGEX_TYPES,
  extractRegexScriptOps,
  parseDefaultVariablesText,
  parseDefaultVariablesJson,
  RegexAdapterError,
  type RegexScriptOps,
  type CanonicalRegexEntry,
  type RegexType,
  type UpstreamRegexEntry,
} from './regex';
export {
  MAX_VARS_IN_REPORT,
  MAX_ENTRIES_IN_REPORT,
  MAX_SCRIPTS_IN_REPORT,
  ELEMENT_TYPES,
  CBS_OPS,
  TOKEN_THRESHOLDS,
  TOKEN_RATIOS,
  PipelinePhase,
  PHASE_MAP,
  type ElementType,
} from './analyze/constants';
export {
  estimateTokens,
  analyzeTokenBudget,
  type TokenComponent,
  type TokenBudgetResult,
  type TokenBudgetWarning,
} from './analyze/token-budget';
export { analyzeVariableFlow } from './analyze/variable-flow';
export { analyzeTextMentions, type TextMentionEdge } from './analyze/text-mention';
export type {
  VarEvent,
  VarFlowEntry,
  VarFlowIssue,
  VarFlowResult,
} from './analyze/variable-flow-types';
export {
  detectDeadCode,
  type DeadCodeFinding,
  type DeadCodeResult,
  type DeadCodeType,
  type LorebookEntryInfo,
  type RegexScriptInfo,
} from './analyze/dead-code';
export {
  analyzeComposition,
  type ArtifactInput,
  type CompositionConflict,
  type CompositionConflictType,
  type CompositionInput,
  type CompositionResult,
} from './analyze/composition';
export {
  analyzePromptChain,
  type PromptChainIssue,
  type PromptChainLink,
  type PromptChainResult,
} from './analyze/prompt-chain';
export {
  buildUnifiedCBSGraph,
  buildLorebookRegexCorrelation,
  buildElementPairCorrelationFromUnifiedGraph,
  type ElementCBSData,
  type ElementPairCorrelation,
  type ElementPairSharedVar,
  type UnifiedVarEntry,
  type LorebookRegexSharedVar,
  type LorebookRegexCorrelation,
} from './analyze/correlation';
export {
  safeArray,
  lineStart,
  lineEnd,
  lineCount,
  nodeKey,
  callArgs,
  strLit,
  exprName,
  assignName,
  directCalleeName,
  sanitizeName,
  toModuleName,
  prefixOf,
  createMaxBlankRun,
  inferLuaFunctionName,
  type LuaASTNode,
} from './analyze/lua-helpers';
export { RISUAI_API, type ApiMeta, LUA_STDLIB_CALLS } from './analyze/lua-api';
export {
  analyzeLuaSource,
  type LuaAnalysisArtifact,
} from './analyze/lua-core';
export {
  type CollectedFunction,
  type CollectedStateVar,
  type CollectedCall,
  type CollectedApiCall,
  type CollectedLoreApiCall,
  type CollectedData,
  type AnalyzePhaseResult,
  type CorrelationEntry,
  type LorebookCorrelation,
  type RegexCorrelation,
  type StateAccessOccurrence,
} from './analyze/lua-analysis-types';
export { runCollectPhase } from './analyze/lua-collector';
export { runAnalyzePhase } from './analyze/lua-analyzer';
