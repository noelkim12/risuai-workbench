/**
 * Lua 코드 분석에 사용되는 타입 정의들이에요.
 */
import { type ApiMeta } from './lua-api';

export type { ApiMeta };

/**
 * 분석 과정에서 수집된 Lua 함수 정보에요.
 */
export interface CollectedFunction {
  /** 함수의 이름이에요. */
  name: string;
  /** UI 등에 표시될 함수의 이름이에요. */
  displayName: string;
  /** 함수 정의가 시작되는 줄 번호에요. */
  startLine: number;
  /** 함수 정의가 끝나는 줄 번호에요. */
  endLine: number;
  /** 함수의 전체 줄 수에요. */
  lineCount: number;
  /** 로컬 함수 여부 에요. */
  isLocal: boolean;
  /** 비동기 함수 여부 에요. */
  isAsync: boolean;
  /** 함수의 매개변수 목록이에요. */
  params: string[];
  /** 이 함수를 포함하는 상위 함수의 이름이에요. 없으면 null이에요. */
  parentFunction: string | null;
  /** `ListenEdit` 핸들러인지 여부에요. */
  isListenEditHandler: boolean;
  /** `ListenEdit` 핸들러인 경우, 대상 이벤트 타입이에요. */
  listenEditEventType: string | null;
  /** 함수 내에서 사용된 API 카테고리 집합이에요. */
  apiCategories: Set<string>;
  /** 함수 내에서 호출된 API 이름 집합이에요. */
  apiNames: Set<string>;
  /** 함수 내에서 읽은 상태 변수 키 집합이에요. */
  stateReads: Set<string>;
  /** 함수 내에서 쓴 상태 변수 키 집합이에요. */
  stateWrites: Set<string>;
}

/**
 * 분석 과정에서 수집된 상태 변수 정보에요.
 */
export interface CollectedStateVar {
  /** 상태 변수의 키 이름이에요. */
  key: string;
  /** 이 변수를 읽는 함수 이름 집합이에요. */
  readBy: Set<string>;
  /** 이 변수에 값을 쓰는 함수 이름 집합이에요. */
  writtenBy: Set<string>;
  /** 이 변수와 관련된 API 이름 집합이에요. */
  apis: Set<string>;
  /** 변수에 처음으로 기록된 값의 문자열 표현이에요. */
  firstWriteValue: string | null;
  /** 변수에 처음으로 값을 쓴 함수의 이름이에요. */
  firstWriteFunction: string | null;
  /** 변수에 처음으로 값을 쓴 줄 번호에요. */
  firstWriteLine: number;
  /** 동일한 함수 내에서 여러 번 쓰기가 발생하는지 여부에요. */
  hasDualWrite: boolean;
}

/**
 * 함수 호출 관계 정보에요.
 */
export interface CollectedCall {
  /** 호출한 함수의 이름이에요. 전역 범위면 null이에요. */
  caller: string | null;
  /** 호출된 함수의 이름이에요. */
  callee: string | null;
  /** 호출이 발생한 줄 번호에요. */
  line: number;
}

/**
 * API 호출 정보에요.
 */
export interface CollectedApiCall {
  /** 호출된 API의 이름이에요. */
  apiName: string;
  /** API가 속한 카테고리에요. */
  category: string;
  /** API 접근 방식이에요. */
  access: string;
  /** 읽기(read) 또는 쓰기(write) 작업 구분이에요. */
  rw: 'read' | 'write';
  /** 호출이 발생한 줄 번호에요. */
  line: number;
  /** 호출을 포함하고 있는 함수의 이름이에요. */
  containingFunction: string;
}

/**
 * 로어북 관련 API 호출 정보에요.
 */
export interface CollectedLoreApiCall {
  /** 호출된 로어북 API 이름이에요. */
  apiName: string;
  /** 관련된 키워드 정보에요. 없으면 null이에요. */
  keyword: string | null;
  /** 호출이 발생한 줄 번호에요. */
  line: number;
  /** 호출을 포함하고 있는 함수의 이름이에요. */
  containingFunction: string;
}

/**
 * Lua 코드 분석을 통해 수집된 전체 데이터 구조에요.
 */
