// Barrel export for shared utilities
export {
  parsePngTextChunks,
  stripPngTextChunks,
  decodeCharacterJsonFromChunks,
  buildFolderMap as buildRisuFolderMap,
  resolveFolderName as resolveRisuFolderName,
  extractCBSVarOps,
  parseCardFile,
  type RisuCharbookEntry,
  type FolderMapOptions,
  type DecodedCharacterJson,
  type CBSVarOps,
} from './risu-api';

export {
  sanitizeFilename,
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  uniquePath,
  parsePngChunks,
  buildFolderMap,
  resolveFolderName,
} from './extract-helpers';

export {
  resolveAssetUri,
  guessMimeExt,
  type AssetDict,
  type ResolvedAsset,
} from './uri-resolver';

export {
  safeArray,
  MAX_VARS_IN_REPORT,
  MAX_ENTRIES_IN_REPORT,
  MAX_SCRIPTS_IN_REPORT,
  ELEMENT_TYPES,
  CBS_OPS,
  buildUnifiedCBSGraph,
  buildLorebookRegexCorrelation,
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
  type ElementType,
  type ElementCBSData,
  type UnifiedVarEntry,
  type LorebookRegexSharedVar,
  type LorebookRegexCorrelation,
  type LuaASTNode,
} from './analyze-helpers';

export {
  analyzeLorebookStructure,
  collectLorebookCBSFromCard,
  type LorebookStructureEntry,
  type LorebookStructureResult,
} from '../domain/lorebook/structure';

export {
  collectRegexCBSFromCard,
  collectRegexCBSFromScripts,
  extractRegexScriptOps,
  parseDefaultVariablesText,
  parseDefaultVariablesJson,
  type RegexScriptOps,
} from '../domain/regex/scripts';
