import { ELEMENT_TYPES, type ElementType } from './constants';
import { extractCBSVarOps } from '../cbs/cbs';
import {
  buildFolderMap as buildRisuFolderMap,
  buildLorebookFolderPathMap,
  resolveFolderName as resolveRisuFolderName,
} from '../lorebook/folders';
import {
  type CollectedData,
  type LorebookCorrelation,
  type RegexCorrelation,
} from './lua-analysis-types';

const ELEMENT_TYPE_ORDER = Object.values(ELEMENT_TYPES);

/**
 * 특정 엘리먼트의 CBS 변수 사용 데이터를 나타냅니다.
 */
export interface ElementCBSData {
  /** 엘리먼트 타입 (lorebook, regex, lua 등) */
  elementType: ElementType | string;
  /** 엘리먼트의 표시 이름 */
  elementName: string;
  /** 읽기 연산이 발생하는 변수 집합 */
  reads: Set<string>;
  /** 쓰기 연산이 발생하는 변수 집합 */
  writes: Set<string>;
  /** 변수별 세부 읽기 주체 목록 (선택 사항) */
  readersByVar?: Record<string, string[]>;
  /** 변수별 세부 쓰기 주체 목록 (선택 사항) */
  writersByVar?: Record<string, string[]>;
  /** 같은 phase 내부의 실행 순서 힌트. 큰 값이 먼저 실행됨 */
  executionOrder?: number;
}

interface ElementSource {
  readers: string[];
  writers: string[];
}

/**
 * 여러 엘리먼트에 걸쳐 사용되는 통합된 CBS 변수 항목을 나타냅니다.
 */
export interface UnifiedVarEntry {
  /** 변수 이름 */
  varName: string;
  /** 엘리먼트 타입별 소스 정보 */
  sources: Record<string, ElementSource>;
  /** 기본값 (문자열 형태) */
  defaultValue: string | null;
  /** 이 변수를 사용하는 서로 다른 엘리먼트 타입의 수 */
  elementCount: number;
  /** 변수의 전파 방향 (isolated: 단일 타입 내 사용, bridged: 여러 타입 간 공유) */
  direction: 'isolated' | 'bridged';
  /** 이 변수에 값을 쓰는 엘리먼트 타입 목록 */
  crossElementWriters: string[];
  /** 이 변수에서 값을 읽는 엘리먼트 타입 목록 */
  crossElementReaders: string[];
}

/**
 * 로어북과 정규식 간 공유되는 CBS 변수 정보를 나타냅니다.
 */
export interface LorebookRegexSharedVar {
  /** 변수 이름 */
  varName: string;
  /** 데이터 흐름 방향 */
  direction: 'lorebook->regex' | 'regex->lorebook' | 'bidirectional';
  /** 이 변수를 사용하는 로어북 엔트리 이름 목록 */
  lorebookEntries: string[];
  /** 이 변수를 사용하는 정규식 스크립트 이름 목록 */
  regexScripts: string[];
}

/**
 * 로어북과 정규식 간의 CBS 변수 상관관계 분석 결과입니다.
 */
export interface LorebookRegexCorrelation {
  /** 공유 변수 목록 */
  sharedVars: LorebookRegexSharedVar[];
  /** 로어북에서만 사용되는 변수 목록 */
  lorebookOnlyVars: string[];
  /** 정규식에서만 사용되는 변수 목록 */
  regexOnlyVars: string[];
  /** 분석 결과 요약 */
  summary: {
    /** 총 공유 변수 수 */
    totalShared: number;
    /** 로어북 전용 변수 수 */
    totalLBOnly: number;
    /** 정규식 전용 변수 수 */
    totalRXOnly: number;
  };
}

/** 두 element type 사이의 공유 변수 상관관계 항목 */
export interface ElementPairSharedVar {
  varName: string;
  direction: string;
  leftElements: string[];
  rightElements: string[];
}

