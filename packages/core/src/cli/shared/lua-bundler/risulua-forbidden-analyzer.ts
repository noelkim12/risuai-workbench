import luaparse from 'luaparse';

/**
 * RisuLua 소스 코드 파싱 기본 옵션.
 * 주석, 위치 정보, 범위, 스코프 정보를 포함하여 파싱함.
 */
export const RISULUA_PARSE_OPTIONS = {
  comments: true,
  locations: true,
  ranges: true,
  scope: true,
  luaVersion: '5.1',
  extendedIdentifiers: true,
  encodingMode: 'none',
} as const;

/**
 * RisuLua 금지 패턴 진단 코드 타입.
 * 문제 유형 식별자.
 */
export type RisuLuaForbiddenDiagnosticCode =
  | 'dynamic_require'
  | 'forbidden_runtime_load'
  | 'package_loader_mutation'
  | 'parse_error'
  | 'require_alias_or_wrapper'
  | 'require_reassigned'
  | 'require_shadowed';

/**
 * 소스 코드 내 문제 발생 위치 인터페이스.
 * 줄 번호 및 열 번호 포함.
 */
export interface RisuLuaSourceLocation {
  /** 문제 발생 줄 번호 (1부터 시작) */
  line: number;
  /** 문제 발생 열 번호 (0부터 시작) */
  column: number;
}

/**
 * 금지 패턴 분석 결과 진단 정보 인터페이스.
 * 문제 유형 및 발생 위치 정보 포함.
 */
export interface RisuLuaForbiddenDiagnostic {
  /** 진단 코드 - 문제 유형 식별자 */
  code: RisuLuaForbiddenDiagnosticCode;
  /** 사람이 읽을 수 있는 문제 설명 메시지 */
  message: string;
  /** 관련 모듈 ID (선택적) */
  moduleId?: string;
  /** 문제 발생 파일 경로 */
  filePath: string;
  /** 소스 코드 내 위치 정보 */
  location?: RisuLuaSourceLocation;
  /** 관련 심볼 이름 (예: 'require') */
  symbol?: string;
}

/**
 * 금지 패턴 분석 함수 옵션 인터페이스.
 * 분석 대상 소스 코드 및 파일 정보 포함.
 */
export interface AnalyzeRisuLuaForbiddenPatternsOptions {
  /** 분석 대상 Lua 소스 코드 문자열 */
  source: string;
  /** 소스 코드 파일 경로 */
  filePath: string;
  /** 모듈 식별자 (선택적) */
  moduleId?: string;
}

/**
 * Lua AST(추상 구문 트리) 노드 인터페이스.
 * luaparse 라이브러리 생성 노드 타입 지원.
 */
export interface LuaAstNode {
  /** 노드 타입 (예: 'CallExpression', 'Identifier') */
  type?: string;
  /** 식별자 노드 이름 */
  name?: string;
  /** 리터럴 값 */
  value?: unknown;
  /** 원시 문자열 표현 */
  raw?: string;
  /** 소스 코드 내 범위 [시작, 끝] */
  range?: [number, number];
  /** 로컬 변수 여부 */
  isLocal?: boolean;
  /** 소스 코드 내 위치 정보 */
  loc?: {
    start?: { line?: number; column?: number };
  };
  /** 블록 본문 노드 배열 */
  body?: LuaAstNode[];
  /** 변수 선언 노드 배열 */
  variables?: LuaAstNode[];
  /** 초기화 표현식 배열 */
  init?: LuaAstNode[];
  /** 함수 호출 인자 배열 */
  arguments?: LuaAstNode[];
  /** 멤버 표현식 기본 객체 */
  base?: LuaAstNode;
  /** 표현식 노드 */
  expression?: LuaAstNode;
  /** 인덱스 표현식 식별자 */
  identifier?: LuaAstNode;
  /** 인덱스 값 */
  index?: LuaAstNode;
  /** 기타 동적 속성 */
  [key: string]: unknown;
}

/** package 로더 관련 필드 이름 집합 (path, cpath, searchers, loaders) */
const PACKAGE_LOADER_FIELDS = new Set(['path', 'cpath', 'searchers', 'loaders']);
/** 런타임 동적 파일 로드 금지 함수 집합 (dofile, loadfile) */
const FORBIDDEN_RUNTIME_LOADERS = new Set(['dofile', 'loadfile']);
/** AST 메타데이터 키 집합 - 순회 시 제외 키 */
const AST_METADATA_KEYS = new Set(['loc', 'range', 'raw', 'comments', 'globals']);

/**
 * RisuLua 소스 코드 금지 패턴 분석 함수.
 * 동적 require, 금지된 런타임 로더, package 로더 변경 등 감지.
 *
 * @param options - 분석 대상 소스 코드 및 파일 정보
 * @returns 발견된 금지 패턴 진단 정보 배열
 */