export interface CollectedData {
  /** 수집된 함수 목록이에요. */
  functions: CollectedFunction[];
  /** 수집된 함수 호출 목록이에요. */
  calls: CollectedCall[];
  /** 수집된 API 호출 목록이에요. */
  apiCalls: CollectedApiCall[];
  /** 수집된 이벤트 핸들러 정보 목록이에요. */
  handlers: Array<{
    /** 핸들러의 타입이에요. */
    type: string;
    /** 정의된 줄 번호에요. */
    line: number;
    /** 비동기 여부에요. */
    isAsync: boolean;
    /** 연결된 함수의 이름이에요. */
    functionName: string | null;
    /** 상세 정보에요. */
    detail: string | null;
  }>;
  /** 수집된 데이터 테이블 구조 목록이에요. */
  dataTables: Array<{
    /** 테이블의 이름이에요. */
    name: string;
    /** 필드 개수에요. */
    fieldCount: number;
    /** 시작 줄 번호에요. */
    startLine: number;
    /** 끝 줄 번호에요. */
    endLine: number;
    /** 중첩 깊이에요. */
    depth: number;
  }>;
  /** 상태 변수 키를 기반으로 한 수집 정보 맵이에요. */
  stateVars: Map<string, CollectedStateVar>;
  /** 함수 이름을 키로 하는 함수 정보 인덱스 맵이에요. */
  functionIndexByName: Map<string, CollectedFunction[]>;
  /** 접두사(Prefix)를 기반으로 분류된 함수 정보 맵이에요. */
  prefixBuckets: Map<string, CollectedFunction[]>;
  /** 수집된 로어북 API 호출 목록이에요. */
  loreApiCalls: CollectedLoreApiCall[];
}

/**
 * 분석 단계의 최종 결과물 구조에요.
 */
export interface AnalyzePhaseResult {
  /** 주석 섹션 정보 목록이에요. */
  commentSections: Array<{ title: string; line: number; source: string }>;
  /** 섹션 맵 정보 목록이에요. */
  sectionMapSections: Array<{ title: string; source: string; startLine: number; endLine: number }>;
  /** 함수 호출 그래프(caller -> callees)에요. */
  callGraph: Map<string, Set<string>>;
  /** 역방향 함수 호출 정보(callee -> callers)에요. */
  calledBy: Map<string, Set<string>>;
  /** 카테고리별 API 사용 현황이에요. */
  apiByCategory: Map<string, { apis: Set<string>; count: number }>;
  /** 분석된 모듈 그룹 목록이에요. */
  moduleGroups: Array<{
    /** 그룹의 식별 이름이에요. */
    name: string;
    /** 그룹의 표시 제목이에요. */
    title: string;
    /** 그룹으로 분류된 이유에요. */
    reason: string;
    /** 원본 소스 식별자에요. */
    source: string;
    /** 그룹에 포함된 함수 이름 집합이에요. */
    functions: Set<string>;
    /** 그룹에 포함된 테이블 이름 집합이에요. */
    tables: Set<string>;
    /** 그룹에서 사용된 API 카테고리 집합이에요. */
    apiCats: Set<string>;
    /** 그룹에서 사용된 상태 변수 키 집합이에요. */
    stateKeys: Set<string>;
    /** 그룹의 가상 디렉토리 경로에요. */
    dir: string;
  }>;
  /** 함수 이름을 키로 하는 소속 모듈 이름 맵이에요. */
  moduleByFunction: Map<string, string>;
  /** 상태 변수의 모듈별 소유권 정보 목록이에요. */
  stateOwnership: Array<{
    /** 상태 변수 키에요. */
    key: string;
    /** 이 변수를 읽는 모듈 목록이에요. */
    readBy: string[];
    /** 이 변수에 값을 쓰는 모듈 목록이에요. */
    writers: string[];
    /** 주 소유 모듈의 이름이에요. */
    ownerModule: string;
    /** 여러 모듈에서 공유되어 사용되는지 여부에요. */
    crossModule: boolean;
  }>;
  /** 레지스트리 변수 분석 정보 목록이에요. */
  registryVars: Array<{
    /** 변수 키 이름이에요. */
    key: string;
    /** 권장되는 기본값 문자열이에요. */
    suggestedDefault: string;
    /** 숫자 타입으로 권장되는지 여부에요. */
    suggestNumber: boolean;
    /** 초기화 패턴으로 감지되었는지 여부에요. */
    isInitPattern: boolean;
    /** 읽기 횟수에요. */
    readCount: number;
    /** 쓰기 횟수에요. */
    writeCount: number;
    /** 처음으로 값을 쓴 함수 이름이에요. */
    firstWriteFunction: string;
    /** 여러 번 쓰기가 발생하는지 여부에요. */
    hasDualWrite: boolean;
  }>;
  /** 최상위(진입점) 함수 목록이에요. */
  rootFunctions: CollectedFunction[];
  /** 특정 함수의 모든 하위 호출 함수 목록을 가져오는 함수에요. */
  getDescendants: (name: string) => CollectedFunction[];
}