/** 통합 그래프에서 계산한 두 element type 사이의 상관관계 요약 */
export interface ElementPairCorrelation {
  leftType: string;
  rightType: string;
  sharedVars: ElementPairSharedVar[];
  leftOnlyVars: string[];
  rightOnlyVars: string[];
  summary: {
    totalShared: number;
    totalLeftOnly: number;
    totalRightOnly: number;
  };
}

/**
 * 수집된 모든 CBS 데이터를 바탕으로 통합된 CBS 변수 그래프를 빌드합니다.
 * @param allCollected - 수집된 각 엘리먼트의 CBS 사용 데이터 배열
 * @param defaultVariables - 봇 설정 등에서 정의된 기본 변수 맵
 * @returns 변수 이름을 키로 하는 통합 변수 항목 맵
 */
export function buildUnifiedCBSGraph(
  allCollected: ElementCBSData[] | null | undefined,
  defaultVariables: Record<string, unknown> | null | undefined,
): Map<string, UnifiedVarEntry> {
  const graph = new Map<string, UnifiedVarEntry>();

  for (const element of allCollected || []) {
    if (!element) continue;
    const { elementType, elementName, reads, writes, readersByVar, writersByVar } = element;

    for (const varName of reads || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName)!;
      ensureSource(entry, elementType);
      const labels =
        readersByVar && Array.isArray(readersByVar[varName]) && readersByVar[varName].length > 0
          ? readersByVar[varName]
          : [elementName];

      for (const label of labels) {
        if (!entry.sources[elementType].readers.includes(label)) {
          entry.sources[elementType].readers.push(label);
        }
      }
    }

    for (const varName of writes || []) {
      ensureEntry(graph, varName);
      const entry = graph.get(varName)!;
      ensureSource(entry, elementType);
      const labels =
        writersByVar && Array.isArray(writersByVar[varName]) && writersByVar[varName].length > 0
          ? writersByVar[varName]
          : [elementName];

      for (const label of labels) {
        if (!entry.sources[elementType].writers.includes(label)) {
          entry.sources[elementType].writers.push(label);
        }
      }
    }
  }

  const defaults = defaultVariables || {};
  for (const [varName, entry] of graph.entries()) {
    entry.defaultValue = defaults[varName] !== undefined ? String(defaults[varName]) : null;

    const sourceTypes = Object.keys(entry.sources);
    entry.elementCount = sourceTypes.length;
    entry.direction = entry.elementCount >= 2 ? 'bridged' : 'isolated';

    entry.crossElementWriters = sourceTypes
      .filter((type) => entry.sources[type].writers.length > 0)
      .sort(sortElementTypes);

    entry.crossElementReaders = sourceTypes
      .filter((type) => entry.sources[type].readers.length > 0)
      .sort(sortElementTypes);
  }

  const sorted = [...graph.entries()].sort((a, b) => {
    const aEntry = a[1];
    const bEntry = b[1];

    if (aEntry.direction !== bEntry.direction) {
      return aEntry.direction === 'bridged' ? -1 : 1;
    }

    if (aEntry.elementCount !== bEntry.elementCount) {
      return bEntry.elementCount - aEntry.elementCount;
    }

    return a[0].localeCompare(b[0]);
  });

  return new Map(sorted);
}

/**
 * 로어북과 정규식 간의 CBS 변수 사용 현황을 비교하여 상관관계를 분석합니다.
 * @param lorebookCBS - 로어북 엔트리들의 CBS 사용 데이터
 * @param regexCBS - 정규식 스크립트들의 CBS 사용 데이터
 * @returns 로어북과 정규식 간의 변수 공유 및 방향성 분석 결과
 */
