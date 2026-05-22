/**
 * RisuLua split planner에서 reproducible JSON 직렬화에 쓰는 helper 모음.
 * @file packages/core/src/domain/risulua-split/shared/stable-json.ts
 */

/**
 * serializeStableJson 함수.
 * value 내 모든 문자열의 경로 separator를 POSIX로 정규화하고 cwd를 `<repo-root>`로 치환한 뒤
 * two-space 들여쓰기 JSON 문자열로 직렬화함. 입력 객체는 변경하지 않음.
 *
 * @param value - 직렬화할 임의의 JSON 호환 값
 * @param options - cwd를 명시적으로 지정할 수 있는 옵션 객체
 * @returns trailing newline이 붙은 two-space 들여쓰기 JSON 문자열
 */
export function serializeStableJson(
  value: unknown,
  options?: { cwd?: string },
): string {
  const cwd = normalizeSeparators(options?.cwd ?? process.cwd());
  return `${JSON.stringify(normalizeStableValue(value, cwd), null, 2)}\n`;
}

function normalizeStableValue(value: unknown, cwd: string): unknown {
  if (typeof value === 'string') return normalizeStableString(value, cwd);
  if (Array.isArray(value)) return value.map((item) => normalizeStableValue(item, cwd));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = normalizeStableValue(nested, cwd);
    }
    return output;
  }
  return value;
}

function normalizeStableString(value: string, cwd: string): string {
  const normalized = normalizeSeparators(value);
  if (normalized === cwd) return '<repo-root>';
  if (normalized.startsWith(`${cwd}/`)) return `<repo-root>/${normalized.slice(cwd.length + 1)}`;
  return normalized;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}
