export { asRecord, type GenericRecord } from './types';
export { extractCBSVarOps, type CBSVarOps } from './cbs/cbs';
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
  getCharacterName as getCharxName,
  getCharacterName as getCardName,
  getLorebookEntriesFromCharx as getCharacterBookEntries,
  getModuleLorebookEntries,
  getAllLorebookEntriesFromCharx as getAllLorebookEntries,
  getCustomScriptsFromCharx as getCustomScripts,
  getDefaultVariablesRawFromCharx as getDefaultVariablesRaw,
  type CharxStructure,
  type CharxStructure as CardLike,
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
  collectRegexCBSFromCharx,
  collectRegexCBSFromCharx as collectRegexCBSFromCard,
  collectRegexCBSFromScripts,
  extractRegexScriptOps,
  parseDefaultVariablesText,
  parseDefaultVariablesJson,
  type RegexScriptOps,
} from './regex/scripts';
export {
  MAX_VARS_IN_REPORT,
  MAX_ENTRIES_IN_REPORT,
  MAX_SCRIPTS_IN_REPORT,
  ELEMENT_TYPES,
  CBS_OPS,
  type ElementType,
} from './analyze/constants';
export {
  buildUnifiedCBSGraph,
  buildLorebookRegexCorrelation,
  type ElementCBSData,
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
} from './analyze/lua-analysis-types';
export { runCollectPhase } from './analyze/lua-collector';
export { runAnalyzePhase } from './analyze/lua-analyzer';