export function buildLorebookRegexCorrelation(
  lorebookCBS: ElementCBSData[] | null | undefined,
  regexCBS: ElementCBSData[] | null | undefined,
): LorebookRegexCorrelation {
  const lbReads = new Map<string, string[]>();
  const lbWrites = new Map<string, string[]>();
  const rxReads = new Map<string, string[]>();
  const rxWrites = new Map<string, string[]>();

  for (const element of lorebookCBS || []) {
    for (const varName of element.reads || []) {
      pushToMap(lbReads, varName, element.elementName);
    }
    for (const varName of element.writes || []) {
      pushToMap(lbWrites, varName, element.elementName);
    }
  }

  for (const element of regexCBS || []) {
    for (const varName of element.reads || []) {
      pushToMap(rxReads, varName, element.elementName);
    }
    for (const varName of element.writes || []) {
      pushToMap(rxWrites, varName, element.elementName);
    }
  }

  const lbVars = new Set<string>([...lbReads.keys(), ...lbWrites.keys()]);
  const rxVars = new Set<string>([...rxReads.keys(), ...rxWrites.keys()]);

  const sharedVars = [...lbVars]
    .filter((varName) => rxVars.has(varName))
    .map((varName) => {
      const lbIsReader = lbReads.has(varName);
      const lbIsWriter = lbWrites.has(varName);
      const rxIsReader = rxReads.has(varName);
      const rxIsWriter = rxWrites.has(varName);

      let direction: LorebookRegexSharedVar['direction'];
      if (lbIsWriter && rxIsReader && !rxIsWriter && !lbIsReader) {
        direction = 'lorebook->regex';
      } else if (rxIsWriter && lbIsReader && !lbIsWriter && !rxIsReader) {
        direction = 'regex->lorebook';
      } else {
        direction = 'bidirectional';
      }

      return {
        varName,
        direction,
        lorebookEntries: unique([
          ...(lbReads.get(varName) || []),
          ...(lbWrites.get(varName) || []),
        ]),
        regexScripts: unique([...(rxReads.get(varName) || []), ...(rxWrites.get(varName) || [])]),
      };
    })
    .sort((a, b) => sortCorrelationDirection(a.direction, b.direction));

  const lorebookOnlyVars = [...lbVars].filter((varName) => !rxVars.has(varName));
  const regexOnlyVars = [...rxVars].filter((varName) => !lbVars.has(varName));

  return {
    sharedVars,
    lorebookOnlyVars,
    regexOnlyVars,
    summary: {
      totalShared: sharedVars.length,
      totalLBOnly: lorebookOnlyVars.length,
      totalRXOnly: regexOnlyVars.length,
    },
  };
}

/**
 * 통합 그래프에서 임의의 두 element type 사이의 공유 변수 상관관계를 계산한다.
 *
 * @param unifiedGraph - buildUnifiedCBSGraph 결과
 * @param leftType - 좌측 element type
 * @param rightType - 우측 element type
 * @returns 좌우 타입 간 공유/단독 변수 및 방향성 요약
 */
export function buildElementPairCorrelationFromUnifiedGraph(
  unifiedGraph: Map<string, UnifiedVarEntry> | null | undefined,
  leftType: string,
  rightType: string,
): ElementPairCorrelation {
  const leftVars = new Set<string>();
  const rightVars = new Set<string>();
  const sharedVars: ElementPairSharedVar[] = [];

  for (const [varName, entry] of unifiedGraph ?? []) {
    const leftSource = entry.sources[leftType];
    const rightSource = entry.sources[rightType];

    if (leftSource) leftVars.add(varName);
    if (rightSource) rightVars.add(varName);
    if (!leftSource || !rightSource) continue;

    const hasLeftRead = leftSource.readers.length > 0;
    const hasLeftWrite = leftSource.writers.length > 0;
    const hasRightRead = rightSource.readers.length > 0;
    const hasRightWrite = rightSource.writers.length > 0;

    let direction = 'bidirectional';
    if (hasLeftWrite && hasRightRead && !hasRightWrite && !hasLeftRead) {
      direction = `${leftType}->${rightType}`;
    } else if (hasRightWrite && hasLeftRead && !hasLeftWrite && !hasRightRead) {
      direction = `${rightType}->${leftType}`;
    }

    sharedVars.push({
      varName,
      direction,
      leftElements: unique([...leftSource.readers, ...leftSource.writers]),
      rightElements: unique([...rightSource.readers, ...rightSource.writers]),
    });
  }

  const leftOnlyVars = [...leftVars].filter((varName) => !rightVars.has(varName)).sort();
  const rightOnlyVars = [...rightVars].filter((varName) => !leftVars.has(varName)).sort();

  return {
    leftType,
    rightType,
    sharedVars: sharedVars.sort((a, b) => sortCorrelationDirection(a.direction, b.direction)),
    leftOnlyVars,
    rightOnlyVars,
    summary: {
      totalShared: sharedVars.length,
      totalLeftOnly: leftOnlyVars.length,
      totalRightOnly: rightOnlyVars.length,
    },
  };
}

