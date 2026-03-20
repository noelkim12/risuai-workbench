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
        "MAX_ENTRIES_IN_REPORT",
        "MAX_SCRIPTS_IN_REPORT",
        "MAX_VARS_IN_REPORT",
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
        "decodeCharacterJsonFromChunks",
        "default",
        "ensureDir",
        "executeLorebookPlan",
        "isDir",
        "listJsonFilesFlat",
        "listJsonFilesRecursive",
        "parseCardFile",
        "parsePngChunks",
        "parsePngTextChunks",
        "readJson",
        "resolveOrderedFiles",
        "stripPngTextChunks",
        "uniquePath",
        "writeBinary",
        "writeJson",
        "writeText",
      ]
    `);
  });
});
