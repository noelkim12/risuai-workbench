/**
 * Lua 분석에서 공통으로 쓰는 AST 보조 타입과 유틸리티 모음.
 * @file packages/core/src/domain/analyze/lua-helpers.ts
 */

/**
 * Lua AST 노드를 정의하는 인터페이스.
 */
export interface LuaASTNode {
  /** 노드 타입 (Identifier, FunctionDeclaration 등) */
  type: string;
  /** 노드 위치 정보 (행 번호 등) */
  loc?: {
    start: { line: number };
    end: { line: number };
  };
  /** 바이트 범위 [start, end] */
  range?: [number, number];
  /** 노드 이름 (Identifier 등에서 사용) */
  name?: string;
  /** 노드 값 (Literal 등에서 사용) */
  value?: unknown;
  /** 노드 원본 텍스트 */
  raw?: string;
  /** 함수 호출 등의 인자 목록 */
  arguments?: LuaASTNode[];
  /** 함수 정의 등의 파라미터 목록 */
  args?: LuaASTNode[];
  /** 멤버/인덱스 표현식의 베이스 노드 */
  base?: LuaASTNode;
  /** 멤버 표현식의 식별자 */
  identifier?: LuaASTNode;
  /** 인덱스 표현식의 인덱스 노드 */
  index?: LuaASTNode;
  /** 멤버 접근 연산자 ('.' 또는 ':') */
  indexer?: string;
}

/**
 * safeArray 함수.
 * 입력값이 배열이면 그대로 타입 배열로 돌려주고, 배열이 아니면 빈 배열을 돌려줌.
 *
 * @param v - 배열 여부를 확인할 값
 * @returns 배열로 확인된 값 또는 빈 배열
 */
export const safeArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * lineStart 함수.
 * Lua AST 노드의 시작 행 번호를 추출함.
 *
 * @param n - 시작 위치를 읽을 Lua AST 노드
 * @returns 시작 행 번호, 위치 정보가 없으면 0
 */
export const lineStart = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.start ? n.loc.start.line : 0;

/**
 * lineEnd 함수.
 * Lua AST 노드의 종료 행 번호를 추출함.
 *
 * @param n - 종료 위치를 읽을 Lua AST 노드
 * @returns 종료 행 번호, 위치 정보가 없으면 0
 */
export const lineEnd = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.end ? n.loc.end.line : 0;

/**
 * lineCount 함수.
 * Lua AST 노드가 차지하는 전체 행 수를 계산함.
 *
 * @param n - 행 수를 계산할 Lua AST 노드
 * @returns 유효한 위치 범위의 행 수, 계산할 수 없으면 0
 */
export const lineCount = (n: LuaASTNode | null | undefined): number => {
  const s = lineStart(n);
  const e = lineEnd(n);
  return s > 0 && e >= s ? e - s + 1 : 0;
};

/**
 * nodeKey 함수.
 * 노드 타입과 위치 정보를 조합해 분석용 고유 키를 생성함.
 *
 * @param n - 키를 만들 Lua AST 노드
 * @returns 노드 타입과 범위 또는 행 위치를 담은 키 문자열
 */
export const nodeKey = (n: LuaASTNode | null | undefined): string =>
  n && Array.isArray(n.range)
    ? `${n.type}@${n.range[0]}:${n.range[1]}`
    : `${n && n.type}@${lineStart(n)}:${lineEnd(n)}`;

/**
 * callArgs 함수.
 * 함수 호출 노드에서 파서별 인자 필드 차이를 흡수해 인자 목록을 추출함.
 *
 * @param n - 인자 목록을 읽을 Lua AST 노드
 * @returns 호출 인자 노드 목록, 없으면 빈 배열
 */
export const callArgs = (n: LuaASTNode | null | undefined): LuaASTNode[] => {
  if (n && Array.isArray(n.arguments)) return n.arguments;
  if (n && Array.isArray(n.args)) return n.args;
  return [];
};

/**
 * strLit 함수.
 * 리터럴 노드에서 정적 문자열 값을 추출함.
 *
 * @param n - 문자열 리터럴 여부를 확인할 Lua AST 노드
 * @returns 추출된 문자열 값, 문자열 리터럴이 아니면 null
 */
