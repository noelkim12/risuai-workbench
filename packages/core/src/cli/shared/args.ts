/**
 * CLI argv 배열에서 flag와 값을 다루는 작은 공통 유틸.
 * @file packages/core/src/cli/shared/args.ts
 */

/**
 * argValue 함수.
 * argv에서 지정한 flag 바로 뒤 값을 읽음.
 *
 * @param argv - workflow에 전달된 CLI argv 배열
 * @param name - 값을 읽을 flag 이름
 * @returns flag 다음 값 또는 값이 없을 때 null
 */
export function argValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] || null;
}

/**
 * hasFlag 함수.
 * argv에 지정한 boolean flag가 포함되어 있는지 확인함.
 *
 * @param argv - workflow에 전달된 CLI argv 배열
 * @param name - 존재 여부를 확인할 flag 이름
 * @returns flag가 하나 이상 있으면 true
 */
export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

/**
 * argValues 함수.
 * argv에서 반복 가능한 flag의 모든 직접 값을 수집함.
 *
 * @param argv - workflow에 전달된 CLI argv 배열
 * @param name - 값을 수집할 flag 이름
 * @returns flag 다음 값 목록
 */
export function argValues(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (value) values.push(value);
  }
  return values;
}

/**
 * stripArg 함수.
 * argv에서 지정한 flag와 바로 뒤 값을 한 쌍으로 제거함.
 *
 * @param argv - workflow에 전달된 CLI argv 배열
 * @param name - 제거할 flag 이름
 * @returns flag/value 쌍이 제거된 새 argv 배열
 */
export function stripArg(argv: readonly string[], name: string): string[] {
  const index = argv.indexOf(name);
  if (index < 0) return [...argv];
  const result = [...argv];
  result.splice(index, 2);
  return result;
}