export function analyzeRisuLuaForbiddenPatterns(
  options: AnalyzeRisuLuaForbiddenPatternsOptions,
): RisuLuaForbiddenDiagnostic[] {
  const { source, filePath, moduleId } = options;
  let ast: LuaAstNode;
  try {
    ast = parseRisuLuaSource(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [diagnostic({
      code: 'parse_error',
      moduleId,
      filePath,
      message: `Failed to parse RisuLua modular source at ${filePath}: ${message}`,
    })];
  }

  const diagnostics: RisuLuaForbiddenDiagnostic[] = [];
  walkLuaAst(ast, (node, parent) => {
    if (node.type === 'LocalStatement') {
      reportRequireLocalShadowing(diagnostics, filePath, moduleId, node);
    }

    if (node.type === 'AssignmentStatement') {
      reportAssignmentForbiddenPatterns(diagnostics, filePath, moduleId, node);
    }

    if (node.type === 'CallExpression') {
      reportCallForbiddenPatterns(diagnostics, filePath, moduleId, node);
    }

    if (isIdentifierNamed(node, 'require') && isAmbiguousRequireReference(node, parent)) {
      diagnostics.push(diagnostic({
        code: 'require_alias_or_wrapper',
        moduleId,
        filePath,
        location: getLocation(node) ?? undefined,
        symbol: 'require',
        message: `RisuLua modular source must not alias or wrap require because build-time extraction would be ambiguous: ${filePath}`,
      }));
    }
  });

  return diagnostics;
}

/**
 * Lua 소스 코드 문자열 파싱 함수. AST 반환.
 * RISULUA_PARSE_OPTIONS 옵션 사용.
 *
 * @param source - 파싱 대상 Lua 소스 코드 문자열
 * @returns 파싱된 AST 노드
 */
export function parseRisuLuaSource(source: string): LuaAstNode {
  return luaparse.parse(source, RISULUA_PARSE_OPTIONS) as unknown as LuaAstNode;
}

/**
 * Lua AST 깊이 우선 순회 함수.
 * 모든 자식 노드를 재귀적으로 방문하며 콜백 함수 호출.
 *
 * @param node - 순회 시작 노드
 * @param visit - 노드 방문 시 호출할 콜백 함수
 * @param parent - 현재 노드의 부모 노드 (재귀 호출용)
 */
export function walkLuaAst(
  node: unknown,
  visit: (node: LuaAstNode, parent: LuaAstNode | null) => void,
  parent: LuaAstNode | null = null,
): void {
  if (!isLuaAstNode(node)) return;
  visit(node, parent);

  for (const [key, value] of Object.entries(node)) {
    if (AST_METADATA_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) walkLuaAst(item, visit, node);
      continue;
    }
    walkLuaAst(value, visit, node);
  }
}

/**
 * Lua AST 노드 타입 가드 함수.
 * 객체이며 type 속성이 문자열인지 검증.
 *
 * @param value - 검사 대상 값
 * @returns Lua AST 노드 여부
 */
export function isLuaAstNode(value: unknown): value is LuaAstNode {
  return Boolean(value) && typeof value === 'object' && typeof (value as LuaAstNode).type === 'string';
}

/**
 * 특정 이름의 식별자 노드 확인 함수.
 * Identifier 타입 및 이름 일치 여부 검증.
 *
 * @param node - 검사 대상 노드
 * @param name - 비교할 식별자 이름
 * @returns 이름 일치 Identifier 노드 여부
 */
export function isIdentifierNamed(node: LuaAstNode | undefined, name: string): boolean {
  return node?.type === 'Identifier' && node.name === name;
}

/**
 * 노드 소스 코드 위치 정보 추출 함수.
 * line 및 column 정보 유효 시 위치 객체 반환.
 *
 * @param node - 위치 정보 추출 대상 노드
 * @returns 유효한 위치 정보 객체 또는 null
 */
export function getLocation(node: LuaAstNode | undefined): RisuLuaSourceLocation | null {
  const start = node?.loc?.start;
  if (typeof start?.line !== 'number' || typeof start.column !== 'number') return null;
  return { line: start.line, column: start.column };
}

/**
 * 로컬 변수 require 섀도잉(shadowing) 패턴 감지 및 진단 정보 추가 함수.
 * LocalStatement 노드 검사하여 require 이름의 변수 존재 여부 확인.
 */
function reportRequireLocalShadowing(
  diagnostics: RisuLuaForbiddenDiagnostic[],
  filePath: string,
  moduleId: string | undefined,
  node: LuaAstNode,
): void {
  const variables = Array.isArray(node.variables) ? node.variables : [];
  for (const variable of variables) {
    if (!isIdentifierNamed(variable, 'require')) continue;
    diagnostics.push(diagnostic({
      code: 'require_shadowed',
      moduleId,
      filePath,
      location: getLocation(variable) ?? undefined,
      symbol: 'require',
      message: `RisuLua modular source must not shadow require: ${filePath}`,
    }));
  }
}

/**
 * 대입문 금지 패턴 감지 및 진단 정보 추가 함수.
 * require 재할당 및 package 로더 필드 변경 검사.
 */
