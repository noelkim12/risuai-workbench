/**
 * RisuLua 번들 모드 계약 및 CLI 파서.
 *
 * 모드 의미는 하위 태스크(T3+)에서 정의되며,
 * 이 모듈은 타입, 파서, 제거 유틸리티만 제공함.
 */

// ── 타입 ─────────────────────────────────────────────────────────────

/** RisuLua 번들 모드 타입. 'classic': 전통 방식, 'modular': 모듈 방식 */
export type RisuLuaMode = 'classic' | 'modular';

/** parseRisuLuaMode 함수 반환 타입. 파싱된 모드 및 정제된 argv 포함 */
export interface ParsedRisuLuaMode {
  /** 값이 없으면 null — 향후 auto-detect(T3) 예약됨 */
  mode: RisuLuaMode | null;
  /** `--risulua-mode <value>` 제거된 argv */
  strippedArgv: string[];
}

// ── 상수 ─────────────────────────────────────────────────────────────

/** RisuLua 모드 지정 CLI 플래그 상수 */
export const RISULUA_MODE_FLAG = '--risulua-mode';

/** 관련 명령어 도움말 섹션에 포함할 도움말 텍스트 조각 */
export const RISULUA_MODE_HELP_LINE =
  '    --risulua-mode <classic|modular>  Lua 번들 모드 (미지정 시 향후 auto-detect)';

const VALID_MODES: readonly string[] = ['classic', 'modular'];

// ── 파서 ───────────────────────────────────────────────────────────

/**
 * argv에서 `--risulua-mode <classic|modular>` 파싱.
 *
 * - 플래그 없음 → `{ mode: null, strippedArgv: [...argv] }`
 * - 유효한 값 → `{ mode: value, strippedArgv }`
 * - 유효하지 않거나 값 누락 → 결정적 `Error` 발생
 */
export function parseRisuLuaMode(argv: readonly string[]): ParsedRisuLuaMode {
  const idx = argv.indexOf(RISULUA_MODE_FLAG);
  if (idx < 0) {
    return { mode: null, strippedArgv: [...argv] };
  }

  const value = argv[idx + 1];
  if (!value || !VALID_MODES.includes(value)) {
    throw new Error(
      `Invalid ${RISULUA_MODE_FLAG} value: "${value ?? ''}". Must be "classic" or "modular".`,
    );
  }

  const strippedArgv = [...argv];
  strippedArgv.splice(idx, 2);

  return { mode: value as RisuLuaMode, strippedArgv };
}

/**
 * argv에서 `--risulua-mode <value>` 검증 없이 제거.
 * 플래그가 없을 때도 복사본 반환.
 */
export function stripRisuLuaMode(argv: readonly string[]): string[] {
  const idx = argv.indexOf(RISULUA_MODE_FLAG);
  if (idx < 0) return [...argv];
  const result = [...argv];
  result.splice(idx, 2);
  return result;
}
