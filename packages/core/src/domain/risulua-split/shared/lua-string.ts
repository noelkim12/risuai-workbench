/**
 * RisuLua split 도메인의 짧은 Lua string literal 해석 helper 모음.
 * @file packages/core/src/domain/risulua-split/shared/lua-string.ts
 */

const SIMPLE_LUA_STRING_PATTERN = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
const SIMPLE_LUA_ESCAPE_PATTERN = /\\([\\'"abfnrtv])/g;

/**
 * parseSimpleLuaString 함수.
 * Lua single/double quote short string literal이면 본문을 단순 escape 기준으로 해석함.
 * Long bracket string과 numeric escape는 이 helper의 범위 밖으로 둠.
 *
 * @param raw - require 인자나 package.preload key에서 얻은 원문 표현식
 * @returns 해석된 문자열 또는 short quoted string이 아닐 때 null
 */
export function parseSimpleLuaString(raw: string): string | null {
  const match = SIMPLE_LUA_STRING_PATTERN.exec(raw.trim());
  const value = match?.[2];
  return value === undefined ? null : unescapeSimpleLuaString(value);
}

/**
 * unescapeSimpleLuaString 함수.
 * Lua short string 본문에서 공통 단순 escape만 실제 문자로 변환함.
 *
 * @param value - quote를 제거한 Lua string literal 본문
 * @returns 단순 escape가 반영된 문자열
 */
export function unescapeSimpleLuaString(value: string): string {
  return value.replace(SIMPLE_LUA_ESCAPE_PATTERN, (_match: string, escaped: string) => {
    switch (escaped) {
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'v': return '\v';
      default: return escaped;
    }
  });
}
