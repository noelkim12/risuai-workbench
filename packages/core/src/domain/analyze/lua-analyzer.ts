/**
 * Lua 수집 결과를 호출 그래프와 모듈, 상태 소유권 분석 결과로 확장하는 2차 분석 단계.
 * @file packages/core/src/domain/analyze/lua-analyzer.ts
 */

import { lineStart, sanitizeName, toModuleName, type LuaASTNode } from './lua-helpers';
import {
  type ApiMeta,
  type AnalyzePhaseResult,
  type CollectedData,
  type CollectedFunction,
} from './lua-analysis-types';

/**
 * 수집된 Lua 분석 데이터를 바탕으로 호출 그래프, 모듈 그룹화, 상태 변수 소유권 등을 분석하는 2차 분석 단계
 *
 * @param params - 분석에 필요한 데이터(주석, 전체 라인 수, 수집된 데이터, API 메타데이터 등)
 * @returns 종합 분석 결과 객체
 */
export function runAnalyzePhase(params: {
  comments: LuaASTNode[];
  total: number;
  collected: CollectedData;
  risuApi: Record<string, ApiMeta>;
  luaStdlibCalls: Set<string>;
}): AnalyzePhaseResult {
  const { comments, total, collected, risuApi, luaStdlibCalls } = params;

  const commentSections = collectCommentSections(comments);
  const sectionMapSections = buildSectionMapSections(commentSections, total);

  const callGraph = new Map<string, Set<string>>();
  for (const fn of collected.functions) {
    if (!callGraph.has(fn.name)) {
      callGraph.set(fn.name, new Set());
    }
  }

  for (const call of collected.calls) {
    if (!call.caller || !call.callee) continue;
    if (luaStdlibCalls.has(call.callee) || risuApi[call.callee]) continue;
    const normalizedCallee = sanitizeName(call.callee, call.callee).replace(/-/g, '_');
    if (!callGraph.has(call.caller)) {
      callGraph.set(call.caller, new Set());
    }
    callGraph.get(call.caller)!.add(normalizedCallee);
  }

  const preloadByModule = new Map(
    collected.preloadModules.map((entry) => [entry.moduleName, entry] as const),
  );
  const requireBindingsByScope = new Map<string, Map<string, string>>();

  for (const binding of collected.requireBindings) {
    const scopeKey = binding.containingFunction || '<top-level>';
    if (!requireBindingsByScope.has(scopeKey)) {
      requireBindingsByScope.set(scopeKey, new Map());
    }
    requireBindingsByScope.get(scopeKey)!.set(binding.localName, binding.moduleName);
  }

  const resolvedModuleCalls: AnalyzePhaseResult['resolvedModuleCalls'] = [];
  for (const moduleCall of collected.moduleMemberCalls) {
    const caller = moduleCall.caller;
    if (!caller) continue;

    const scopeKey = caller || '<top-level>';
    const moduleName = requireBindingsByScope.get(scopeKey)?.get(moduleCall.aliasName);
    if (!moduleName) continue;

    const resolvedCallee = preloadByModule
      .get(moduleName)
      ?.exportedMembers.get(moduleCall.memberName);
    if (!resolvedCallee) continue;

    if (!callGraph.has(caller)) {
      callGraph.set(caller, new Set());
    }
    callGraph.get(caller)!.add(resolvedCallee);
    resolvedModuleCalls.push({
      caller,
      callee: resolvedCallee,
      moduleName,
      memberName: moduleCall.memberName,
      line: moduleCall.line,
    });
  }

  const calledBy = new Map<string, Set<string>>();
  for (const [caller, targets] of callGraph.entries()) {
    for (const target of targets) {
      if (!calledBy.has(target)) {
        calledBy.set(target, new Set());
      }
      calledBy.get(target)!.add(caller);
    }
  }

  const apiByCategory = new Map<string, { apis: Set<string>; count: number }>();
  for (const call of collected.apiCalls) {
    if (!apiByCategory.has(call.category)) {
      apiByCategory.set(call.category, { apis: new Set(), count: 0 });
    }
    const row = apiByCategory.get(call.category)!;
    row.apis.add(call.apiName);
    row.count += 1;
  }

  const moduleGroups: AnalyzePhaseResult['moduleGroups'] = [];
  const moduleByFunction = new Map<string, string>();

  const primaryModuleName = inferModuleName(collected.functions);
  const primaryModule = {
    name: primaryModuleName,
    title: primaryModuleName,
    reason: 'single-module',
    source: 'heuristic',
    functions: new Set<string>(),
    tables: new Set<string>(),
    apiCats: new Set<string>(),
    stateKeys: new Set<string>(),
    dir: 'tstl/modules',
  };

  for (const fn of collected.functions) {
    primaryModule.functions.add(fn.name);
    moduleByFunction.set(fn.name, primaryModuleName);
    for (const cat of fn.apiCategories) primaryModule.apiCats.add(cat);
    for (const key of fn.stateReads) primaryModule.stateKeys.add(key);
    for (const key of fn.stateWrites) primaryModule.stateKeys.add(key);
  }

  for (const table of collected.dataTables) {
    if (table.depth === 0) {
      primaryModule.tables.add(table.name);
    }
  }

  if (primaryModule.functions.size > 0 || primaryModule.tables.size > 0) {
    moduleGroups.push(primaryModule);
  }

  const stateOwnership: AnalyzePhaseResult['stateOwnership'] = [];
  for (const [key, access] of collected.stateVars.entries()) {
    const writers = [...access.writtenBy].filter((name) => name !== '<top-level>');
    const readBy = [...access.readBy].filter((name) => name !== '<top-level>');
    const mods = new Set(
      [...writers, ...readBy].map((fnName) => moduleByFunction.get(fnName) || '(unassigned)'),
    );

    stateOwnership.push({
      key,
      readBy,
      writers,
      ownerModule:
        writers.length > 0 ? moduleByFunction.get(writers[0]) || '(unassigned)' : '(none)',
      crossModule: mods.size > 1,
    });
  }
  stateOwnership.sort((a, b) => a.key.localeCompare(b.key));

  const registryVars: AnalyzePhaseResult['registryVars'] = [];
  for (const [key, access] of collected.stateVars.entries()) {
    if (!access.apis.has('setChatVar') && !access.apis.has('getChatVar')) continue;
    const firstFn = access.firstWriteFunction || '-';
    const lowerFn = firstFn.toLowerCase();
    const isInitPattern =
      lowerFn.includes('init') || lowerFn === 'onstart' || lowerFn === '<top-level>';
    const firstValue = access.firstWriteValue || '';
    const looksNumeric = /^-?\d+(\.\d+)?$/.test(firstValue);
    const suggestNumber = access.hasDualWrite || (looksNumeric && access.apis.has('setState'));

    registryVars.push({
      key,
      suggestedDefault: firstValue,
      suggestNumber,
      isInitPattern,
      readCount: access.readBy.size,
      writeCount: access.writtenBy.size,
      firstWriteFunction: firstFn,
      hasDualWrite: access.hasDualWrite,
    });
  }
  registryVars.sort((a, b) => {
    if (a.isInitPattern !== b.isInitPattern) return a.isInitPattern ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  const rootFunctions = collected.functions.filter((fn) => {
    return !fn.parentFunction || !collected.functionIndexByName.has(fn.parentFunction);
  });

  const childrenOf = new Map<string, CollectedFunction[]>();
  for (const fn of collected.functions) {
    if (!fn.parentFunction) continue;
    if (!childrenOf.has(fn.parentFunction)) childrenOf.set(fn.parentFunction, []);
    childrenOf.get(fn.parentFunction)!.push(fn);
  }

  /**
   * getDescendants 함수.
   * 함수 이름을 기준으로 중첩된 하위 함수들을 깊이 우선으로 펼쳐 반환함.
   *
   * @param fnName - 하위 함수를 조회할 부모 함수 이름
   * @returns 부모 함수 아래에 속한 모든 하위 함수 목록
   */
  const getDescendants = (fnName: string): CollectedFunction[] => {
    const result: CollectedFunction[] = [];
    for (const child of childrenOf.get(fnName) || []) {
      result.push(child, ...getDescendants(child.name));
    }
    return result;
  };

  return {
    commentSections,
    sectionMapSections,
    callGraph,
    calledBy,
    apiByCategory,
    moduleGroups,
    moduleByFunction,
    stateOwnership,
    registryVars,
    rootFunctions,
    getDescendants,
    resolvedModuleCalls,
  };
}

/**
 * collectCommentSections 함수.
 * Lua 주석 목록에서 섹션 경계로 볼 수 있는 구분 주석을 수집함.
 *
 * @param comments - 섹션 후보를 찾을 Lua 주석 AST 노드 목록
 * @returns 섹션 제목, 시작 줄, 출처를 담은 섹션 후보 목록
 */
function collectCommentSections(
  comments: LuaASTNode[],
): Array<{ title: string; line: number; source: string }> {
  const sections: Array<{ title: string; line: number; source: string }> = [];
  const sorted = [...comments].sort((a, b) => lineStart(a) - lineStart(b));

  for (const comment of sorted) {
    const value = String((comment as any).value || '').trim();
    if (!value) continue;
    if (!/^[\s=═-]{3,}$/.test(value) && !/[=═]{3,}/.test(value)) continue;

    sections.push({
      title: `섹션 L${lineStart(comment)}`,
      line: lineStart(comment),
      source: 'comment',
    });
  }

  return sections;
}

/**
 * buildSectionMapSections 함수.
 * 수집된 섹션 후보를 전체 라인 범위에 맞춘 연속 구간 목록으로 변환함.
 *
 * @param sections - 라인 범위로 확장할 섹션 후보 목록
 * @param totalLines - 마지막 섹션의 끝 줄을 정할 전체 Lua 소스 라인 수
 * @returns 섹션별 시작 줄과 끝 줄을 포함한 구간 목록
 */
function buildSectionMapSections(
  sections: Array<{ title: string; line: number; source: string }>,
  totalLines: number,
): Array<{ title: string; source: string; startLine: number; endLine: number }> {
  if (sections.length === 0) {
    return [
      {
        title: '전체',
        source: 'default',
        startLine: 1,
        endLine: totalLines,
      },
    ];
  }

  const sorted = [...sections].sort((a, b) => a.line - b.line);
  const out: Array<{ title: string; source: string; startLine: number; endLine: number }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const startLine = sorted[i].line;
    const endLine = i + 1 < sorted.length ? sorted[i + 1].line - 1 : totalLines;
    if (endLine < startLine) continue;
    out.push({
      title: sorted[i].title,
      source: sorted[i].source,
      startLine,
      endLine,
    });
  }
  return out.slice(0, 40);
}

/**
 * inferModuleName 함수.
 * 수집된 함수 목록에서 대표 함수명을 골라 분석 모듈 이름을 추론함.
 *
 * @param functions - 모듈 이름 추론에 사용할 수집 함수 목록
 * @returns 추론된 모듈 이름 또는 기본 모듈 이름
 */
function inferModuleName(functions: CollectedFunction[]): string {
  if (functions.length === 0) return 'main';
  const top = [...functions].sort((a, b) => b.lineCount - a.lineCount)[0];
  return toModuleName(top.displayName || top.name) || 'main';
}