/**
 * Lorebook 엔트리 배열에서 CBS 변수별 읽기/쓰기 주체를 수집한다.
 *
 * @param entries - RisuAI lorebook 엔트리 배열
 * @returns 변수명 → { readers, writers } 맵 (각 Set은 엔트리 레이블)
 */
export function extractLorebookCBSVariables(
  entries: any[],
): Map<string, { readers: Set<string>; writers: Set<string> }> {
  const folderMap = buildRisuFolderMap(entries as any);
  const folderPathMap = buildLorebookFolderPathMap(entries as any);
  const vars = new Map<string, { readers: Set<string>; writers: Set<string> }>();

  for (const entry of entries) {
    if (entry.mode === 'folder' || !entry.content) continue;
    const folderName = entry.folder
      ? folderPathMap.get(entry.folder) || resolveRisuFolderName(entry.folder, folderMap, (ref) => ref)
      : null;
    const entryLabel = folderName ? `${folderName}/${entry.name}` : entry.name;
    const ops = extractCBSVarOps(String(entry.content));

    for (const varName of ops.reads) {
      if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
      vars.get(varName)!.readers.add(entryLabel);
    }
    for (const varName of ops.writes) {
      if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
      vars.get(varName)!.writers.add(entryLabel);
    }
  }

  return vars;
}

/**
 * Regex 스크립트 배열에서 CBS 변수별 읽기/쓰기 주체를 수집한다.
 *
 * @param customScripts - RisuAI custom regex 스크립트 배열
 * @returns 변수명 → { readers, writers } 맵 (각 Set은 스크립트 레이블)
 */
export function extractRegexCBSVariables(
  customScripts: any[],
): Map<string, { readers: Set<string>; writers: Set<string> }> {
  const vars = new Map<string, { readers: Set<string>; writers: Set<string> }>();

  for (let i = 0; i < customScripts.length; i += 1) {
    const script = customScripts[i] || {};
    const label =
      script.comment && String(script.comment).trim() ? String(script.comment).trim() : `#${i}`;
    const fields = [script.in, script.out, script.ableFlag];

    for (const field of fields) {
      if (typeof field !== 'string' || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const varName of ops.reads) {
        if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
        vars.get(varName)!.readers.add(label);
      }
      for (const varName of ops.writes) {
        if (!vars.has(varName)) vars.set(varName, { readers: new Set(), writers: new Set() });
        vars.get(varName)!.writers.add(label);
      }
    }
  }

  return vars;
}

/**
 * Lorebook 엔트리와 Lua 분석 결과를 결합하여 변수 상관관계를 계산한다.
 *
 * @param params.entries - RisuAI lorebook 엔트리 배열
 * @param params.collected - Lua 수집 단계 결과 (stateVars, loreApiCalls 포함)
 * @returns 변수별 lua↔lorebook 방향성 및 엔트리 정보가 담긴 LorebookCorrelation
 */
