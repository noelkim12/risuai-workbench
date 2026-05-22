/**
 * Lua 코드 분석 과정에서 수집하고 반환하는 타입 정의 모음.
 * @file packages/core/src/domain/analyze/lua-analysis-types.ts
 */
import { type ApiMeta } from './lua-api';

/**
 * Lua API 메타데이터 타입 재내보내기.
 */
export type { ApiMeta };

/**
 * 분석 과정에서 수집된 Lua 함수 정보.
 */
export interface CollectedFunction {
  /** 함수의 정규화된 이름. */
  name: string;
  /** 리포트에 표시할 함수 이름. */
  displayName: string;
  /** 함수 시작 행 번호. */
  startLine: number;
  /** 함수 종료 행 번호. */
  endLine: number;
  /** 함수가 차지하는 전체 행 수. */
  lineCount: number;
  /** local 함수 선언 여부. */
  isLocal: boolean;
  /** 비동기 패턴으로 감지되었는지 여부. */
  isAsync: boolean;
  /** 함수 파라미터 이름 목록. */
  params: string[];
  /** 이 함수를 포함하는 상위 함수. 최상위 범위면 `null`. */
  parentFunction: string | null;
  /** ListenEdit 핸들러로 감지되었는지 여부. */
  isListenEditHandler: boolean;
  /** `ListenEdit` 핸들러인 경우 대상 이벤트 타입. 핸들러가 아니면 `null`. */
  listenEditEventType: string | null;
  /** 함수 안에서 호출한 API 카테고리 집합. */
  apiCategories: Set<string>;
  /** 함수 안에서 호출한 API 이름 집합. */
  apiNames: Set<string>;
  /** 함수 안에서 읽은 상태 키 집합. */
  stateReads: Set<string>;
  /** 함수 안에서 쓴 상태 키 집합. */
  stateWrites: Set<string>;
}

/**
 * 개별 상태 접근 발생 정보.
 * 정적 문자열 키로 확인된 상태 접근만 담음.
 */
export interface StateAccessOccurrence {
  /** 상태 변수 키. */
  key: string;
  /** 접근 방향. */
  direction: 'read' | 'write';
  /** 상태 접근에 사용된 API 이름. */
  apiName: string;
  /** 접근이 발생한 함수 이름. 최상위면 '<top-level>'. */
  containingFunction: string;
  /** 접근이 발생한 행 번호. */
  line: number;
  /** 인자 노드의 시작 바이트 위치. */
  argStart: number;
  /** 인자 노드의 종료 바이트 위치. */
  argEnd: number;
}

/**
 * 분석 과정에서 수집된 상태 변수 정보.
 */
export interface CollectedStateVar {
  /** 상태 변수 키. */
  key: string;
  /** 이 상태를 읽은 함수 이름 집합. */
  readBy: Set<string>;
  /** 이 상태를 쓴 함수 이름 집합. */
  writtenBy: Set<string>;
  /** 이 상태 접근에 사용된 API 이름 집합. */
  apis: Set<string>;
  /** 처음 기록된 값의 문자열 표현. 없으면 `null`. */
  firstWriteValue: string | null;
  /** 처음 값을 쓴 함수의 이름. 없으면 `null`. */
  firstWriteFunction: string | null;
  /** 처음 값을 쓴 행 번호. */
  firstWriteLine: number;
  /** 동일 함수 내에서 여러 번 쓰기가 발생했는지 여부. */
  hasDualWrite: boolean;
}

/**
 * 함수 호출 관계 정보.
 */
export interface CollectedCall {
  /** 호출한 함수. 전역 범위면 `null`. */
  caller: string | null;
  /** 호출된 함수 이름. 확인할 수 없으면 `null`. */
  callee: string | null;
  /** 호출이 발생한 행 번호. */
  line: number;
}

/**
 * `package.preload[...]`로 정의된 정적 모듈 정보.
 */
export interface CollectedPreloadModule {
  /** preload에 등록된 모듈 이름. */
  moduleName: string;
  /** 모듈 본문을 제공하는 함수 이름. */
  functionName: string;
  /** 모듈이 내보내는 멤버 이름과 함수 이름 매핑. */
  exportedMembers: Map<string, string>;
  /** preload 정의가 시작된 행 번호. */
  line: number;
}

/**
 * `local alias = require('...')` 바인딩 정보.
 */
export interface CollectedRequireBinding {
  /** require 결과를 받은 local 이름. */
  localName: string;
  /** require 대상 모듈 이름. */
  moduleName: string;
  /** 바인딩이 발생한 함수 이름. 최상위면 `null`. */
  containingFunction: string | null;
  /** 바인딩이 발생한 행 번호. */
  line: number;
}

/**
 * require alias 기반 멤버 호출 정보.
 */
export interface CollectedModuleMemberCall {
  /** 호출한 함수. 전역 범위면 `null`. */
  caller: string | null;
  /** require alias 이름. */
  aliasName: string;
  /** alias에서 호출한 멤버 이름. */
  memberName: string;
  /** 호출이 발생한 행 번호. */
  line: number;
}

