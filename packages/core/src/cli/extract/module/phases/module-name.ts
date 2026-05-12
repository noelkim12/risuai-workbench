/**
 * 모듈 추출 산출물 이름을 결정하는 공용 헬퍼.
 * @file packages/core/src/cli/extract/module/phases/module-name.ts
 */

/**
 * resolveModuleTargetName 함수.
 * module metadata에서 산출물 base name으로 쓸 이름을 고름.
 *
 * @param module - 이름을 읽을 RisuAI module payload
 * @returns 비어 있지 않은 module 이름 또는 기본값
 */
export function resolveModuleTargetName(module: any): string {
  const name = typeof module?.name === 'string' ? module.name.trim() : '';
  return name.length > 0 ? name : 'module';
}