export function buildLorebookCorrelationFromEntries(params: {
  entries: any[];
  collected: CollectedData;
}): LorebookCorrelation {
  const { entries, collected } = params;
  const cbsVars = extractLorebookCBSVariables(entries);
  const folderMap = buildRisuFolderMap(entries as any);
  const folderPathMap = buildLorebookFolderPathMap(entries as any);
  const allVarNames = new Set([...collected.stateVars.keys(), ...cbsVars.keys()]);

  const correlations = [...allVarNames].sort().map((varName) => {
    const lua = collected.stateVars.get(varName);
    const cbs = cbsVars.get(varName);

    const entry = {
      varName,
      luaReaders: lua ? [...lua.readBy].filter((n) => n !== '<top-level>') : [],
      luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== '<top-level>') : [],
      lorebookReaders: cbs ? [...cbs.readers] : [],
      lorebookWriters: cbs ? [...cbs.writers] : [],
      luaOnly: Boolean(lua) && !cbs,
      lorebookOnly: !lua && Boolean(cbs),
      direction: 'isolated',
    };

    const hasLuaWrite = entry.luaWriters.length > 0;
    const hasLuaRead = entry.luaReaders.length > 0;
    const hasLbRead = entry.lorebookReaders.length > 0;
    const hasLbWrite = entry.lorebookWriters.length > 0;

    if ((hasLuaWrite || hasLuaRead) && (hasLbRead || hasLbWrite)) {
      if (hasLuaWrite && hasLbRead && !hasLbWrite && !hasLuaRead) {
        entry.direction = 'lua→lorebook';
      } else if (hasLbWrite && hasLuaRead && !hasLuaWrite && !hasLbRead) {
        entry.direction = 'lorebook→lua';
      } else {
        entry.direction = 'bidirectional';
      }
    }

    return entry;
  });

  const entryInfos: LorebookCorrelation['entryInfos'] = [];
  for (const entry of entries) {
    if (entry.mode === 'folder') continue;
    const folderName = entry.folder
      ? folderPathMap.get(entry.folder) || resolveRisuFolderName(entry.folder, folderMap, (ref) => ref)
      : null;
    const ops = extractCBSVarOps(entry.content || '');
    const usedVars = new Set([...ops.reads, ...ops.writes]);
    const luaDeps = new Set<string>();

    for (const varName of usedVars) {
      const sv = collected.stateVars.get(varName);
      if (sv) {
        for (const fnName of sv.writtenBy) {
          if (fnName !== '<top-level>') luaDeps.add(fnName);
        }
      }
    }

    if (usedVars.size > 0) {
      entryInfos.push({
        name: entry.name,
        folder: folderName,
        vars: [...usedVars].sort(),
        luaDeps: [...luaDeps].sort(),
      });
    }
  }

  return {
    correlations,
    entryInfos,
    loreApiCalls: collected.loreApiCalls,
    totalEntries: entries.filter((e: any) => e.mode !== 'folder').length,
    totalFolders: entries.filter((e: any) => e.mode === 'folder').length,
    bridgedVars: correlations.filter((c) => c.direction !== 'isolated'),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    lorebookOnlyVars: correlations.filter((c) => c.lorebookOnly),
  };
}

/**
 * Regex 스크립트와 Lua 분석 결과를 결합하여 변수 상관관계를 계산한다.
 *
 * @param params.scripts - RisuAI custom regex 스크립트 배열
 * @param params.collected - Lua 수집 단계 결과
 * @param params.totalScripts - 전체 스크립트 수 (비율 계산용, 선택)
 * @returns 변수별 lua↔regex 방향성이 담긴 RegexCorrelation
 */
