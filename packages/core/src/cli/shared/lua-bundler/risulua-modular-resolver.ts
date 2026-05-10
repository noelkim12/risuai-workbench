import fs from 'node:fs';
import path from 'node:path';

import {
  type LuaAstNode,
  type RisuLuaForbiddenDiagnostic,
  type RisuLuaForbiddenDiagnosticCode,
  type RisuLuaSourceLocation,
  analyzeRisuLuaForbiddenPatterns,
  getLocation,
  getStringLiteralText,
  isIdentifierNamed,
  parseRisuLuaSource,
  walkLuaAst,
} from './risulua-forbidden-analyzer';
import type { RisuLuaBundleTarget } from './risulua-target';

/**
 * RisuLua 모듈 파일 확장자.
 * `.risulua` 확장자를 가진 파일을 모듈로 인식함.
 */
export const RISULUA_MODULE_EXTENSION = '.risulua';

/**
 * 모듈러 번들링 진입점(Entry) 모듈 ID.
 * `main` 모듈이 자동으로 진입점으로 설정됨.
 */
export const RISULUA_MODULAR_ENTRY_ID = 'main';

/**
 * 리졸버에서 발생할 수 있는 에러 코드 타입 정의.
 * 순환 의존성, 잘못된 모듈 ID, 누락된 모듈 등 다양한 상황을 표현함.
 */
export type RisuLuaResolverErrorCode =
  | 'cycle'
  | 'invalid_module_id'
  | 'missing_module'
  | 'root_escape'
  | 'self_require'
  | RisuLuaForbiddenDiagnosticCode;

/**
 * 리졸버가 발견한 문제점에 대한 상세 진단 정보.
 * 문제가 발생한 모듈 및 구체적인 오류 내용을 포함함.
 */
export interface RisuLuaResolverDiagnostic {
  code: RisuLuaResolverErrorCode;
  message: string;
  moduleId: string;
  filePath: string;
  location?: RisuLuaSourceLocation;
  requireId?: string;
  cyclePath?: string[];
}

/**
 * 모듈 간 의존성을 나타내는 엣지(Edge) 정보.
 * 의존성의 출발 모듈과 도착 모듈, require ID 및 위치 정보를 포함함.
 */
export interface RisuLuaRequireEdge {
  from: string;
  to: string;
  requireId: string;
  fromPath: string;
  toPath: string;
  location: RisuLuaSourceLocation | null;
}

/**
 * 소스 코드 내 특정 범위를 나타내는 위치 정보.
 * 시작 인덱스와 끝 인덱스로 구성됨.
 */
export interface RisuLuaSourceRange {
  start: number;
  end: number;
}

/**
 * `require()` 호출에 대한 정적 참조 정보.
 * 모듈 간 정적 require 관계 및 위치 정보를 추적함.
 */
export interface RisuLuaStaticRequireReference {
  moduleId: string;
  filePath: string;
  requireId: string;
  toPath: string;
  location: RisuLuaSourceLocation | null;
  requireIdRange: RisuLuaSourceRange | null;
}

/**
 * 소스 디렉토리 내 RisuLua 모듈 파일 정보.
 * 모듈 ID와 실제 파일 경로의 매핑을 포함함.
 */
export interface RisuLuaSourceModuleFile {
  id: string;
  filePath: string;
}

/**
 * 모듈 그래프 수집 과정에서 발견된 진단 정보.
 * 순환 의존성 및 누락된 모듈 등의 문제를 표현함.
 */
export interface RisuLuaGraphDiagnostic {
  code: 'cycle' | 'missing_module';
  message: string;
  moduleId: string;
  filePath: string;
  requireId?: string;
  requireIdRange?: RisuLuaSourceRange | null;
  cyclePath?: string[];
}

/**
 * 모듈 그래프 진단 수집 옵션.
 * 소스 루트, 파일 경로, 소스 내용을 지정함.
 */
export interface CollectRisuLuaModuleGraphDiagnosticsOptions {
  sourceRoot: string;
  filePath: string;
  source: string;
}

/**
 * 리졸빙 완료된 모듈 상세 정보.
 * 모듈 ID, 파일 경로, 상대 경로, 소스 내용, 의존성 목록을 포함함.
 */
export interface RisuLuaResolvedModule {
  id: string;
  filePath: string;
  relativePath: string;
  source: string;
  requires: RisuLuaRequireEdge[];
}

