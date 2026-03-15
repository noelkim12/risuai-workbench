export {
  buildFolderMap as buildRisuFolderMap,
  resolveFolderName as resolveRisuFolderName,
  type FolderMapOptions,
  type RisuCharbookEntry,
} from './lorebook/folders';
export { extractCBSVarOps, type CBSVarOps } from './card/cbs';
export { sanitizeFilename } from './card/filenames';
export {
  asRecord,
  getCardName,
  getCharacterBookEntries,
  getModuleLorebookEntries,
  getAllLorebookEntries,
  getCustomScripts,
  getDefaultVariablesRaw,
  type CardLike,
  type GenericRecord,
} from './card/data';
export {
  resolveAssetUri,
  guessMimeExt,
  type AssetDict,
  type ResolvedAsset,
} from './card/asset-uri';
export {
  analyzeLorebookStructure,
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
  type LuaASTNode,
} from './analyze/lua-helpers';