/**
 * 변수와 분석 주체(Lua, 로어북 등) 간의 연관 관계 항목이에요.
 */
export interface CorrelationEntry {
  /** 변수의 이름이에요. */
  varName: string;
  /** Lua 코드에서 이 변수를 읽는 주체 목록이에요. */
  luaReaders: string[];
  /** Lua 코드에서 이 변수에 쓰는 주체 목록이에요. */
  luaWriters: string[];
  /** 데이터 흐름 방향이에요. */
  direction: string;
}

/**
 * 로어북과 Lua 코드 간의 변수 연관 관계 분석 결과에요.
 */
export interface LorebookCorrelation {
  /** 각 변수별 상세 연관 관계 목록이에요. */
  correlations: Array<
    CorrelationEntry & {
      /** 로어북에서 이 변수를 읽는 항목 목록이에요. */
      lorebookReaders: string[];
      /** 로어북에서 이 변수에 쓰는 항목 목록이에요. */
      lorebookWriters: string[];
      /** Lua 코드에서만 사용되는지 여부에요. */
      luaOnly: boolean;
      /** 로어북에서만 사용되는지 여부에요. */
      lorebookOnly: boolean;
    }
  >;
  /** 로어북 엔트리별 요약 정보 목록이에요. */
  entryInfos: Array<{
    /** 엔트리 이름이에요. */
    name: string;
    /** 소속 폴더 이름이에요. */
    folder: string | null;
    /** 엔트리 내에서 사용된 변수 목록이에요. */
    vars: string[];
    /** 엔트리가 의존하는 Lua 요소 목록이에요. */
    luaDeps: string[];
  }>;
  /** 분석된 로어북 API 호출 목록이에요. */
  loreApiCalls: CollectedLoreApiCall[];
  /** 전체 엔트리 개수에요. */
  totalEntries: number;
  /** 전체 폴더 개수에요. */
  totalFolders: number;
  /** 양쪽 모두에서 사용되는 연결 변수 목록이에요. */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 사용되는 변수 목록이에요. */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 로어북에서만 사용되는 변수 목록이에요. */
  lorebookOnlyVars: Array<CorrelationEntry>;
}

/**
 * 정규식 스크립트와 Lua 코드 간의 변수 연관 관계 분석 결과에요.
 */
export interface RegexCorrelation {
  /** 각 변수별 상세 연관 관계 목록이에요. */
  correlations: Array<
    CorrelationEntry & {
      /** 정규식 스크립트에서 이 변수를 읽는 항목 목록이에요. */
      regexReaders: string[];
      /** 정규식 스크립트에서 이 변수에 쓰는 항목 목록이에요. */
      regexWriters: string[];
      /** Lua 코드에서만 사용되는지 여부에요. */
      luaOnly: boolean;
      /** 정규식 스크립트에서만 사용되는지 여부에요. */
      regexOnly: boolean;
    }
  >;
  /** 정규식 스크립트별 요약 정보 목록이에요. */
  scriptInfos: Array<{
    /** 스크립트 주석이에요. */
    comment: string;
    /** 스크립트 타입이에요. */
    type: string;
    /** 패턴 내 포함 여부 정보에요. */
    inPattern: string;
    /** 스크립트 내에서 사용된 변수 목록이에요. */
    vars: string[];
    /** 스크립트가 의존하는 Lua 요소 목록이에요. */
    luaDeps: string[];
  }>;
  /** 전체 스크립트 개수에요. */
  totalScripts: number;
  /** 활성화된 스크립트 개수에요. */
  activeScripts: number;
  /** 양쪽 모두에서 사용되는 연결 변수 목록이에요. */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 사용되는 변수 목록이에요. */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 정규식에서만 사용되는 변수 목록이에요. */
  regexOnlyVars: Array<CorrelationEntry>;
}