/**
 * RisuLua 모듈러 그래프 전체 구조.
 * 진입점 정보, 모든 모듈, 의존성 엣지를 포함함.
 */
export interface RisuLuaModuleGraph {
  entryId: typeof RISULUA_MODULAR_ENTRY_ID;
  entryPath: string;
  sourceRoot: string;
  modules: RisuLuaResolvedModule[];
  edges: RisuLuaRequireEdge[];
}

/**
 * 모듈러 그래프 리졸빙 옵션.
 * 번들링 타겟 정보를 전달함.
 */
export interface ResolveRisuLuaModularGraphOptions {
  target: RisuLuaBundleTarget;
}

/**
 * RisuLua 리졸버 에러 클래스.
 * 진단 정보를 포함하여 문제 해결에 필요한 상세 정보를 제공함.
 */
export class RisuLuaResolverError extends Error {
  readonly diagnostic: RisuLuaResolverDiagnostic;

  constructor(diagnostic: RisuLuaResolverDiagnostic) {
    super(diagnostic.message);
    this.name = 'RisuLuaResolverError';
    this.diagnostic = diagnostic;
  }
}

/**
 * RisuLua 모듈러 그래프 리졸빙 함수.
 * 진입점부터 시작하여 모든 모듈의 의존성을 분석하고 그래프를 구성함.
 * 순환 의존성, 잘못된 모듈 ID 등의 문제를 감지하여 에러를 발생시킴.
 */
export function resolveRisuLuaModularGraph(
  options: ResolveRisuLuaModularGraphOptions,
): RisuLuaModuleGraph {
  const { target } = options;
  if (target.mode !== 'modular') {
    throw new Error(`RisuLua modular resolver requires a modular target, got ${target.mode}`);
  }

  const sourceRoot = path.resolve(target.sourceRoot);
  const entryPath = path.resolve(target.entryPath);
  const resolved = new Map<string, RisuLuaResolvedModule>();
  const visiting: string[] = [];

  function visit(moduleId: string, filePath: string): void {
    if (resolved.has(moduleId)) return;

    const activeIndex = visiting.indexOf(moduleId);
    if (activeIndex >= 0) {
      const cyclePath = [...visiting.slice(activeIndex), moduleId];
      throw resolverError({
        code: 'cycle',
        moduleId,
        filePath,
        cyclePath,
        message: `RisuLua modular dependency cycle detected: ${cyclePath.join(' -> ')}`,
      });
    }

    visiting.push(moduleId);
    const source = readModuleSource(moduleId, filePath);
    const requires = extractRisuLuaStaticRequireReferences({ moduleId, filePath, source, sourceRoot })
      .map((reference): RisuLuaRequireEdge => ({
        from: reference.moduleId,
        to: reference.requireId,
        requireId: reference.requireId,
        fromPath: reference.filePath,
        toPath: reference.toPath,
        location: reference.location,
      }))
      .sort(compareRequireEdges);

    for (const edge of requires) {
      if (edge.to === moduleId) {
        throw resolverError({
          code: 'self_require',
          moduleId,
          filePath,
          location: edge.location ?? undefined,
          requireId: edge.requireId,
          cyclePath: [moduleId, moduleId],
          message: `RisuLua module cannot require itself: ${moduleId} -> ${moduleId}`,
        });
      }
      visit(edge.to, edge.toPath);
    }

    visiting.pop();
    resolved.set(moduleId, {
      id: moduleId,
      filePath,
      relativePath: toPosix(path.relative(target.rootDir, filePath)),
      source,
      requires,
    });
  }

  visit(RISULUA_MODULAR_ENTRY_ID, entryPath);

  const modules = [...resolved.values()].sort((left, right) => {
    if (left.id === RISULUA_MODULAR_ENTRY_ID) return 1;
    if (right.id === RISULUA_MODULAR_ENTRY_ID) return -1;
    return left.id.localeCompare(right.id);
  });
  const edges = modules.flatMap((module) => module.requires).sort(compareRequireEdges);

  return {
    entryId: RISULUA_MODULAR_ENTRY_ID,
    entryPath,
    sourceRoot,
    modules,
    edges,
  };
}

/**
 * 모듈 ID 유효성 검증 함수.
 * 알파벳/숫자/밑줄로 구성된 점으로 연결된 식별자 형식을 검증함.
 * 확장자가 포함된 ID는 허용하지 않음.
 */
