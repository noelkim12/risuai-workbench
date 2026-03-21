/**
 * Lua 코드 분석에 사용되는 타입 정의들이
 */
import { type ApiMeta } from './lua-api';

export type { ApiMeta };

/**
 * 분석 과정에서 수집된 Lua 함수 정보
 */
export interface CollectedFunction {
  /** 함수의 이름이 */
  name: string;
  /** UI 등에 표시될 함수의 이름이 */
  displayName: string;
  /** 함수 정의가 시작되는 줄 번호 */
  startLine: number;
  /** 함수 정의가 끝나는 줄 번호 */
  endLine: number;
  /** 함수의 전체 줄 수 */
  lineCount: number;
  /** 로컬 함수 여부  */
  isLocal: boolean;
  /** 비동기 함수 여부  */
  isAsync: boolean;
  /** 함수의 매개변수 목록이 */
  params: string[];
  /** 이 함수를 포함하는 상위 함수의 이름이 없으면 null이 */
  parentFunction: string | null;
  /** `ListenEdit` 핸들러인지 여부 */
  isListenEditHandler: boolean;
  /** `ListenEdit` 핸들러인 경우, 대상 이벤트 타입이 */
  listenEditEventType: string | null;
  /** 함수 내에서 사용된 API 카테고리 집합이 */
  apiCategories: Set<string>;
  /** 함수 내에서 호출된 API 이름 집합이 */
  apiNames: Set<string>;
  /** 함수 내에서 읽은 상태 변수 키 집합이 */
  stateReads: Set<string>;
  /** 함수 내에서 쓴 상태 변수 키 집합이 */
  stateWrites: Set<string>;
}

/**
 * 분석 과정에서 수집된 상태 변수 정보
 */
export interface CollectedStateVar {
  /** 상태 변수의 키 이름이 */
  key: string;
  /** 이 변수를 읽는 함수 이름 집합이 */
  readBy: Set<string>;
  /** 이 변수에 값을 쓰는 함수 이름 집합이 */
  writtenBy: Set<string>;
  /** 이 변수와 관련된 API 이름 집합이 */
  apis: Set<string>;
  /** 변수에 처음으로 기록된 값의 문자열 표현이 */
  firstWriteValue: string | null;
  /** 변수에 처음으로 값을 쓴 함수의 이름이 */
  firstWriteFunction: string | null;
  /** 변수에 처음으로 값을 쓴 줄 번호 */
  firstWriteLine: number;
  /** 동일한 함수 내에서 여러 번 쓰기가 발생하는지 여부 */
  hasDualWrite: boolean;
}

/**
 * 함수 호출 관계 정보
 */
export interface CollectedCall {
  /** 호출한 함수의 이름이 전역 범위면 null이 */
  caller: string | null;
  /** 호출된 함수의 이름이 */
  callee: string | null;
  /** 호출이 발생한 줄 번호 */
  line: number;
}

/**
 * API 호출 정보
 */
export interface CollectedApiCall {
  /** 호출된 API의 이름이 */
  apiName: string;
  /** API가 속한 카테고리 */
  category: string;
  /** API 접근 방식이 */
  access: string;
  /** 읽기(read) 또는 쓰기(write) 작업 구분이 */
  rw: 'read' | 'write';
  /** 호출이 발생한 줄 번호 */
  line: number;
  /** 호출을 포함하고 있는 함수의 이름이 */
  containingFunction: string;
}

/**
 * 로어북 관련 API 호출 정보
 */
export interface CollectedLoreApiCall {
  /** 호출된 로어북 API 이름이 */
  apiName: string;
  /** 관련된 키워드 정보 없으면 null이 */
  keyword: string | null;
  /** 호출이 발생한 줄 번호 */
  line: number;
  /** 호출을 포함하고 있는 함수의 이름이 */
  containingFunction: string;
}

/**
 * Lua 코드 분석을 통해 수집된 전체 데이터 구조
 */