/**
 * API 호출 정보.
 */
export interface CollectedApiCall {
  /** 호출된 API 이름. */
  apiName: string;
  /** API 카테고리. */
  category: string;
  /** API 접근 방식. */
  access: string;
  /** API 호출의 읽기 또는 쓰기 방향. */
  rw: 'read' | 'write';
  /** 호출이 발생한 행 번호. */
  line: number;
  /** 호출을 포함하는 함수 이름. */
  containingFunction: string;
}

/**
 * 로어북 관련 API 호출 정보.
 */
export interface CollectedLoreApiCall {
  /** 호출된 로어북 API 이름. */
  apiName: string;
  /** 관련 키워드. 없으면 `null`. */
  keyword: string | null;
  /** 호출이 발생한 행 번호. */
  line: number;
  /** 호출을 포함하는 함수 이름. */
  containingFunction: string;
}

/**
 * Lua 코드 분석을 통해 수집된 전체 데이터 구조.
 */
export interface CollectedData {
  /** 수집된 함수 목록. */
  functions: CollectedFunction[];
  /** 수집된 함수 호출 관계 목록. */
  calls: CollectedCall[];
  /** 수집된 RisuAI API 호출 목록. */
  apiCalls: CollectedApiCall[];
  /** 수집된 이벤트 핸들러 목록. */
  handlers: Array<{
    /** 핸들러 타입. */
    type: string;
    /** 핸들러가 선언된 행 번호. */
    line: number;
    /** 핸들러가 비동기로 동작하는지 여부. */
    isAsync: boolean;
    /** 연결된 함수. 익명이면 `null`. */
    functionName: string | null;
    /** 핸들러 보조 설명. */
    detail: string | null;
  }>;
  /** 수집된 데이터 테이블 목록. */
  dataTables: Array<{
    /** 테이블 이름. */
    name: string;
    /** 테이블 필드 수. */
    fieldCount: number;
    /** 테이블 시작 행 번호. */
    startLine: number;
    /** 테이블 종료 행 번호. */
    endLine: number;
    /** 테이블 중첩 깊이. */
    depth: number;
  }>;
  /** 상태 키별 수집 정보. */
  stateVars: Map<string, CollectedStateVar>;
  /** 함수 이름으로 조회하는 함수 인덱스. */
  functionIndexByName: Map<string, CollectedFunction[]>;
  /** 접두사로 분류된 함수 버킷. */
  prefixBuckets: Map<string, CollectedFunction[]>;
  /** 수집된 로어북 API 호출 목록. */
  loreApiCalls: CollectedLoreApiCall[];
  /** 수집된 preload 모듈 목록. */
  preloadModules: CollectedPreloadModule[];
  /** 수집된 require 바인딩 목록. */
  requireBindings: CollectedRequireBinding[];
  /** 수집된 모듈 멤버 호출 목록. */
  moduleMemberCalls: CollectedModuleMemberCall[];
  /** 정적 문자열 키 기준 상태 접근 발생 목록. */
  stateAccessOccurrences: StateAccessOccurrence[];
}

/**
 * 분석 단계의 최종 결과물 구조.
 */
export interface AnalyzePhaseResult {
  /** 주석 기반 섹션 목록. */
  commentSections: Array<{ title: string; line: number; source: string }>;
  /** section map에서 추출한 섹션 목록. */
  sectionMapSections: Array<{ title: string; source: string; startLine: number; endLine: number }>;
  /** 함수 호출 그래프. */
  callGraph: Map<string, Set<string>>;
  /** 역방향 호출 그래프. */
  calledBy: Map<string, Set<string>>;
  /** API 카테고리별 호출 집계. */
  apiByCategory: Map<string, { apis: Set<string>; count: number }>;
  /** 분석 결과에서 제안한 모듈 그룹 목록. */
  moduleGroups: Array<{
    /** 모듈 그룹 이름. */
    name: string;
    /** 표시용 제목. */
    title: string;
    /** 그룹이 만들어진 이유. */
    reason: string;
    /** 그룹 근거가 된 소스 범주. */
    source: string;
    /** 그룹에 속한 함수 이름 집합. */
    functions: Set<string>;
    /** 그룹에 속한 테이블 이름 집합. */
    tables: Set<string>;
    /** 그룹에 속한 API 카테고리 집합. */
    apiCats: Set<string>;
    /** 그룹에 속한 상태 키 집합. */
    stateKeys: Set<string>;
    /** 그룹의 가상 디렉토리 경로. */
    dir: string;
  }>;
  /** 함수 이름에서 모듈 이름으로 이어지는 매핑. */
  moduleByFunction: Map<string, string>;
  /** 상태 키 소유권 분석 결과. */
  stateOwnership: Array<{
    /** 상태 키. */
    key: string;
    /** 상태를 읽은 함수 이름 목록. */
    readBy: string[];
    /** 상태를 쓴 함수 이름 목록. */
    writers: string[];
    /** 소유 모듈 이름. */
    ownerModule: string;
    /** 여러 모듈에서 공유 사용되는지 여부. */
    crossModule: boolean;
  }>;
  /** registry 변수 추천 목록. */
  registryVars: Array<{
    /** 상태 키. */
    key: string;
    /** 추천 기본값. */
    suggestedDefault: string;
    /** 숫자 타입으로 권장되는지 여부. */
    suggestNumber: boolean;
    /** 초기화 패턴으로 감지되었는지 여부. */
    isInitPattern: boolean;
    /** 읽기 발생 횟수. */
    readCount: number;
    /** 쓰기 발생 횟수. */
    writeCount: number;
    /** 처음 값을 쓴 함수 이름. */
    firstWriteFunction: string;
    /** 여러 번 쓰기가 발생하는지 여부. */
    hasDualWrite: boolean;
  }>;
  /** 최상위 함수 목록. */
  rootFunctions: CollectedFunction[];
  /** 특정 함수의 모든 하위 호출 함수를 조회. */
  getDescendants: (name: string) => CollectedFunction[];
  /** require alias와 preload를 해석한 모듈 호출 목록. */
  resolvedModuleCalls: Array<{
    /** 호출한 함수 이름. */
    caller: string;
    /** 해석된 호출 대상 함수 이름. */
    callee: string;
    /** 호출 대상 모듈 이름. */
    moduleName: string;
    /** 호출 대상 멤버 이름. */
    memberName: string;
    /** 호출이 발생한 행 번호. */
    line: number;
  }>;
}

