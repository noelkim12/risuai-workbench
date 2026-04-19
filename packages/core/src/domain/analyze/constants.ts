/** 분석 리포트에서 표시할 최대 변수 수 */
export const MAX_VARS_IN_REPORT = 80;
/** 분석 리포트에서 표시할 최대 엔트리 수 */
export const MAX_ENTRIES_IN_REPORT = 50;
/** 분석 리포트에서 표시할 최대 스크립트 수 */
export const MAX_SCRIPTS_IN_REPORT = 40;

/**
 * 분석 대상이 되는 요소의 타입들이
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
 * CBS 변수 조작 연산의 종류
 */
export const CBS_OPS = {
  /** 읽기 연산 */
  READ: 'read',
  /** 쓰기 연산 */
  WRITE: 'write',
} as const;

/** 토큰 예산 경고 기준값 */
export const TOKEN_THRESHOLDS = {
  INFO_WORST_CASE: 4000,
  WARNING_WORST_CASE: 8000,
  WARNING_SINGLE_COMPONENT: 2000,
  ERROR_WORST_CASE: 16000,
  ERROR_ALWAYS_ACTIVE: 8000,
} as const;

/** 문자 기반 토큰 추정 비율 */
export const TOKEN_RATIOS = {
  LATIN_CHARS_PER_TOKEN: 4,
  CJK_CHARS_PER_TOKEN: 1,
} as const;

/** 분석용 런타임 phase 모델 */
export enum PipelinePhase {
  LUA_TRIGGER = 1,
  DISPLAY_TRIGGER = 2,
  CBS_EXPANSION = 4,
  REGEX_SCRIPT = 5,
  LOREBOOK_LOAD = 6,
}

/** element type → analysis phase 매핑 */
export const PHASE_MAP: Record<string, PipelinePhase> = {
  lua: PipelinePhase.LUA_TRIGGER,
  typescript: PipelinePhase.LUA_TRIGGER,
  prompt: PipelinePhase.CBS_EXPANSION,
  template: PipelinePhase.CBS_EXPANSION,
  character: PipelinePhase.CBS_EXPANSION,
  html: PipelinePhase.CBS_EXPANSION,
  variables: PipelinePhase.CBS_EXPANSION,
  regex: PipelinePhase.REGEX_SCRIPT,
  lorebook: PipelinePhase.LOREBOOK_LOAD,
};

export type ElementType = (typeof ELEMENT_TYPES)[keyof typeof ELEMENT_TYPES];
