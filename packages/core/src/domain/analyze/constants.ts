/** 분석 리포트에서 표시할 최대 변수 수에요. */
export const MAX_VARS_IN_REPORT = 80;
/** 분석 리포트에서 표시할 최대 엔트리 수에요. */
export const MAX_ENTRIES_IN_REPORT = 50;
/** 분석 리포트에서 표시할 최대 스크립트 수에요. */
export const MAX_SCRIPTS_IN_REPORT = 40;

/**
 * 분석 대상이 되는 요소의 타입들이에요.
 */
export const ELEMENT_TYPES = {
  /** 로어북 엔트리 */
  LOREBOOK: 'lorebook',
  /** 정규식 스크립트 */
  REGEX: 'regex',
  /** Lua 스크립트 */
  LUA: 'lua',
  /** HTML/UI 요소 */
  HTML: 'html',
  /** 변수 설정 */
  VARIABLES: 'variables',
  /** TypeScript (모듈 등) */
  TYPESCRIPT: 'typescript',
} as const;

/**
 * CBS 변수 조작 연산의 종류에요.
 */
export const CBS_OPS = {
  /** 읽기 연산 */
  READ: 'read',
  /** 쓰기 연산 */
  WRITE: 'write',
} as const;

export type ElementType =
  (typeof ELEMENT_TYPES)[keyof typeof ELEMENT_TYPES];
