/**
 * Lua 코드 분석에 사용되는 타입 정의
 */
import { type ApiMeta } from './lua-api';

export type { ApiMeta };

/**
 * 분석 과정에서 수집된 Lua 함수 정보
 */
export interface CollectedFunction {
  name: string;
  displayName: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  isLocal: boolean;
  isAsync: boolean;
  params: string[];
  /** 이 함수를 포함하는 상위 함수. 최상위 범위면 `null` */
  parentFunction: string | null;
  isListenEditHandler: boolean;
  /** `ListenEdit` 핸들러인 경우 대상 이벤트 타입. 핸들러가 아니면 `null` */
  listenEditEventType: string | null;
  apiCategories: Set<string>;
  apiNames: Set<string>;
  stateReads: Set<string>;
  stateWrites: Set<string>;
}

/**
 * 분석 과정에서 수집된 상태 변수 정보
 */
export interface CollectedStateVar {
  key: string;
  readBy: Set<string>;
  writtenBy: Set<string>;
  apis: Set<string>;
  /** 처음 기록된 값의 문자열 표현. 없으면 `null` */
  firstWriteValue: string | null;
  /** 처음 값을 쓴 함수의 이름. 없으면 `null` */
  firstWriteFunction: string | null;
  firstWriteLine: number;
  /** 동일 함수 내에서 여러 번 쓰기가 발생했는지 여부 */
  hasDualWrite: boolean;
}

/**
 * 함수 호출 관계 정보
 */
export interface CollectedCall {
  /** 호출한 함수. 전역 범위면 `null` */
  caller: string | null;
  callee: string | null;
  line: number;
}

/**
 * API 호출 정보
 */
export interface CollectedApiCall {
  apiName: string;
  category: string;
  /** API 접근 방식 (예: dot notation, bracket access) */
  access: string;
  rw: 'read' | 'write';
  line: number;
  containingFunction: string;
}

/**
 * 로어북 관련 API 호출 정보
 */
export interface CollectedLoreApiCall {
  apiName: string;
  /** 관련 키워드. 없으면 `null` */
  keyword: string | null;
  line: number;
  containingFunction: string;
}

/**
 * Lua 코드 분석을 통해 수집된 전체 데이터 구조
 */
export interface CollectedData {
  functions: CollectedFunction[];
  calls: CollectedCall[];
  apiCalls: CollectedApiCall[];
  handlers: Array<{
    type: string;
    line: number;
    isAsync: boolean;
    /** 연결된 함수. 익명이면 `null` */
    functionName: string | null;
    detail: string | null;
  }>;
  dataTables: Array<{
    name: string;
    fieldCount: number;
    startLine: number;
    endLine: number;
    depth: number;
  }>;
  stateVars: Map<string, CollectedStateVar>;
  functionIndexByName: Map<string, CollectedFunction[]>;
  /** 접두사로 분류된 함수 버킷 */
  prefixBuckets: Map<string, CollectedFunction[]>;
  loreApiCalls: CollectedLoreApiCall[];
}

/**
 * 분석 단계의 최종 결과물 구조
 */
export interface AnalyzePhaseResult {
  commentSections: Array<{ title: string; line: number; source: string }>;
  sectionMapSections: Array<{ title: string; source: string; startLine: number; endLine: number }>;
  /** 함수 호출 그래프 (caller → callees) */
  callGraph: Map<string, Set<string>>;
  /** 역방향 호출 그래프 (callee → callers) */
  calledBy: Map<string, Set<string>>;
  apiByCategory: Map<string, { apis: Set<string>; count: number }>;
  moduleGroups: Array<{
    name: string;
    title: string;
    reason: string;
    source: string;
    functions: Set<string>;
    tables: Set<string>;
    apiCats: Set<string>;
    stateKeys: Set<string>;
    /** 그룹의 가상 디렉토리 경로 */
    dir: string;
  }>;
  moduleByFunction: Map<string, string>;
  stateOwnership: Array<{
    key: string;
    readBy: string[];
    writers: string[];
    ownerModule: string;
    /** 여러 모듈에서 공유 사용되는지 여부 */
    crossModule: boolean;
  }>;
  registryVars: Array<{
    key: string;
    suggestedDefault: string;
    /** 숫자 타입으로 권장되는지 여부 */
    suggestNumber: boolean;
    /** 초기화 패턴으로 감지되었는지 여부 */
    isInitPattern: boolean;
    readCount: number;
    writeCount: number;
    firstWriteFunction: string;
    /** 여러 번 쓰기가 발생하는지 여부 */
    hasDualWrite: boolean;
  }>;
  rootFunctions: CollectedFunction[];
  /** 특정 함수의 모든 하위 호출 함수를 조회 */
  getDescendants: (name: string) => CollectedFunction[];
}

/**
 * 변수와 분석 주체(Lua, 로어북 등) 간의 연관 관계 항목
 */
export interface CorrelationEntry {
  varName: string;
  luaReaders: string[];
  luaWriters: string[];
  /** 데이터 흐름 방향 */
  direction: string;
}

/**
 * 로어북과 Lua 코드 간의 변수 연관 관계 분석 결과
 */
export interface LorebookCorrelation {
  correlations: Array<
    CorrelationEntry & {
      lorebookReaders: string[];
      lorebookWriters: string[];
      luaOnly: boolean;
      lorebookOnly: boolean;
    }
  >;
  entryInfos: Array<{
    name: string;
    /** 소속 폴더. 루트면 `null` */
    folder: string | null;
    vars: string[];
    luaDeps: string[];
  }>;
  loreApiCalls: CollectedLoreApiCall[];
  totalEntries: number;
  totalFolders: number;
  bridgedVars: Array<CorrelationEntry>;
  luaOnlyVars: Array<CorrelationEntry>;
  lorebookOnlyVars: Array<CorrelationEntry>;
}

/**
 * 정규식 스크립트와 Lua 코드 간의 변수 연관 관계 분석 결과
 */
export interface RegexCorrelation {
  correlations: Array<
    CorrelationEntry & {
      regexReaders: string[];
      regexWriters: string[];
      luaOnly: boolean;
      regexOnly: boolean;
    }
  >;
  scriptInfos: Array<{
    /** 스크립트 설명 주석 */
    comment: string;
    type: string;
    /** 패턴 내 포함 여부 정보 */
    inPattern: string;
    vars: string[];
    luaDeps: string[];
  }>;
  totalScripts: number;
  activeScripts: number;
  bridgedVars: Array<CorrelationEntry>;
  luaOnlyVars: Array<CorrelationEntry>;
  regexOnlyVars: Array<CorrelationEntry>;
}
