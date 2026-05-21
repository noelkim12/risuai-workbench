/**
 * Mutation mode types and defaults for shared safety gates.
 * @file packages/risuai-workbench-mcp/src/mutation/mode.ts
 */

export type MutationMode = 'enabled' | 'generated-only' | 'preview-only';

export const DEFAULT_MUTATION_MODE: MutationMode = 'preview-only';

/**
 * isMutationMode 함수.
 * CLI 문자열을 서버 mutation mode union으로 좁힘.
 *
 * @param value - 사용자가 입력한 mutation mode 후보
 * @returns 지원하는 mutation mode 여부
 */
export function isMutationMode(value: string): value is MutationMode {
  return value === 'preview-only' || value === 'generated-only' || value === 'enabled';
}