export interface CollectedData {
  /** 수집된 함수 목록이 */
  functions: CollectedFunction[];
  /** 수집된 함수 호출 목록이 */
  calls: CollectedCall[];
  /** 수집된 API 호출 목록이 */
  apiCalls: CollectedApiCall[];
  /** 수집된 이벤트 핸들러 정보 목록이 */
  handlers: Array<{
    /** 핸들러의 타입이 */
    type: string;
    /** 정의된 줄 번호 */
    line: number;
    /** 비동기 여부 */
    isAsync: boolean;
    /** 연결된 함수의 이름이 */
    functionName: string | null;
    /** 상세 정보 */
    detail: string | null;
  }>;
  /** 수집된 데이터 테이블 구조 목록이 */
  dataTables: Array<{
    /** 테이블의 이름이 */
    name: string;
    /** 필드 개수 */
    fieldCount: number;
    /** 시작 줄 번호 */
    startLine: number;
    /** 끝 줄 번호 */
    endLine: number;
    /** 중첩 깊이 */
    depth: number;
  }>;
  /** 상태 변수 키를 기반으로 한 수집 정보 맵이 */
  stateVars: Map<string, CollectedStateVar>;
  /** 함수 이름을 키로 하는 함수 정보 인덱스 맵이 */
  functionIndexByName: Map<string, CollectedFunction[]>;
  /** 접두사(Prefix)를 기반으로 분류된 함수 정보 맵이 */
  prefixBuckets: Map<string, CollectedFunction[]>;
  /** 수집된 로어북 API 호출 목록이 */
  loreApiCalls: CollectedLoreApiCall[];
}

/**
 * 분석 단계의 최종 결과물 구조
 */
export interface AnalyzePhaseResult {
  /** 주석 섹션 정보 목록이 */
  commentSections: Array<{ title: string; line: number; source: string }>;
  /** 섹션 맵 정보 목록이 */
  sectionMapSections: Array<{ title: string; source: string; startLine: number; endLine: number }>;
  /** 함수 호출 그래프(caller -> callees) */
  callGraph: Map<string, Set<string>>;
  /** 역방향 함수 호출 정보(callee -> callers) */
  calledBy: Map<string, Set<string>>;
  /** 카테고리별 API 사용 현황이 */
  apiByCategory: Map<string, { apis: Set<string>; count: number }>;
  /** 분석된 모듈 그룹 목록이 */
  moduleGroups: Array<{
    /** 그룹의 식별 이름이 */
    name: string;
    /** 그룹의 표시 제목이 */
    title: string;
    /** 그룹으로 분류된 이유 */
    reason: string;
    /** 원본 소스 식별자 */
    source: string;
    /** 그룹에 포함된 함수 이름 집합이 */
    functions: Set<string>;
    /** 그룹에 포함된 테이블 이름 집합이 */
    tables: Set<string>;
    /** 그룹에서 사용된 API 카테고리 집합이 */
    apiCats: Set<string>;
    /** 그룹에서 사용된 상태 변수 키 집합이 */
    stateKeys: Set<string>;
    /** 그룹의 가상 디렉토리 경로 */
    dir: string;
  }>;
  /** 함수 이름을 키로 하는 소속 모듈 이름 맵이 */
  moduleByFunction: Map<string, string>;
  /** 상태 변수의 모듈별 소유권 정보 목록이 */
  stateOwnership: Array<{
    /** 상태 변수 키 */
    key: string;
    /** 이 변수를 읽는 모듈 목록이 */
    readBy: string[];
    /** 이 변수에 값을 쓰는 모듈 목록이 */
    writers: string[];
    /** 주 소유 모듈의 이름이 */
    ownerModule: string;
    /** 여러 모듈에서 공유되어 사용되는지 여부 */
    crossModule: boolean;
  }>;
  /** 레지스트리 변수 분석 정보 목록이 */
  registryVars: Array<{
    /** 변수 키 이름이 */
    key: string;
    /** 권장되는 기본값 문자열이 */
    suggestedDefault: string;
    /** 숫자 타입으로 권장되는지 여부 */
    suggestNumber: boolean;
    /** 초기화 패턴으로 감지되었는지 여부 */
    isInitPattern: boolean;
    /** 읽기 횟수 */
    readCount: number;
    /** 쓰기 횟수 */
    writeCount: number;
    /** 처음으로 값을 쓴 함수 이름이 */
    firstWriteFunction: string;
    /** 여러 번 쓰기가 발생하는지 여부 */
    hasDualWrite: boolean;
  }>;
  /** 최상위(진입점) 함수 목록이 */
  rootFunctions: CollectedFunction[];
  /** 특정 함수의 모든 하위 호출 함수 목록을 가져오는 함수 */
  getDescendants: (name: string) => CollectedFunction[];
}

