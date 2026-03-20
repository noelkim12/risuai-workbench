export { asRecord, type GenericRecord } from './types';
export { extractCBSVarOps, type CBSVarOps } from './cbs';
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
export { sanitizeFilename } from './card/filenames';
export {
  getCardName,
  getCharacterBookEntries,
  getModuleLorebookEntries,
  getAllLorebookEntries,
  getCustomScripts,
  getDefaultVariablesRaw,
  type CardLike,
} from './card/data';
export {
  resolveAssetUri,
  guessMimeExt,
  type AssetDict,
  type ResolvedAsset,
} from './card/asset-uri';
export {
  analyzeLorebookStructure,
  analyzeLorebookStructureFromCard,
  collectLorebookCBS,
  collectLorebookCBSFromCard,
  type LorebookStructureEntry,
  type LorebookStructureResult,
} from './lorebook/structure';
export {
  collectRegexCBSFromCard,
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
