/**
 * Lua AST에서 함수, API 호출, 상태 접근, 모듈 연결 정보를 수집하는 1차 분석 단계.
 * @file packages/core/src/domain/analyze/lua-collector.ts
 */

import {
  safeArray,
  lineStart,
  lineEnd,
  lineCount,
  nodeKey,
  callArgs,
  strLit,
  exprName,
  assignName,
  directCalleeName,
  sanitizeName,
  prefixOf,
  type LuaASTNode,
} from './lua-helpers';
import { type ApiMeta, type CollectedData, type CollectedFunction } from './lua-analysis-types';

const LOREBOOK_LOOKUP_APIS = new Set(['getLoreBooks', 'getLoreBooksMain']);
const LOREBOOK_LOAD_APIS = new Set(['loadLoreBooks', 'loadLoreBooksMain']);

/**
 * Lua AST를 순회하며 함수 정의, API 호출, 상태 변수 접근 등을 수집하는 1차 수집 단계
 *
 * @param params - 분석할 AST 본문과 RisuAI API 메타데이터
 * @returns 수집된 기초 분석 데이터
 */
export function runCollectPhase(params: { body: LuaASTNode[]; risuApi: Record<string, ApiMeta> }): {
  collected: CollectedData;
} {
  const { body, risuApi } = params;

  const collected: CollectedData = {
    functions: [],
    calls: [],
    apiCalls: [],
    handlers: [],
    dataTables: [],
    stateVars: new Map(),
    functionIndexByName: new Map(),
    prefixBuckets: new Map(),
    loreApiCalls: [],
    preloadModules: [],
    requireBindings: [],
    moduleMemberCalls: [],
    stateAccessOccurrences: [],
  };

  const fnHandled = new Set<string>();
  const fnStack: Array<string | null> = [];
  const pendingPreloadModules: Array<{
    moduleName: string;
    factoryStartLine: number;
    line: number;
    exportedMembers: Array<{ memberName: string; functionStartLine: number }>;
  }> = [];

  /**
   * ensureFnIndex 함수.
   * 함수 이름별 인덱스 버킷을 보장하고 같은 이름의 수집 함수 목록을 반환함.
   *
   * @param name - 인덱스에서 조회하거나 생성할 정규화된 함수 이름
   * @returns 해당 함수 이름에 연결된 수집 함수 목록
   */
  const ensureFnIndex = (name: string): CollectedFunction[] => {
    if (!collected.functionIndexByName.has(name)) {
      collected.functionIndexByName.set(name, []);
    }
    return collected.functionIndexByName.get(name)!;
  };

  /**
   * ensureStateVar 함수.
   * 상태 키별 접근 기록을 보장하고 읽기, 쓰기 메타데이터를 누적할 저장소를 반환함.
   *
   * @param key - 접근 기록을 만들거나 조회할 상태 변수 키
   * @returns 해당 상태 변수 키의 수집 기록
   */
  const ensureStateVar = (key: string) => {
    if (!collected.stateVars.has(key)) {
      collected.stateVars.set(key, {
        key,
        readBy: new Set(),
        writtenBy: new Set(),
        apis: new Set(),
        firstWriteValue: null,
        firstWriteFunction: null,
        firstWriteLine: 0,
        hasDualWrite: false,
      });
    }
    return collected.stateVars.get(key)!;
  };

  /**
   * currentFn 함수.
   * 명시 부모 또는 함수 스택을 기준으로 현재 수집 컨텍스트의 함수 이름을 확인함.
   *
   * @param explicitParent - 순회 호출자가 우선 지정한 부모 함수 이름
   * @returns 현재 함수 이름 또는 최상위 컨텍스트를 뜻하는 null
   */
  const currentFn = (explicitParent: string | null): string | null => {
    return explicitParent || fnStack[fnStack.length - 1] || null;
  };

  /**
   * extractPreloadModuleName 함수.
   * package.preload 할당식에서 등록되는 모듈 이름을 추출함.
   *
   * @param lhs - 할당문의 왼쪽 AST 노드
   * @param rhs - 할당문의 오른쪽 AST 노드
   * @returns package.preload 모듈 이름 또는 추출할 수 없을 때 null
   */
  const extractPreloadModuleName = (
    lhs: LuaASTNode | null,
    rhs: LuaASTNode | null,
  ): string | null => {
    if (!lhs || !rhs || rhs.type !== 'FunctionDeclaration' || lhs.type !== 'IndexExpression')
      return null;
    if (exprName((lhs as any).base as LuaASTNode | undefined) !== 'package.preload') return null;
    return strLit((lhs as any).index as LuaASTNode | undefined);
  };

  /**
   * collectPendingPreloadModule 함수.
   * package.preload 팩토리에서 반환 테이블과 export 멤버 후보를 임시 수집함.
   *
   * @param moduleName - package.preload에 등록된 모듈 이름
   * @param factoryNode - export 멤버를 찾을 preload 팩토리 함수 노드
   * @returns 반환값 없음
   */
  const collectPendingPreloadModule = (moduleName: string, factoryNode: LuaASTNode): void => {
    const body = safeArray<LuaASTNode>((factoryNode as any).body);
    const returnedTableName = body
      .filter((statement): statement is LuaASTNode => Boolean(statement))
      .flatMap((statement) => {
        if (statement.type !== 'ReturnStatement') return [];
        const firstArg = safeArray((statement as any).arguments)[0] as LuaASTNode | undefined;
        return firstArg?.type === 'Identifier' && firstArg.name ? [firstArg.name] : [];
      })[0];

    const exportedMembers = returnedTableName
      ? body.flatMap((statement) => {
          if (statement?.type !== 'FunctionDeclaration') return [];
          const identifier = (statement as any).identifier as LuaASTNode | undefined;
          if (identifier?.type !== 'MemberExpression') return [];
          const base = exprName((identifier as any).base as LuaASTNode | undefined);
          const memberName = exprName((identifier as any).identifier as LuaASTNode | undefined);
          if (!base || !memberName || base !== returnedTableName) return [];
          return [{ memberName, functionStartLine: lineStart(statement) }];
        })
      : [];

    pendingPreloadModules.push({
      moduleName,
      factoryStartLine: lineStart(factoryNode),
      line: lineStart(factoryNode),
      exportedMembers,
    });
  };

  /**
   * maybeCollectRequireBinding 함수.
   * local require 할당을 찾아 별칭과 모듈 이름의 스코프별 바인딩을 기록함.
   *
   * @param lhs - require 결과를 받는 왼쪽 AST 노드
   * @param rhs - require 호출인지 확인할 오른쪽 AST 노드
   * @param explicitParent - 바인딩이 속한 함수 컨텍스트
   * @param isLocalAssign - local 할당만 require 바인딩으로 인정하기 위한 플래그
   * @returns 반환값 없음
   */
  const maybeCollectRequireBinding = (
    lhs: LuaASTNode | null,
    rhs: LuaASTNode | null,
    explicitParent: string | null,
    isLocalAssign: boolean,
  ): void => {
    if (!isLocalAssign || !lhs || !rhs) return;
    if (lhs.type !== 'Identifier' || directCalleeName(rhs) !== 'require') return;
    const moduleName = strLit(callArgs(rhs)[0]);
    if (!moduleName || !lhs.name) return;

    collected.requireBindings.push({
      localName: lhs.name,
      moduleName,
      containingFunction: currentFn(explicitParent),
      line: lineStart(rhs),
    });
  };

  /**
   * maybeCollectAliasMemberCall 함수.
   * require 별칭의 멤버 호출을 기록해 이후 모듈 함수 호출로 해석할 수 있게 함.
   *
   * @param node - 멤버 호출 후보인 CallExpression 노드
   * @param explicitParent - 호출이 발생한 함수 컨텍스트
   * @returns 반환값 없음
   */
  const maybeCollectAliasMemberCall = (node: LuaASTNode, explicitParent: string | null): void => {
    const base = (node as any).base as LuaASTNode | undefined;
    if (base?.type !== 'MemberExpression' || (base as any).indexer !== '.') return;
    const aliasNode = (base as any).base as LuaASTNode | undefined;
    const memberNode = (base as any).identifier as LuaASTNode | undefined;
    if (aliasNode?.type !== 'Identifier' || memberNode?.type !== 'Identifier') return;

    collected.moduleMemberCalls.push({
      caller: currentFn(explicitParent),
      aliasName: aliasNode.name || '',
      memberName: memberNode.name || '',
      line: lineStart(node),
    });
  };

  /**
   * registerFunction 함수.
   * Lua 함수 선언을 정규화된 수집 함수 레코드로 등록하고 인덱스와 prefix 버킷을 갱신함.
   *
   * @param node - 등록할 함수 선언 AST 노드
   * @param rawName - 표시 이름과 정규화 이름의 원본으로 쓸 함수명
   * @param opts - local 여부, async 여부, 부모 함수와 핸들러 메타데이터
   * @returns 새로 등록된 수집 함수 레코드
   */
  const registerFunction = (
    node: LuaASTNode,
    rawName: string | null,
    opts: {
      isLocal: boolean;
      isAsync: boolean;
      parentFunction: string | null;
      isListenEditHandler?: boolean;
      listenEditEventType?: string | null;
    },
  ): CollectedFunction => {
    const start = lineStart(node);
    const baseName = rawName || `anonymous_L${start}`;
    let normalized = sanitizeName(baseName, `fn_l${start}`).replace(/-/g, '_');

    const existing = collected.functionIndexByName.get(normalized);
    if (existing && existing.length > 0) {
      const existingParent = existing[0].parentFunction;
      if (opts.parentFunction !== existingParent) {
        normalized = `${normalized}_l${start}`;
      }
    }

    const rec: CollectedFunction = {
      name: normalized,
      displayName: baseName,
      startLine: start,
      endLine: lineEnd(node),
      lineCount: lineCount(node),
      isLocal: opts.isLocal,
      isAsync: opts.isAsync,
      params: safeArray((node as any).parameters)
        .map((item) => exprName(item as LuaASTNode) || '...')
        .filter(Boolean),
      parentFunction: opts.parentFunction,
      isListenEditHandler: Boolean(opts.isListenEditHandler),
      listenEditEventType: opts.listenEditEventType || null,
      apiCategories: new Set(),
      apiNames: new Set(),
      stateReads: new Set(),
      stateWrites: new Set(),
    };

    collected.functions.push(rec);
    ensureFnIndex(rec.name).push(rec);
    fnHandled.add(nodeKey(node));

    const prefix = prefixOf(rec.displayName);
    if (prefix) {
      if (!collected.prefixBuckets.has(prefix)) {
        collected.prefixBuckets.set(prefix, []);
      }
      collected.prefixBuckets.get(prefix)!.push(rec);
    }

    return rec;
  };

  /**
   * markHandler 함수.
   * RisuAI 이벤트 핸들러 또는 listenEdit 콜백 정보를 수집 결과에 기록함.
   *
   * @param type - 핸들러 종류 또는 이벤트 API 이름
   * @param line - 핸들러가 발견된 소스 라인
   * @param isAsync - 핸들러가 async 래퍼로 선언되었는지 여부
   * @param fnName - 핸들러 구현으로 연결된 수집 함수 이름
   * @param detail - 이벤트 타입처럼 핸들러를 구분하는 부가 정보
   * @returns 반환값 없음
   */
  const markHandler = (
    type: string,
    line: number,
    isAsync: boolean,
    fnName: string | null,
    detail: string | null,
  ): void => {
    collected.handlers.push({
      type,
      line,
      isAsync,
      functionName: fnName,
      detail,
    });
  };

  /**
   * addApiCall 함수.
   * RisuAI API 호출을 기록하고 호출 함수의 API 카테고리와 이름 집합을 갱신함.
   *
   * @param apiName - 호출된 RisuAI API 이름
   * @param line - API 호출이 발견된 소스 라인
   * @param fnName - API 호출을 포함한 함수 이름
   * @returns 반환값 없음
   */
  const addApiCall = (apiName: string, line: number, fnName: string | null): void => {
    const meta = risuApi[apiName];
    if (!meta) return;

    collected.apiCalls.push({
      apiName,
      category: meta.cat,
      access: meta.access,
      rw: meta.rw,
      line,
      containingFunction: fnName || '<top-level>',
    });

    if (!fnName) return;
    for (const fn of ensureFnIndex(fnName)) {
      fn.apiCategories.add(meta.cat);
      fn.apiNames.add(apiName);
    }
  };

  /**
   * addStateAccess 함수.
   * 상태 API의 정적 키 접근을 읽기 또는 쓰기 기록과 정확한 소스 범위로 저장함.
   *
   * @param apiName - 상태 접근을 만든 RisuAI API 이름
   * @param key - 접근 대상 상태 변수 키
   * @param keyNode - 키 문자열의 소스 범위를 가진 AST 노드
   * @param fnName - 상태 접근을 포함한 함수 이름
   * @param line - 상태 접근이 발견된 소스 라인
   * @param writeValue - 최초 쓰기 기본값 후보로 저장할 문자열 값
   * @returns 반환값 없음
   */
  const addStateAccess = (
    apiName: string,
    key: string,
    keyNode: LuaASTNode | null,
    fnName: string | null,
    line: number,
    writeValue: string | null,
  ): void => {
    if (!key) return;
    const sv = ensureStateVar(key);
    sv.apis.add(apiName);
    const rw = risuApi[apiName]?.rw;
    const owner = fnName || '<top-level>';

    if (rw === 'read') sv.readBy.add(owner);
    if (rw === 'write') {
      sv.writtenBy.add(owner);
      if (sv.firstWriteValue == null && writeValue != null) {
        sv.firstWriteValue = writeValue;
        sv.firstWriteFunction = owner;
        sv.firstWriteLine = line;
      }
      if (apiName === 'setState' && sv.apis.has('setChatVar')) sv.hasDualWrite = true;
      if (apiName === 'setChatVar' && sv.apis.has('setState')) sv.hasDualWrite = true;
    }

    // Record exact occurrence metadata for static string key accesses
    if (keyNode && keyNode.range) {
      collected.stateAccessOccurrences.push({
        key,
        direction: rw === 'write' ? 'write' : 'read',
        apiName,
        containingFunction: owner,
        line,
        argStart: keyNode.range[0],
        argEnd: keyNode.range[1],
      });
    }

    if (!fnName) return;
    for (const fn of ensureFnIndex(fnName)) {
      if (rw === 'read') fn.stateReads.add(key);
      if (rw === 'write') fn.stateWrites.add(key);
    }
  };

  /**
   * addDataTable 함수.
   * 필드가 충분한 테이블 생성식을 데이터 테이블 후보로 수집함.
   *
   * @param name - 테이블 후보에 부여할 식별 이름
   * @param tableNode - 필드 수와 위치를 확인할 테이블 생성식 노드
   * @param depth - 현재 함수 스택 깊이로 계산한 테이블 중첩 수준
   * @returns 반환값 없음
   */
  const addDataTable = (name: string | null, tableNode: LuaASTNode | null, depth: number): void => {
    if (!tableNode || tableNode.type !== 'TableConstructorExpression') return;
    const fields = safeArray((tableNode as any).fields);
    if (fields.length < 3) return;
    collected.dataTables.push({
      name: name || `table_l${lineStart(tableNode)}`,
      fieldCount: fields.length,
      startLine: lineStart(tableNode),
      endLine: lineEnd(tableNode),
      depth,
    });
  };

  /**
   * findAsyncFn 함수.
   * async 호출의 첫 번째 인자로 전달된 함수 선언을 찾아 비동기 핸들러로 등록할 수 있게 함.
   *
   * @param callNode - async 호출인지 확인할 AST 노드
   * @returns async로 감싼 함수 선언 노드 또는 없을 때 null
   */
  const findAsyncFn = (callNode: LuaASTNode | null): LuaASTNode | null => {
    if (!callNode || callNode.type !== 'CallExpression') return null;
    if (directCalleeName(callNode) !== 'async') return null;
    const args = callArgs(callNode);
    const first = args[0];
    if (first && first.type === 'FunctionDeclaration') return first;
    return null;
  };

  /**
   * handleCallExpr 함수.
   * 함수 호출 노드에서 호출 그래프, API 호출, 상태 접근, 로어북 접근 정보를 수집함.
   *
   * @param node - 분석할 Lua CallExpression 노드
   * @param explicitParent - 호출이 속한 함수 컨텍스트
   * @returns 반환값 없음
   */
  const handleCallExpr = (node: LuaASTNode, explicitParent: string | null): void => {
    const caller = currentFn(explicitParent);
    maybeCollectAliasMemberCall(node, explicitParent);
    const callee = directCalleeName(node);
    if (!callee) return;
    const args = callArgs(node);

    collected.calls.push({ caller, callee, line: lineStart(node) });

    // pcall(fn, ...) / xpcall(fn, handler, ...)로 감싼 함수 호출은 call graph에서
    // pcall 자체가 아니라 내부 함수 참조를 caller의 호출 대상으로 기록해야 한다.
    // 그래야 relationship-network에서 onOutput → processCharacterTokens 같은 간선이 만들어진다.
    if (callee === 'pcall' || callee === 'xpcall') {
      const wrappedFn = exprName(args[0]);
      if (wrappedFn) {
        collected.calls.push({ caller, callee: wrappedFn, line: lineStart(node) });
      }
      if (callee === 'xpcall') {
        const handlerFn = exprName(args[1]);
        if (handlerFn) {
          collected.calls.push({ caller, callee: handlerFn, line: lineStart(node) });
        }
      }
    }

    if (!risuApi[callee]) return;

    addApiCall(callee, lineStart(node), caller);

    if (
      callee === 'setChatVar' ||
      callee === 'getChatVar' ||
      callee === 'setState' ||
      callee === 'getState'
    ) {
      // Determine key index based on API patterns:
      // Read APIs (getState/getChatVar):
      //   - 1 arg: arg0 is the key
      //   - 2 args with static arg0: arg0 is key
      //   - 2 args with identifier arg0: wrapper form, arg1 is key
      // Write APIs (setState/setChatVar):
      //   - 2 args with static arg0: arg0 is key
      //   - 3+ args with identifier arg0: wrapper form, arg1 is key
      //   - 2 args with identifier arg0: ambiguous (dynamic key), skip
      const isRead = callee === 'getState' || callee === 'getChatVar';
      let keyIndex: number | null = null;

      if (args.length === 1 && strLit(args[0]) !== null) {
        keyIndex = 0;
      } else if (args.length >= 2 && strLit(args[0]) !== null) {
        // Static first arg - it's the key (both read and write)
        keyIndex = 0;
      } else if (args.length >= 2 && args[0]?.type === 'Identifier' && strLit(args[1]) !== null) {
        // Identifier first arg, static second arg
        if (isRead && args.length === 2) {
          // Read API with 2 args: wrapper form (getState(chat, "key"))
          keyIndex = 1;
        } else if (!isRead && args.length >= 3) {
          // Write API with 3+ args: wrapper form (setState(chat, "key", value))
          keyIndex = 1;
        }
        // Otherwise: ambiguous (likely dynamic key), skip
      }

      if (keyIndex !== null) {
        const keyNode = args[keyIndex];
        const key = strLit(keyNode);
        const writeValue = callee === 'setChatVar' || callee === 'setState'
          ? strLit(args[keyIndex + 1])
          : null;
        if (key) addStateAccess(callee, key, keyNode, caller, lineStart(node), writeValue);
      }
    }

    if (LOREBOOK_LOOKUP_APIS.has(callee)) {
      const keywordIndex = args.length >= 2 ? 1 : 0;
      const keyword = strLit(args[keywordIndex]);
      if (keyword) {
        collected.loreApiCalls.push({
          apiName: callee,
          keyword,
          line: lineStart(node),
          containingFunction: caller || '<top-level>',
        });
      }
    }

    if (LOREBOOK_LOAD_APIS.has(callee)) {
      collected.loreApiCalls.push({
        apiName: callee,
        keyword: null,
        line: lineStart(node),
        containingFunction: caller || '<top-level>',
      });
    }

    if (callee === 'upsertLocalLoreBook') {
      const targetIndex = args.length >= 2 ? 1 : 0;
      const targetName = strLit(args[targetIndex]);
      collected.loreApiCalls.push({
        apiName: callee,
        keyword: targetName,
        line: lineStart(node),
        containingFunction: caller || '<top-level>',
      });
    }
  };

  /**
   * walk 함수.
   * Lua AST를 재귀 순회하며 함수, 할당, 호출, 테이블 정보를 각 수집기로 전달함.
   *
   * @param node - 순회할 Lua AST 노드, 노드 목록 또는 빈 값
   * @param explicitParent - 현재 순회가 속한 함수 컨텍스트
   * @returns 반환값 없음
   */
  const walk = (node: LuaASTNode | LuaASTNode[] | null, explicitParent: string | null): void => {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const child of node) walk(child, explicitParent);
      return;
    }

    if (node.type === 'FunctionDeclaration') {
      const key = nodeKey(node);
      let rec: CollectedFunction | null = null;

      if (!fnHandled.has(key)) {
        rec = registerFunction(node, exprName((node as any).identifier), {
          isLocal: Boolean((node as any).isLocal),
          isAsync: false,
          parentFunction: currentFn(explicitParent),
        });
      } else {
        const fallbackName = sanitizeName(
          exprName((node as any).identifier) || `anonymous_l${lineStart(node)}`,
          `fn_l${lineStart(node)}`,
        ).replace(/-/g, '_');
        rec = ensureFnIndex(fallbackName)[0] || null;
      }

      const fnName = rec ? rec.name : currentFn(explicitParent);
      const declaredName = exprName((node as any).identifier);
      if (
        declaredName &&
        ['onStart', 'onInput', 'onOutput', 'onButtonClick'].includes(declaredName)
      ) {
        markHandler(
          declaredName,
          lineStart(node),
          Boolean(rec?.isAsync),
          rec?.name || null,
          declaredName,
        );
      }

      fnStack.push(fnName);
      walk((node as any).body as LuaASTNode[], fnName);
      fnStack.pop();
      return;
    }

    if (node.type === 'LocalStatement' || node.type === 'AssignmentStatement') {
      const isLocalAssign = node.type === 'LocalStatement';
      const vars = safeArray((node as any).variables);
      const init = safeArray((node as any).init);

      for (let i = 0; i < init.length; i += 1) {
        const lhs = vars[i] as LuaASTNode;
        const rhs = init[i] as LuaASTNode;
        const targetName = assignName(lhs) || `fn_l${lineStart(rhs)}`;
        const preloadModuleName = extractPreloadModuleName(lhs, rhs);

        if (preloadModuleName) {
          collectPendingPreloadModule(preloadModuleName, rhs);
        }

        maybeCollectRequireBinding(lhs, rhs, explicitParent, isLocalAssign);

        if (rhs?.type === 'FunctionDeclaration') {
          const rec = registerFunction(rhs, targetName, {
            isLocal: isLocalAssign,
            isAsync: false,
            parentFunction: currentFn(explicitParent),
          });
          if (['onStart', 'onInput', 'onOutput', 'onButtonClick'].includes(targetName)) {
            markHandler(targetName, lineStart(rhs), false, rec.name, targetName);
          }
          fnStack.push(rec.name);
          walk((rhs as any).body as LuaASTNode[], rec.name);
          fnStack.pop();
          continue;
        }

        const asyncFn = findAsyncFn(rhs);
        if (asyncFn) {
          const rec = registerFunction(asyncFn, targetName, {
            isLocal: isLocalAssign,
            isAsync: true,
            parentFunction: currentFn(explicitParent),
          });
          if (['onInput', 'onOutput', 'onButtonClick'].includes(targetName)) {
            markHandler(targetName, lineStart(rhs), true, rec.name, targetName);
          }
          fnStack.push(rec.name);
          walk((asyncFn as any).body as LuaASTNode[], rec.name);
          fnStack.pop();
          continue;
        }

        if (rhs?.type === 'TableConstructorExpression') {
          addDataTable(targetName, rhs, fnStack.length);
        }
        walk(rhs, explicitParent);
      }

      for (const v of vars) walk(v as LuaASTNode, explicitParent);
      return;
    }

    if (node.type === 'CallStatement') {
      const expr = (node as any).expression as LuaASTNode;
      const callee = directCalleeName(expr);
      if (callee === 'listenEdit') {
        const args = callArgs(expr);
        const eventType = strLit(args[0]) || 'unknown';
        const fnArg = args[1];
        if (fnArg?.type === 'FunctionDeclaration') {
          const rec = registerFunction(fnArg, `listenEdit_${eventType}_l${lineStart(fnArg)}`, {
            isLocal: false,
            isAsync: false,
            parentFunction: currentFn(explicitParent),
            isListenEditHandler: true,
            listenEditEventType: eventType,
          });
          markHandler('listenEdit', lineStart(expr), false, rec.name, eventType);
          fnStack.push(rec.name);
          walk((fnArg as any).body as LuaASTNode[], rec.name);
          fnStack.pop();
        }
      }
      walk(expr, explicitParent);
      return;
    }

    if (node.type === 'CallExpression') {
      handleCallExpr(node, explicitParent);
      walk((node as any).base as LuaASTNode, explicitParent);
      // 인라인 콜백(예: text:gsub(pat, function(...) end))으로 전달된 FunctionDeclaration은
      // 독립 함수가 아니라 enclosing function의 일부로 취급되어야 한다.
      // fnHandled에 미리 등록해 generic FunctionDeclaration 분기에서 새 노드로 집계되지 않게 한다.
      // 그래도 body는 enclosing function 스택 위에서 계속 순회된다.
      for (const arg of callArgs(node)) {
        if (arg?.type === 'FunctionDeclaration') {
          fnHandled.add(nodeKey(arg));
        }
        walk(arg, explicitParent);
      }
      return;
    }

    // StringLiteral / StringCallExpression의 value는 코드가 아니므로 재귀 탐색하지 않는다.
    // [[ ]] long string 내부 텍스트를 함수 선언으로 오인하는 것을 방지한다.
    if (node.type === 'StringLiteral') return;

    for (const value of Object.values(node as unknown as Record<string, unknown>)) {
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            walk(child as LuaASTNode, explicitParent);
          }
        }
      } else if (typeof value === 'object') {
        walk(value as LuaASTNode, explicitParent);
      }
    }
  };

  walk(body, null);

  const functionNameByStartLine = new Map(
    collected.functions.map((fn) => [fn.startLine, fn.name] as const),
  );

  for (const pending of pendingPreloadModules) {
    const exportedMembers = new Map<string, string>();
    for (const member of pending.exportedMembers) {
      const functionName = functionNameByStartLine.get(member.functionStartLine);
      if (!functionName) continue;
      exportedMembers.set(member.memberName, functionName);
    }

    collected.preloadModules.push({
      moduleName: pending.moduleName,
      functionName:
        functionNameByStartLine.get(pending.factoryStartLine) ||
        sanitizeName(`preload_${pending.moduleName}`, `preload_l${pending.line}`),
      exportedMembers,
      line: pending.line,
    });
  }

  return { collected };
}
