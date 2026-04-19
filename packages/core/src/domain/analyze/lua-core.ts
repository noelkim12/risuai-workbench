import luaparse, { type Chunk } from 'luaparse';
import { asRecord } from '@/domain';
import {
  buildLorebookCorrelationFromEntries,
  buildRegexCorrelationFromScripts,
  type ElementCBSData,
} from '@/domain/analyze/correlation';
import { LUA_STDLIB_CALLS, RISUAI_API } from './lua-api';
import { runAnalyzePhase } from './lua-analyzer';
import {
  type AnalyzePhaseResult,
  type CollectedData,
  type LorebookCorrelation,
  type RegexCorrelation,
} from './lua-analysis-types';
import { runCollectPhase } from './lua-collector';
import { type LuaASTNode } from './lua-helpers';

/** 공유 가능한 Lua 분석 결과 아티팩트 */
export interface LuaAnalysisArtifact {
  filePath: string;
  baseName: string;
  sourceText?: string;
  totalLines: number;
  collected: CollectedData;
  analyzePhase: AnalyzePhaseResult;
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
  serialized: {
    stateVars: Record<string, unknown>;
    functions: Array<Record<string, unknown>>;
    handlers: unknown[];
    apiCalls: unknown[];
  };
  elementCbs: ElementCBSData[];
}

/** Extract basename from file path without using node:path */
function getBasename(filePath: string): string {
  // Handle both POSIX and Windows paths
  const lastSepIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const filename = lastSepIndex >= 0 ? filePath.slice(lastSepIndex + 1) : filePath;
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
}

/** Lua 소스 코드를 분석하여 공유 가능한 분석 결과를 반환 */
export function analyzeLuaSource(input: {
  filePath: string;
  source: string;
  charxData?: Record<string, unknown> | null;
}): LuaAnalysisArtifact {
  const { filePath, source, charxData } = input;
  const totalLines = source.split('\n').length;
  const baseName = getBasename(filePath);

  const ast = luaparse.parse(source, {
    comments: true,
    locations: true,
    ranges: true,
    scope: true,
    luaVersion: '5.3',
  }) as unknown as Chunk;

  const body = ast.body as LuaASTNode[];
  const comments = (ast.comments || []) as LuaASTNode[];
  const { collected } = runCollectPhase({
    body,
    risuApi: RISUAI_API,
  });

  const analyzePhase = runAnalyzePhase({
    comments,
    total: totalLines,
    collected,
    risuApi: RISUAI_API,
    luaStdlibCalls: LUA_STDLIB_CALLS,
  });

  const { lorebookCorrelation, regexCorrelation } = buildCharxCorrelations({ charxData, collected });

  return {
    filePath,
    baseName,
    sourceText: source,
    totalLines,
    collected,
    analyzePhase,
    lorebookCorrelation,
    regexCorrelation,
    serialized: serializeCollected(collected),
    elementCbs: [buildLuaElementCbs({ baseName, collected })],
  };
}

function buildCharxCorrelations(params: {
  charxData?: Record<string, unknown> | null;
  collected: CollectedData;
}): {
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
} {
  const { charxData, collected } = params;
  if (!charxData) {
    return {
      lorebookCorrelation: null,
      regexCorrelation: null,
    };
  }

  const data = asRecord(charxData);

  let lorebookCorrelation: LorebookCorrelation | null = null;
  const characterBook = asRecord(data?.character_book);
  if (characterBook) {
    const entries = Array.isArray(characterBook.entries) ? characterBook.entries : [];
    if (entries.length > 0) {
      lorebookCorrelation = buildLorebookCorrelationFromEntries({
        entries,
        collected,
      });
    }
  }

  let regexCorrelation: RegexCorrelation | null = null;
  const extensions = asRecord(data?.extensions);
  const risuai = asRecord(extensions?.risuai);
  if (risuai) {
    const scripts = Array.isArray(risuai.customScripts) ? risuai.customScripts : null;
    if (scripts) {
      regexCorrelation = buildRegexCorrelationFromScripts({
        scripts,
        collected,
        totalScripts: scripts.length,
      });
    }
  }

  return {
    lorebookCorrelation,
    regexCorrelation,
  };
}

function serializeCollected(collected: CollectedData): LuaAnalysisArtifact['serialized'] {
  const stateVars: LuaAnalysisArtifact['serialized']['stateVars'] = {};
  for (const [key, value] of collected.stateVars) {
    stateVars[key] = {
      key: value.key,
      readBy: [...value.readBy].sort(),
      writtenBy: [...value.writtenBy].sort(),
      apis: [...value.apis].sort(),
      firstWriteValue: value.firstWriteValue,
      firstWriteFunction: value.firstWriteFunction,
      firstWriteLine: value.firstWriteLine,
      hasDualWrite: value.hasDualWrite,
    };
  }

  const functions: LuaAnalysisArtifact['serialized']['functions'] = collected.functions.map((fn) => ({
    name: fn.name,
    displayName: fn.displayName,
    startLine: fn.startLine,
    endLine: fn.endLine,
    lineCount: fn.lineCount,
    isLocal: fn.isLocal,
    isAsync: fn.isAsync,
    params: fn.params,
    parentFunction: fn.parentFunction,
    isListenEditHandler: fn.isListenEditHandler,
    listenEditEventType: fn.listenEditEventType,
    apiCategories: [...fn.apiCategories].sort(),
    apiNames: [...fn.apiNames].sort(),
    stateReads: [...fn.stateReads].sort(),
    stateWrites: [...fn.stateWrites].sort(),
  }));

  return {
    stateVars,
    functions,
    handlers: collected.handlers,
    apiCalls: collected.apiCalls,
  };
}

function buildLuaElementCbs(params: { baseName: string; collected: CollectedData }): ElementCBSData {
  const { baseName, collected } = params;
  const reads = new Set<string>();
  const writes = new Set<string>();

  for (const [key, stateVar] of collected.stateVars) {
    if (stateVar.readBy.size > 0) {
      reads.add(key);
    }
    if (stateVar.writtenBy.size > 0) {
      writes.add(key);
    }
  }

  return {
    elementType: 'lua',
    elementName: baseName,
    reads,
    writes,
  };
}