export function buildRegexCorrelationFromScripts(params: {
  scripts: any[];
  collected: CollectedData;
  totalScripts?: number;
}): RegexCorrelation {
  const { scripts, collected, totalScripts } = params;
  const activeScriptsList = scripts.filter((script: any) => script && script.type !== 'disabled');
  const regexVars = extractRegexCBSVariables(activeScriptsList);
  const allVarNames = new Set([...collected.stateVars.keys(), ...regexVars.keys()]);

  const correlations = [...allVarNames].sort().map((varName) => {
    const lua = collected.stateVars.get(varName);
    const regex = regexVars.get(varName);

    const entry = {
      varName,
      luaReaders: lua ? [...lua.readBy].filter((n) => n !== '<top-level>') : [],
      luaWriters: lua ? [...lua.writtenBy].filter((n) => n !== '<top-level>') : [],
      regexReaders: regex ? [...regex.readers] : [],
      regexWriters: regex ? [...regex.writers] : [],
      luaOnly: Boolean(lua) && !regex,
      regexOnly: !lua && Boolean(regex),
      direction: 'isolated',
    };

    const hasLuaWrite = entry.luaWriters.length > 0;
    const hasLuaRead = entry.luaReaders.length > 0;
    const hasRegexRead = entry.regexReaders.length > 0;
    const hasRegexWrite = entry.regexWriters.length > 0;

    if ((hasLuaWrite || hasLuaRead) && (hasRegexRead || hasRegexWrite)) {
      if (hasLuaWrite && hasRegexRead && !hasRegexWrite && !hasLuaRead) {
        entry.direction = 'lua→regex';
      } else if (hasRegexWrite && hasLuaRead && !hasLuaWrite && !hasRegexRead) {
        entry.direction = 'regex→lua';
      } else {
        entry.direction = 'bidirectional';
      }
    }

    return entry;
  });

  const scriptInfos: RegexCorrelation['scriptInfos'] = [];
  for (let i = 0; i < activeScriptsList.length; i += 1) {
    const script = activeScriptsList[i] || {};
    const usedVars = new Set<string>();
    const fields = [script.in, script.out, script.ableFlag];
    const comment =
      script.comment && String(script.comment).trim() ? String(script.comment).trim() : `#${i}`;

    for (const field of fields) {
      if (typeof field !== 'string' || field.length === 0) continue;
      const ops = extractCBSVarOps(field);
      for (const key of ops.reads) usedVars.add(key);
      for (const key of ops.writes) usedVars.add(key);
    }

    const luaDeps = new Set<string>();
    for (const varName of usedVars) {
      const sv = collected.stateVars.get(varName);
      if (sv) {
        for (const fnName of sv.writtenBy) {
          if (fnName !== '<top-level>') luaDeps.add(fnName);
        }
      }
    }

    if (usedVars.size > 0) {
      scriptInfos.push({
        comment,
        type: script.type || 'unknown',
        inPattern: typeof script.in === 'string' ? script.in : '',
        vars: [...usedVars].sort(),
        luaDeps: [...luaDeps].sort(),
      });
    }
  }

  return {
    correlations,
    scriptInfos,
    totalScripts: typeof totalScripts === 'number' ? totalScripts : scripts.length,
    activeScripts: activeScriptsList.length,
    bridgedVars: correlations.filter((c) => c.direction !== 'isolated'),
    luaOnlyVars: correlations.filter((c) => c.luaOnly),
    regexOnlyVars: correlations.filter((c) => c.regexOnly),
  };
}

function ensureEntry(graph: Map<string, UnifiedVarEntry>, varName: string): void {
  if (graph.has(varName)) return;
  graph.set(varName, {
    varName,
    sources: {},
    defaultValue: null,
    elementCount: 0,
    direction: 'isolated',
    crossElementWriters: [],
    crossElementReaders: [],
  });
}

function ensureSource(entry: UnifiedVarEntry, elementType: string): void {
  if (!entry.sources[elementType]) {
    entry.sources[elementType] = { readers: [], writers: [] };
  }
}

function sortElementTypes(a: string, b: string): number {
  const aIndex = ELEMENT_TYPE_ORDER.indexOf(a as ElementType);
  const bIndex = ELEMENT_TYPE_ORDER.indexOf(b as ElementType);

  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

function sortCorrelationDirection(a: string, b: string): number {
  const order = new Map<string, number>([
    ['bidirectional', 0],
    ['lorebook->regex', 1],
    ['regex->lorebook', 2],
  ]);

  const aOrder = order.get(a);
  const bOrder = order.get(b);

  if (aOrder !== undefined && bOrder !== undefined) {
    return aOrder - bOrder;
  }

  if (aOrder !== undefined) {
    return -1;
  }

  if (bOrder !== undefined) {
    return 1;
  }

  return a.localeCompare(b);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function pushToMap(map: Map<string, string[]>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}