/**
 * 변수와 분석 주체(Lua, 로어북 등) 간의 연관 관계 항목이
 */
export interface CorrelationEntry {
  /** 변수의 이름이 */
  varName: string;
  /** Lua 코드에서 이 변수를 읽는 주체 목록이 */
  luaReaders: string[];
  /** Lua 코드에서 이 변수에 쓰는 주체 목록이 */
  luaWriters: string[];
  /** 데이터 흐름 방향이 */
  direction: string;
}

/**
 * 로어북과 Lua 코드 간의 변수 연관 관계 분석 결과
 */
export interface LorebookCorrelation {
  /** 각 변수별 상세 연관 관계 목록이 */
  correlations: Array<
    CorrelationEntry & {
      /** 로어북에서 이 변수를 읽는 항목 목록이 */
      lorebookReaders: string[];
      /** 로어북에서 이 변수에 쓰는 항목 목록이 */
      lorebookWriters: string[];
      /** Lua 코드에서만 사용되는지 여부 */
      luaOnly: boolean;
      /** 로어북에서만 사용되는지 여부 */
      lorebookOnly: boolean;
    }
  >;
  /** 로어북 엔트리별 요약 정보 목록이 */
  entryInfos: Array<{
    /** 엔트리 이름이 */
    name: string;
    /** 소속 폴더 이름이 */
    folder: string | null;
    /** 엔트리 내에서 사용된 변수 목록이 */
    vars: string[];
    /** 엔트리가 의존하는 Lua 요소 목록이 */
    luaDeps: string[];
  }>;
  /** 분석된 로어북 API 호출 목록이 */
  loreApiCalls: CollectedLoreApiCall[];
  /** 전체 엔트리 개수 */
  totalEntries: number;
  /** 전체 폴더 개수 */
  totalFolders: number;
  /** 양쪽 모두에서 사용되는 연결 변수 목록이 */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 사용되는 변수 목록이 */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 로어북에서만 사용되는 변수 목록이 */
  lorebookOnlyVars: Array<CorrelationEntry>;
}

/**
 * 정규식 스크립트와 Lua 코드 간의 변수 연관 관계 분석 결과
 */
export interface RegexCorrelation {
  /** 각 변수별 상세 연관 관계 목록이 */
  correlations: Array<
    CorrelationEntry & {
      /** 정규식 스크립트에서 이 변수를 읽는 항목 목록이 */
      regexReaders: string[];
      /** 정규식 스크립트에서 이 변수에 쓰는 항목 목록이 */
      regexWriters: string[];
      /** Lua 코드에서만 사용되는지 여부 */
      luaOnly: boolean;
      /** 정규식 스크립트에서만 사용되는지 여부 */
      regexOnly: boolean;
    }
  >;
  /** 정규식 스크립트별 요약 정보 목록이 */
  scriptInfos: Array<{
    /** 스크립트 주석이 */
    comment: string;
    /** 스크립트 타입이 */
    type: string;
    /** 패턴 내 포함 여부 정보 */
    inPattern: string;
    /** 스크립트 내에서 사용된 변수 목록이 */
    vars: string[];
    /** 스크립트가 의존하는 Lua 요소 목록이 */
    luaDeps: string[];
  }>;
  /** 전체 스크립트 개수 */
  totalScripts: number;
  /** 활성화된 스크립트 개수 */
  activeScripts: number;
  /** 양쪽 모두에서 사용되는 연결 변수 목록이 */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 사용되는 변수 목록이 */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 정규식에서만 사용되는 변수 목록이 */
  regexOnlyVars: Array<CorrelationEntry>;
}
