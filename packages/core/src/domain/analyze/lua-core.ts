/**
 * Lua 소스를 파싱하고 CBS 분석 아티팩트로 변환하는 코어 진입점.
 * @file packages/core/src/domain/analyze/lua-core.ts
 */

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
    stateAccessOccurrences: Array<{
      key: string;
      direction: 'read' | 'write';
      apiName: string;
      containingFunction: string;
      line: number;
      argStart: number;
      argEnd: number;
    }>;
  };
  elementCbs: ElementCBSData[];
}

/**
 * getBasename 함수.
 * Node 경로 모듈 없이 파일 경로에서 확장자를 제외한 기본 이름을 추출함.
 *
 * @param filePath - 기본 이름을 얻을 Lua 파일 경로
 * @returns 확장자를 제거한 파일 기본 이름
 */
function getBasename(filePath: string): string {
  // Handle both POSIX and Windows paths
  const lastSepIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const filename = lastSepIndex >= 0 ? filePath.slice(lastSepIndex + 1) : filePath;
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
}

/**
 * analyzeLuaSource 함수.
 * Lua 소스 코드를 luaparse 기반 수집, 분석 단계로 처리하고 공유 가능한 분석 아티팩트를 만듦.
 *
 * @param input - 분석할 파일 경로, Lua 소스, 선택적 charx 데이터를 담은 요청 객체
 * @returns 수집 데이터, 분석 결과, 상관관계, CBS 데이터를 포함한 Lua 분석 아티팩트
 */
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

/**
 * buildCharxCorrelations 함수.
 * charx 데이터 안의 로어북과 정규식 스크립트를 수집 결과와 연결함.
 *
 * @param params - 선택적 charx 데이터와 Lua 수집 결과를 담은 상관관계 입력
 * @returns 로어북 상관관계와 정규식 상관관계 결과
 */
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

/**
 * serializeCollected 함수.
 * Map과 Set 중심의 수집 결과를 외부 공유에 적합한 직렬화 객체로 변환함.
 *
 * @param collected - 직렬화할 Lua 1차 수집 결과
 * @returns 상태 변수, 함수, 핸들러, API 호출, 상태 접근 위치를 담은 직렬화 결과
 */
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
    stateAccessOccurrences: collected.stateAccessOccurrences,
  };
}

/**
 * buildLuaElementCbs 함수.
 * Lua 파일 단위로 읽기, 쓰기 상태 키를 모아 CBS 요소 데이터를 만듦.
 *
 * @param params - 요소 이름에 쓸 기본 파일명과 Lua 수집 결과
 * @returns Lua 요소의 CBS 읽기, 쓰기 관계 데이터
 */
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