/**
 * 변수와 분석 주체 간의 연관 관계 항목.
 */
export interface CorrelationEntry {
  /** 변수 이름. */
  varName: string;
  /** 변수를 읽는 Lua 함수 목록. */
  luaReaders: string[];
  /** 변수를 쓰는 Lua 함수 목록. */
  luaWriters: string[];
  /** 데이터 흐름 방향. */
  direction: string;
}

/**
 * 로어북과 Lua 코드 간의 변수 연관 관계 분석 결과.
 */
export interface LorebookCorrelation {
  /** Lua와 로어북 사이의 변수 연관 목록. */
  correlations: Array<
    CorrelationEntry & {
      /** 변수를 읽는 로어북 엔트리 목록. */
      lorebookReaders: string[];
      /** 변수를 쓰는 로어북 엔트리 목록. */
      lorebookWriters: string[];
      /** Lua에서만 발견된 변수인지 여부. */
      luaOnly: boolean;
      /** 로어북에서만 발견된 변수인지 여부. */
      lorebookOnly: boolean;
    }
  >;
  /** 로어북 엔트리별 분석 정보. */
  entryInfos: Array<{
    /** 엔트리 이름. */
    name: string;
    /** 소속 폴더. 루트면 `null`. */
    folder: string | null;
    /** 엔트리에서 참조한 변수 목록. */
    vars: string[];
    /** 엔트리와 연결된 Lua 의존성 목록. */
    luaDeps: string[];
  }>;
  /** 로어북 API 호출 목록. */
  loreApiCalls: CollectedLoreApiCall[];
  /** 전체 로어북 엔트리 수. */
  totalEntries: number;
  /** 전체 로어북 폴더 수. */
  totalFolders: number;
  /** Lua와 로어북을 잇는 변수 목록. */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 발견된 변수 목록. */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 로어북에서만 발견된 변수 목록. */
  lorebookOnlyVars: Array<CorrelationEntry>;
}

/**
 * 정규식 스크립트와 Lua 코드 간의 변수 연관 관계 분석 결과.
 */
export interface RegexCorrelation {
  /** Lua와 정규식 스크립트 사이의 변수 연관 목록. */
  correlations: Array<
    CorrelationEntry & {
      /** 변수를 읽는 정규식 스크립트 목록. */
      regexReaders: string[];
      /** 변수를 쓰는 정규식 스크립트 목록. */
      regexWriters: string[];
      /** Lua에서만 발견된 변수인지 여부. */
      luaOnly: boolean;
      /** 정규식 스크립트에서만 발견된 변수인지 여부. */
      regexOnly: boolean;
    }
  >;
  /** 정규식 스크립트별 분석 정보. */
  scriptInfos: Array<{
    /** 스크립트 설명 주석. */
    comment: string;
    /** 스크립트 타입. */
    type: string;
    /** 패턴 내 포함 여부 정보. */
    inPattern: string;
    /** 스크립트에서 참조한 변수 목록. */
    vars: string[];
    /** 스크립트와 연결된 Lua 의존성 목록. */
    luaDeps: string[];
  }>;
  /** 전체 정규식 스크립트 수. */
  totalScripts: number;
  /** 활성 정규식 스크립트 수. */
  activeScripts: number;
  /** Lua와 정규식 스크립트를 잇는 변수 목록. */
  bridgedVars: Array<CorrelationEntry>;
  /** Lua에서만 발견된 변수 목록. */
  luaOnlyVars: Array<CorrelationEntry>;
  /** 정규식 스크립트에서만 발견된 변수 목록. */
  regexOnlyVars: Array<CorrelationEntry>;
}
