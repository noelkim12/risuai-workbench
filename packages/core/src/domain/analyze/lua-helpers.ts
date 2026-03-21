/**
 * Lua AST 노드를 정의하는 인터페이스
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

/** 배열이 아닐 경우 빈 배열을 반환하는 안전한 캐스팅 함수 */
export const safeArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 노드의 시작 행 번호를 추출 */
export const lineStart = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.start ? n.loc.start.line : 0;

/** 노드의 종료 행 번호를 추출 */
export const lineEnd = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.end ? n.loc.end.line : 0;

/** 노드가 차지하는 총 행 수를 계산 */
export const lineCount = (n: LuaASTNode | null | undefined): number => {
  const s = lineStart(n);
  const e = lineEnd(n);
  return s > 0 && e >= s ? e - s + 1 : 0;
};

/** 노드의 고유 키(타입과 위치 정보 조합)를 생성 */
export const nodeKey = (n: LuaASTNode | null | undefined): string =>
  n && Array.isArray(n.range)
    ? `${n.type}@${n.range[0]}:${n.range[1]}`
    : `${n && n.type}@${lineStart(n)}:${lineEnd(n)}`;

/** 함수 호출 노드에서 인자 목록을 추출 */
export const callArgs = (n: LuaASTNode | null | undefined): LuaASTNode[] => {
  if (n && Array.isArray(n.arguments)) return n.arguments;
  if (n && Array.isArray(n.args)) return n.args;
  return [];
};

/** 리터럴 노드에서 문자열 값을 추출 */
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

/** 표현식 노드(식별자, 멤버 접근 등)의 전체 이름을 재귀적으로 추출 */
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

/** 할당 대상 노드에서 이름을 추출 */
export function assignName(n: LuaASTNode | null | undefined): string | null {
  return n && n.type === 'Identifier' ? (n.name ?? null) : exprName(n);
}

/** 함수 호출 노드에서 호출 대상의 직접적인 이름을 추출 */
export function directCalleeName(callNode: LuaASTNode | null | undefined): string | null {
  const base = callNode && callNode.base;
  return base && base.type === 'Identifier' ? (base.name ?? null) : null;
}

/** 문자열에서 특수 문자를 제거하여 안전한 식별자 이름으로 변환 */
export function sanitizeName(name: string | null | undefined, fallback: string): string {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[<>:"'`|!?@#$%^&*()+={}\[\],.;~\\]/g, '_') // eslint-disable-line no-useless-escape
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

/** 문자열을 스네이크 케이스 기반의 모듈 이름 형식으로 변환 */
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

/** 식별자 이름에서 접두사(네임스페이스 등)를 추출 */
export function prefixOf(name: string | null | undefined): string | null {
  const head = String(name || '').split(/[.:]/)[0];
  if (!head.includes('_')) return null;
  const prefix = head.split('_')[0];
  return prefix.length >= 3 ? prefix : null;
}

/** 특정 범위 내의 최대 연속 공백 라인 수를 계산하는 함수를 생성 */
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
 * Lua 소스에서 최상위 함수명을 추론한다.
 * triggerscript에서 추출한 Lua 코드의 파일명을 결정할 때 사용한다.
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