function reportAssignmentForbiddenPatterns(
  diagnostics: RisuLuaForbiddenDiagnostic[],
  filePath: string,
  moduleId: string | undefined,
  node: LuaAstNode,
): void {
  const variables = Array.isArray(node.variables) ? node.variables : [];
  for (const variable of variables) {
    if (isIdentifierNamed(variable, 'require')) {
      diagnostics.push(diagnostic({
        code: 'require_reassigned',
        moduleId,
        filePath,
        location: getLocation(variable) ?? undefined,
        symbol: 'require',
        message: `RisuLua modular source must not reassign require: ${filePath}`,
      }));
    }

    const packageField = getPackageLoaderField(variable);
    if (packageField) {
      diagnostics.push(diagnostic({
        code: 'package_loader_mutation',
        moduleId,
        filePath,
        location: getLocation(variable) ?? undefined,
        symbol: `package.${packageField}`,
        message: `RisuLua modular source must not mutate package.${packageField}: ${filePath}`,
      }));
    }
  }
}

/**
 * 함수 호출 표현식 금지 패턴 감지 및 진단 정보 추가 함수.
 * 동적 require 및 금지된 런타임 로더 호출 검사.
 */
function reportCallForbiddenPatterns(
  diagnostics: RisuLuaForbiddenDiagnostic[],
  filePath: string,
  moduleId: string | undefined,
  node: LuaAstNode,
): void {
  if (isIdentifierNamed(node.base, 'require')) {
    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const staticModuleId = args.length === 1 ? getStringLiteralText(args[0]) : null;
    if (!staticModuleId) {
      diagnostics.push(diagnostic({
        code: 'dynamic_require',
        moduleId,
        filePath,
        location: getLocation(node) ?? undefined,
        symbol: 'require',
        message: `Dynamic require is not supported in RisuLua modular source: ${filePath}`,
      }));
    }
  }

  if (node.base?.type === 'Identifier' && typeof node.base.name === 'string' && FORBIDDEN_RUNTIME_LOADERS.has(node.base.name)) {
    diagnostics.push(diagnostic({
      code: 'forbidden_runtime_load',
      moduleId,
      filePath,
      location: getLocation(node) ?? undefined,
      symbol: node.base.name,
      message: `RisuLua modular source must not call ${node.base.name}: ${filePath}`,
    }));
  }
}

/**
 * require 식별자 참조 모호성(aliasing/wrapping) 확인 함수.
 * 부모 노드 컨텍스트 검사하여 정상 사용 여부 판단.
 */
function isAmbiguousRequireReference(node: LuaAstNode, parent: LuaAstNode | null): boolean {
  if (!parent) return true;
  if (parent.type === 'CallExpression' && parent.base === node) return false;
  if (parent.type === 'LocalStatement' && Array.isArray(parent.variables) && parent.variables.includes(node)) return false;
  if (parent.type === 'AssignmentStatement' && Array.isArray(parent.variables) && parent.variables.includes(node)) return false;
  return true;
}

/**
 * package 로더 관련 필드 접근 확인 및 필드 이름 반환 함수.
 * MemberExpression 및 IndexExpression 검사하여 package.path, package.cpath 등 감지.
 */
function getPackageLoaderField(node: LuaAstNode | undefined): string | null {
  if (!node) return null;
  if (node.type === 'MemberExpression' && isIdentifierNamed(node.base, 'package')) {
    const field = node.identifier?.name;
    return typeof field === 'string' && PACKAGE_LOADER_FIELDS.has(field) ? field : null;
  }
  if (node.type === 'IndexExpression') {
    const directField = getPackageLoaderField(node.base);
    if (directField) return directField;
    if (isIdentifierNamed(node.base, 'package')) {
      const field = getStringLiteralText(node.index);
      return field && PACKAGE_LOADER_FIELDS.has(field) ? field : null;
    }
  }
  return null;
}

/**
 * 문자열 리터럴 노드에서 실제 문자열 값 추출 함수.
 * StringLiteral 타입의 value 또는 raw 값 파싱.
 *
 * @param node - 문자열 값 추출 대상 노드
 * @returns 추출된 문자열 값 또는 null
 */
export function getStringLiteralText(node: LuaAstNode | undefined): string | null {
  if (node?.type !== 'StringLiteral') return null;
  if (typeof node.value === 'string') return node.value;
  return parseSimpleStringLiteralRaw(node.raw);
}

/**
 * 문자열 리터럴 원시 표현에서 이스케이프 시퀀스 처리 및 실제 문자열 변환 함수.
 * \n, \t 등의 이스케이프 문자를 실제 문자로 변환.
 */
function parseSimpleStringLiteralRaw(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length < 2) return null;
  const quote = raw[0];
  if ((quote !== '"' && quote !== "'") || raw[raw.length - 1] !== quote) return null;

  const body = raw.slice(1, -1);
  if (!body.includes('\\')) return body;

  return body.replace(/\\([\\'"abfnrtv])/g, (_match, escaped: string) => {
    switch (escaped) {
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'v': return '\v';
      default: return escaped;
    }
  });
}

/**
 * 진단 정보 객체 생성 헬퍼 함수.
 * 입력 파라미터를 그대로 반환하는 단순 래퍼.
 */
function diagnostic(params: RisuLuaForbiddenDiagnostic): RisuLuaForbiddenDiagnostic {
  return params;
}