export function validateRisuLuaModuleId(moduleId: string): void {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(moduleId)
    || moduleId.endsWith(RISULUA_MODULE_EXTENSION)
  ) {
    throw new Error(`Invalid RisuLua module ID: ${JSON.stringify(moduleId)}`);
  }
}

/**
 * 모듈 ID를 실제 파일 경로로 변환하는 함수.
 * 소스 루트 기준으로 모듈 ID의 각 부분을 디렉토리/파일명으로 매핑함.
 * 루트 디렉토리를 벗어나는 경로는 에러를 발생시킴.
 */
export function resolveRisuLuaModulePath(sourceRoot: string, moduleId: string): string {
  validateRisuLuaModuleId(moduleId);
  const root = path.resolve(sourceRoot);
  const candidate = path.resolve(root, ...moduleId.split('.')) + RISULUA_MODULE_EXTENSION;
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`RisuLua module ID escapes lua root: ${moduleId}`);
  }
  return candidate;
}

/**
 * 소스 파일 경로에서 모듈 ID 추출 함수.
 * 소스 루트 기준 상대 경로를 모듈 ID 형식으로 변환함.
 * 유효하지 않은 경로나 확장자가 일치하지 않으면 null을 반환함.
 */
export function moduleIdFromRisuLuaSourcePath(filePath: string, sourceRoot: string): string | null {
  const root = path.resolve(sourceRoot);
  const relative = path.relative(root, path.resolve(filePath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('dist')) {
    return null;
  }
  if (!relative.endsWith(RISULUA_MODULE_EXTENSION)) return null;
  const moduleId = relative.slice(0, -RISULUA_MODULE_EXTENSION.length).split(path.sep).join('.');
  try {
    validateRisuLuaModuleId(moduleId);
    return moduleId;
  } catch {
    return null;
  }
}

/**
 * 소스 루트 디렉토리에서 모든 RisuLua 모듈 파일 검색 함수.
 * 재귀적으로 탐색하며 `.risulua` 확장자를 가진 파일을 수집함.
 * `dist` 디렉토리는 제외함.
 */
export function listRisuLuaSourceModules(sourceRoot: string): RisuLuaSourceModuleFile[] {
  const root = path.resolve(sourceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files: RisuLuaSourceModuleFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist') continue;
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(candidate);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(RISULUA_MODULE_EXTENSION)) continue;
      const id = moduleIdFromRisuLuaSourcePath(candidate, root);
      if (id) files.push({ id, filePath: candidate });
    }
  };
  visit(root);
  return files.sort((left, right) => left.id.localeCompare(right.id) || left.filePath.localeCompare(right.filePath));
}

/**
 * 소스 루트에서 모든 모듈 ID 목록 조회 함수.
 * 진입점 모듈 포함 여부를 옵션으로 지정할 수 있음.
 */
