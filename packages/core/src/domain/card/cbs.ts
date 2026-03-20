/**
 * CBS(Character Bot Scripting) 변수 연산(읽기/쓰기)을 정의하는 인터페이스에요.
 */
export interface CBSVarOps {
  /** 읽기(getvar) 연산이 발생한 변수 이름 집합 */
  reads: Set<string>;
  /** 쓰기(setvar, addvar) 연산이 발생한 변수 이름 집합 */
  writes: Set<string>;
}

/**
 * 텍스트에서 CBS 변수 조작 연산({{getvar::...}}, {{setvar::...}}, {{addvar::...}})을 추출해요.
 *
 * @param text - 분석할 CBS 텍스트
 * @returns 추출된 변수 읽기/쓰기 연산 정보
 * @example
 * extractCBSVarOps('{{getvar::hp}} {{setvar::mp::10}}')
 * // returns { reads: Set(['hp']), writes: Set(['mp']) }
 */
export function extractCBSVarOps(text: string): CBSVarOps {
  const reads = new Set<string>();
  const writes = new Set<string>();
  if (typeof text !== 'string' || text.length === 0) return { reads, writes };

  for (const match of text.matchAll(/\{\{(getvar|setvar|addvar)::([^}:]+)/g)) {
    const op = match[1];
    const key = match[2].trim();
    if (!key) continue;
    if (op === 'getvar') reads.add(key);
    else writes.add(key);
  }

  return { reads, writes };
}
