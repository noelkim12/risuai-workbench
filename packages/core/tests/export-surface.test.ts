import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageDir = process.cwd();
const rootEntryPath = path.join(packageDir, 'dist', 'index.js');
const nodeEntryPath = path.join(packageDir, 'dist', 'node', 'index.js');

describe('export surface (snapshot)', () => {
  it('root entry exports match snapshot', async () => {
    const rootEntry = await import(rootEntryPath);
    const exportedKeys = Object.keys(rootEntry).sort();

    expect(exportedKeys).toMatchInlineSnapshot(`
      [
        "CBS_OPS",
        "ELEMENT_TYPES",
        "LUA_STDLIB_CALLS",
        "MAX_ENTRIES_IN_REPORT",
        "MAX_SCRIPTS_IN_REPORT",
        "MAX_VARS_IN_REPORT",
        "RISUAI_API",
        "analyzeLorebookStructure",
        "analyzeLorebookStructureFromCard",
        "asRecord",
        "assignName",
        "buildLorebookFolderDirMap",
        "buildLorebookRegexCorrelation",
        "buildRisuFolderMap",
        "buildUnifiedCBSGraph",
        "callArgs",
        "collectLorebookCBS",
        "collectLorebookCBSFromCard",
        "collectRegexCBSFromCard",
        "collectRegexCBSFromScripts",
        "createLorebookDirAllocator",
        "createMaxBlankRun",
        "directCalleeName",
        "exprName",
        "extractCBSVarOps",
        "extractRegexScriptOps",
        "getAllLorebookEntries",
        "getCardName",
        "getCharacterBookEntries",
        "getCustomScripts",
        "getDefaultVariablesRaw",
        "getLorebookFolderKey",
        "getModuleLorebookEntries",
        "guessMimeExt",
        "inferLuaFunctionName",
        "lineCount",
        "lineEnd",
        "lineStart",
        "nodeKey",
        "parseDefaultVariablesJson",
        "parseDefaultVariablesText",
        "planLorebookExtraction",
        "prefixOf",
        "resolveAssetUri",
        "resolveRisuFolderName",
        "runAnalyzePhase",
        "runCollectPhase",
        "safeArray",
        "sanitizeFilename",
        "sanitizeName",
        "strLit",
        "toModuleName",
        "toPosix",
      ]
    `);
  });

  it('node entry exports match snapshot', async () => {
    const nodeEntry = await import(nodeEntryPath);
    const exportedKeys = Object.keys(nodeEntry).sort();

    expect(exportedKeys).toMatchInlineSnapshot(`
      [
        "JPEG_1X1",
        "PNG_1X1_TRANSPARENT",
        "PNG_SIGNATURE",
        "crc32",
        "decodeCharacterJsonFromChunks",
        "default",
        "encodeChunk",
        "encodeModuleRisum",
        "encodeRPack",
        "encodeTextChunk",
        "ensureDir",
        "executeLorebookPlan",
        "isDir",
        "isJpeg",
        "isPng",
        "listJsonFilesFlat",
        "listJsonFilesRecursive",
        "loadRPackEncodeMap",
        "parseCardFile",
        "parsePngChunks",
        "parsePngTextChunks",
        "readJson",
        "resolveOrderedFiles",
        "stripPngTextChunks",
        "uniquePath",
        "writeBinary",
        "writeJson",
        "writePngTextChunks",
        "writeText",
      ]
    `);
  });
});