export const strLit = (n: LuaASTNode | null | undefined): string | null => {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'StringLiteral') {
    if (typeof n.value === 'string') return n.value;
    if (typeof n.raw === 'string') {
      const match = n.raw.match(/^['"](.*)['"]$/s);
      return match ? match[1] : n.raw;
    }
    return null;
  }
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  return null;
};

/**
 * exprName 함수.
 * 식별자, 멤버 접근, 인덱스 표현식에서 사람이 읽을 수 있는 이름을 재귀적으로 추출함.
 *
 * @param n - 이름을 추출할 Lua 표현식 노드
 * @returns 추출된 표현식 이름, 이름을 만들 수 없으면 null
 */
export function exprName(n: LuaASTNode | null | undefined): string | null {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'Identifier') return n.name || null;
  if (n.type === 'MemberExpression') {
    const base = exprName(n.base);
    const identifier = exprName(n.identifier);
    return base && identifier
      ? `${base}${n.indexer === ':' ? ':' : '.'}${identifier}`
      : identifier || base;
  }
  if (n.type === 'IndexExpression') {
    const base = exprName(n.base) || '';
    const index = exprName(n.index) || strLit(n.index) || '?';
    return `${base}[${index}]`;
  }
  return null;
}

/**
 * assignName 함수.
 * 할당 대상 노드에서 직접 식별자 또는 표현식 이름을 추출함.
 *
 * @param n - 할당 대상 Lua AST 노드
 * @returns 할당 대상 이름, 이름을 만들 수 없으면 null
 */
export function assignName(n: LuaASTNode | null | undefined): string | null {
  return n && n.type === 'Identifier' ? (n.name ?? null) : exprName(n);
}

/**
 * directCalleeName 함수.
 * 함수 호출 노드에서 직접 호출된 식별자 이름만 추출함.
 *
 * @param callNode - 호출 대상 식별자를 확인할 함수 호출 노드
 * @returns 직접 호출된 식별자 이름, 식별자 호출이 아니면 null
 */
export function directCalleeName(callNode: LuaASTNode | null | undefined): string | null {
  const base = callNode && callNode.base;
  return base && base.type === 'Identifier' ? (base.name ?? null) : null;
}

/**
 * sanitizeName 함수.
 * 임의 문자열을 안전한 소문자 식별자 형태로 정리함.
 *
 * @param name - 정리할 원본 이름
 * @param fallback - 정리 결과가 비어 있을 때 사용할 대체 이름
 * @returns 안전하게 정리된 이름 또는 대체 이름
 */
export function sanitizeName(name: string | null | undefined, fallback: string): string {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[<>:"'`|!?@#$%^&*()+={}\[\],.;~\\]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

/**
 * toModuleName 함수.
 * 문자열을 스네이크 케이스 기반의 Lua 모듈 이름으로 변환함.
 *
 * @param name - 모듈 이름으로 변환할 원본 문자열
 * @returns 정규화된 모듈 이름, 만들 수 없으면 module
 */
export function toModuleName(name: string | null | undefined): string {
  return (
    String(name || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'module'
  );
}

/**
 * prefixOf 함수.
 * 식별자 이름에서 네임스페이스처럼 쓰이는 접두사를 추출함.
 *
 * @param name - 접두사를 찾을 식별자 이름
 * @returns 유효한 접두사, 없으면 null
 */
export function prefixOf(name: string | null | undefined): string | null {
  const head = String(name || '').split(/[.:]/)[0];
  if (!head.includes('_')) return null;
  const prefix = head.split('_')[0];
  return prefix.length >= 3 ? prefix : null;
}

/**
 * createMaxBlankRun 함수.
 * 지정한 행 범위 안의 최대 연속 공백 라인 수를 계산하는 함수를 생성함.
 *
 * @param lines - 원본 소스를 행 단위로 나눈 배열
 * @param total - 계산 대상으로 볼 전체 행 수
 * @returns 시작 행과 종료 행을 받아 최대 연속 공백 라인 수를 돌려주는 함수
 */
export function createMaxBlankRun(
  lines: string[],
  total: number,
): (fromLine: number, toLine: number) => number {
  return (fromLine: number, toLine: number): number => {
    let run = 0;
    let max = 0;
    for (let i = Math.max(1, fromLine); i <= Math.min(total, toLine); i += 1) {
      if ((lines[i - 1] || '').trim() === '') {
        run += 1;
        if (run > max) max = run;
      } else {
        run = 0;
      }
    }
    return max;
  };
}

/**
 * inferLuaFunctionName 함수.
 * Lua 소스에서 최상위 함수명을 추론해 triggerscript 추출 파일명 결정에 사용함.
 *
 * @param code - 함수명을 추론할 Lua 소스 코드
 * @returns 추론한 함수명, 찾지 못하면 null
 */
export function inferLuaFunctionName(code: string): string | null {
  if (!code) return null;
  const patterns = [
    /\blocal\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    /\bfunction\s+([A-Za-z_][A-Za-z0-9_.:]*)\s*\(/,
    /\b([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*function\s*\(/,
  ];
  for (const regex of patterns) {
    const match = code.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}
