/**
 * RisuLua split planner의 source path 정규화 helper 모음.
 * @file packages/core/src/domain/risulua-split/shared/source-path.ts
 */

/**
 * normalizeSourcePath 함수.
 * OS별 separator 차이가 planner metadata에 새지 않도록 POSIX 형태로 정규화함.
 *
 * @param sourcePath - 사용자가 입력하거나 CLI에서 전달한 source file path
 * @returns backslash가 slash로 바뀐 source path
 */
export function normalizeSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, '/');
}

/**
 * inferTargetName 함수.
 * source path에서 기본 dist target 이름을 추론함.
 *
 * @param sourcePath - target 이름 추론에 사용할 source file path
 * @returns 확장자 `.risulua`를 제거한 target 이름, 비어 있으면 `main`
 */
export function inferTargetName(sourcePath: string): string {
  const fileName = normalizeSourcePath(sourcePath).split('/').pop() ?? 'main.risulua';
  return fileName.replace(/\.risulua$/i, '') || 'main';
}