export function listRisuLuaSourceModuleIds(sourceRoot: string, options: { includeEntry?: boolean } = {}): string[] {
  const includeEntry = options.includeEntry ?? true;
  return listRisuLuaSourceModules(sourceRoot)
    .map((file) => file.id)
    .filter((id) => includeEntry || id !== RISULUA_MODULAR_ENTRY_ID)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * 모듈 소스에서 정적 `require()` 참조 추출 함수.
 * AST를 분석하여 `require` 호출을 탐지하고 각 참조의 상세 정보를 수집함.
 * 동적 require나 금지된 패턴이 있으면 에러를 발생시킴.
 */
export function extractRisuLuaStaticRequireReferences(params: {
  moduleId: string;
  filePath: string;
  source: string;
  sourceRoot: string;
}): RisuLuaStaticRequireReference[] {
  const { moduleId, filePath, source, sourceRoot } = params;
  const forbiddenDiagnostics = analyzeRisuLuaForbiddenPatterns({ moduleId, filePath, source });
  if (forbiddenDiagnostics.length > 0) {
    throw resolverErrorFromForbiddenDiagnostic(moduleId, filePath, forbiddenDiagnostics[0]);
  }

  const ast = parseLuaModule(moduleId, filePath, source);
  const references: RisuLuaStaticRequireReference[] = [];
  walkLuaAst(ast, (node) => {
    if (node.type !== 'CallExpression' || !isIdentifierNamed(node.base, 'require')) return;

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const requireId = args.length === 1 ? getStringLiteralText(args[0]) : null;
    if (!requireId) {
      throw resolverError({
        code: 'dynamic_require',
        moduleId,
        filePath,
        location: getLocation(node) ?? undefined,
        message: `Dynamic require is not supported in RisuLua modular source: ${filePath}`,
      });
    }

    let toPath: string;
    try {
      toPath = resolveRisuLuaModulePath(sourceRoot, requireId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code: RisuLuaResolverErrorCode = message.includes('escapes') ? 'root_escape' : 'invalid_module_id';
      throw resolverError({
        code,
        moduleId,
        filePath,
        location: getLocation(args[0]) ?? undefined,
        requireId,
        message,
      });
    }

    references.push({
      moduleId,
      filePath,
      requireId,
      toPath,
      location: getLocation(node),
      requireIdRange: getStringLiteralContentRange(args[0]),
    });
  });

  return references.sort(compareStaticRequireReferences);
}

/**
 * 모듈 그래프 진단 정보 수집 함수.
 * 누락된 모듈이나 순환 의존성 등의 문제를 감지하여 목록으로 반환함.
 */
export function collectRisuLuaModuleGraphDiagnostics(
  options: CollectRisuLuaModuleGraphDiagnosticsOptions,
): RisuLuaGraphDiagnostic[] {
  const sourceRoot = path.resolve(options.sourceRoot);
  const filePath = path.resolve(options.filePath);
  const moduleId = moduleIdFromRisuLuaSourcePath(filePath, sourceRoot);
  if (!moduleId) return [];

  const currentReferences = tryExtractStaticRequireReferences({
    moduleId,
    filePath,
    source: options.source,
    sourceRoot,
  });
  const missing = currentReferences
    .filter((reference) => !fs.existsSync(reference.toPath) || !fs.statSync(reference.toPath).isFile())
    .map((reference): RisuLuaGraphDiagnostic => ({
      code: 'missing_module',
      moduleId,
      filePath,
      requireId: reference.requireId,
      requireIdRange: reference.requireIdRange,
      message: `Missing RisuLua module "${reference.requireId}": ${reference.toPath}`,
    }));

  const graph = buildExistingSourceRequireGraph(sourceRoot, filePath, options.source);
  const cycle = findCycleFrom(moduleId, graph);
  if (!cycle) return missing;

  const cycleTarget = cycle[1] ?? moduleId;
  const cycleReference = currentReferences.find((reference) => reference.requireId === cycleTarget)
    ?? currentReferences.find((reference) => cycle.includes(reference.requireId));
  return [
    ...missing,
    {
      code: 'cycle',
      moduleId,
      filePath,
      requireId: cycleReference?.requireId,
      requireIdRange: cycleReference?.requireIdRange ?? null,
      cyclePath: cycle,
      message: `RisuLua modular dependency cycle detected: ${cycle.join(' -> ')}`,
    },
  ];
}

/**
 * 모듈 파일 소스 내용 읽기 (내부 함수).
 * 파일이 존재하지 않으면 에러를 발생시킴.
 */
function readModuleSource(moduleId: string, filePath: string): string {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw resolverError({
      code: 'missing_module',
      moduleId,
      filePath,
      message: `Missing RisuLua module "${moduleId}": ${filePath}`,
    });
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Lua 모듈 소스 파싱 (내부 함수).
 * 파싱에 실패하면 에러를 발생시킴.
 */
function parseLuaModule(moduleId: string, filePath: string, source: string): LuaAstNode {
  try {
    return parseRisuLuaSource(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw resolverError({
      code: 'parse_error',
      moduleId,
      filePath,
      message: `Failed to parse RisuLua module "${moduleId}" at ${filePath}: ${message}`,
    });
  }
}

/**
 * 정적 require 참조 안전 추출 (내부 함수).
 * 에러가 발생하면 빈 배열을 반환함.
 */
function tryExtractStaticRequireReferences(params: {
  moduleId: string;
  filePath: string;
  source: string;
  sourceRoot: string;
}): RisuLuaStaticRequireReference[] {
  try {
    return extractRisuLuaStaticRequireReferences(params);
  } catch {
    return [];
  }
}

/**
 * 기존 소스 파일 require 그래프 구성 (내부 함수).
 * 현재 파일의 소스가 제공되면 디스크 대신 해당 소스를 사용함.
 */
function buildExistingSourceRequireGraph(
  sourceRoot: string,
  currentFilePath: string,
  currentSource: string,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const sourceFile of listRisuLuaSourceModules(sourceRoot)) {
    const source = path.resolve(sourceFile.filePath) === path.resolve(currentFilePath)
      ? currentSource
      : fs.readFileSync(sourceFile.filePath, 'utf-8');
    const references = tryExtractStaticRequireReferences({
      moduleId: sourceFile.id,
      filePath: sourceFile.filePath,
      source,
      sourceRoot,
    });
    graph.set(
      sourceFile.id,
      references
        .filter((reference) => fs.existsSync(reference.toPath) && fs.statSync(reference.toPath).isFile())
        .map((reference) => reference.requireId)
        .sort((left, right) => left.localeCompare(right)),
    );
  }
  return graph;
}

/**
 * 특정 모듈에서 시작하는 순환 의존성 탐지 (내부 함수).
 * DFS로 탐색하며 방문 중인 노드를 추적하여 순환을 감지함.
 */
function findCycleFrom(moduleId: string, graph: Map<string, string[]>): string[] | null {
  const visiting: string[] = [];
  const visited = new Set<string>();

  function visit(current: string): string[] | null {
    const activeIndex = visiting.indexOf(current);
    if (activeIndex >= 0) return [...visiting.slice(activeIndex), current];
    if (visited.has(current)) return null;
    visiting.push(current);
    for (const next of graph.get(current) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    visiting.pop();
    visited.add(current);
    return null;
  }

  return visit(moduleId);
}

/**
 * 문자열 리터럴 노드 내용 범위 조회 (내부 함수).
 * 따옴표를 제외한 실제 내용의 위치를 계산함.
 */
function getStringLiteralContentRange(node: LuaAstNode): RisuLuaSourceRange | null {
  if (!Array.isArray(node.range) || typeof node.range[0] !== 'number' || typeof node.range[1] !== 'number') {
    return null;
  }
  const raw = typeof node.raw === 'string' ? node.raw : '';
  const hasQuotedRaw = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  return hasQuotedRaw
    ? { start: node.range[0] + 1, end: node.range[1] - 1 }
    : { start: node.range[0], end: node.range[1] };
}

/**
 * 두 정적 require 참조 비교 (내부 함수).
 * 모듈 ID, require ID, 위치 순서로 정렬 기준을 제공함.
 */
function compareStaticRequireReferences(
  left: RisuLuaStaticRequireReference,
  right: RisuLuaStaticRequireReference,
): number {
  return left.moduleId.localeCompare(right.moduleId)
    || left.requireId.localeCompare(right.requireId)
    || (left.location?.line ?? 0) - (right.location?.line ?? 0)
    || (left.location?.column ?? 0) - (right.location?.column ?? 0);
}

/**
 * 두 require 엣지 비교 (내부 함수).
 * from, to 모듈 ID와 위치 순서로 정렬 기준을 제공함.
 */
function compareRequireEdges(left: RisuLuaRequireEdge, right: RisuLuaRequireEdge): number {
  return left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || (left.location?.line ?? 0) - (right.location?.line ?? 0)
    || (left.location?.column ?? 0) - (right.location?.column ?? 0);
}

/**
 * 리졸버 에러 객체 생성 (내부 헬퍼 함수).
 */
function resolverError(diagnostic: RisuLuaResolverDiagnostic): RisuLuaResolverError {
  return new RisuLuaResolverError(diagnostic);
}

/**
 * 금지된 패턴 진단 정보로부터 리졸버 에러 생성 (내부 헬퍼 함수).
 */
function resolverErrorFromForbiddenDiagnostic(
  moduleId: string,
  filePath: string,
  diagnostic: RisuLuaForbiddenDiagnostic,
): RisuLuaResolverError {
  const message = diagnostic.code === 'parse_error'
    ? `Failed to parse RisuLua module "${moduleId}" at ${filePath}: ${diagnostic.message}`
    : diagnostic.message;

  return resolverError({
    code: diagnostic.code,
    moduleId,
    filePath,
    location: diagnostic.location,
    message,
  });
}

/**
 * 파일 경로를 POSIX 형식(슬래시 구분자)으로 변환 (내부 헬퍼 함수).
 */
function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
