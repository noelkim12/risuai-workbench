/**
 * Oversized Lua document guard shared by indexing and runtime providers.
 * @file packages/cbs-lsp/src/utils/oversized-lua.ts
 */

export const MAX_LUA_ANALYSIS_TEXT_LENGTH = 512 * 1024;

/**
 * isLuaArtifactPath 함수.
 * 파일 경로가 runtime Lua artifact인지 확장자로 판별함.
 *
 * @param filePath - 검사할 host 문서 경로
 * @returns `.risulua` 문서면 true
 */
export function isLuaArtifactPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.risulua');
}

/**
 * shouldSkipOversizedLuaText 함수.
 * 대형 `.risulua` 문서를 full CBS 분석 경로에서 제외할지 판단함.
 *
 * @param filePath - 검사할 host 문서 경로
 * @param textLength - 현재 문서 텍스트 길이
 * @returns Lua artifact가 threshold를 넘으면 true
 */
export function shouldSkipOversizedLuaText(filePath: string, textLength: number): boolean {
  return isLuaArtifactPath(filePath) && textLength > MAX_LUA_ANALYSIS_TEXT_LENGTH;
}
