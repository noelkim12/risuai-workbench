export interface LuaASTNode {
  type: string;
  loc?: {
    start: { line: number };
    end: { line: number };
  };
  range?: [number, number];
  name?: string;
  value?: unknown;
  raw?: string;
  arguments?: LuaASTNode[];
  args?: LuaASTNode[];
  base?: LuaASTNode;
  identifier?: LuaASTNode;
  index?: LuaASTNode;
  indexer?: string;
}

export const safeArray = <T>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : [];

export const lineStart = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.start ? n.loc.start.line : 0;

export const lineEnd = (n: LuaASTNode | null | undefined): number =>
  n && n.loc && n.loc.end ? n.loc.end.line : 0;

export const lineCount = (n: LuaASTNode | null | undefined): number => {
  const s = lineStart(n);
  const e = lineEnd(n);
  return s > 0 && e >= s ? e - s + 1 : 0;
};

export const nodeKey = (n: LuaASTNode | null | undefined): string =>
  n && Array.isArray(n.range)
    ? `${n.type}@${n.range[0]}:${n.range[1]}`
    : `${n && n.type}@${lineStart(n)}:${lineEnd(n)}`;

export const callArgs = (
  n: LuaASTNode | null | undefined,
): LuaASTNode[] => {
  if (n && Array.isArray(n.arguments)) return n.arguments;
  if (n && Array.isArray(n.args)) return n.args;
  return [];
};

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

export function assignName(n: LuaASTNode | null | undefined): string | null {
  return n && n.type === 'Identifier' ? (n.name ?? null) : exprName(n);
}

export function directCalleeName(
  callNode: LuaASTNode | null | undefined,
): string | null {
  const base = callNode && callNode.base;
  return base && base.type === 'Identifier' ? (base.name ?? null) : null;
}

export function sanitizeName(
  name: string | null | undefined,
  fallback: string,
): string {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[<>:"'`|!?@#$%^&*()+={}\[\],.;~\\]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

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

export function prefixOf(name: string | null | undefined): string | null {
  const head = String(name || '').split(/[.:]/)[0];
  if (!head.includes('_')) return null;
  const prefix = head.split('_')[0];
  return prefix.length >= 3 ? prefix : null;
}

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
