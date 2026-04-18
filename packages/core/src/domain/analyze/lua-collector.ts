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
  };

  const fnHandled = new Set<string>();
  const fnStack: Array<string | null> = [];
  const pendingPreloadModules: Array<{
    moduleName: string;
    factoryStartLine: number;
    line: number;
    exportedMembers: Array<{ memberName: string; functionStartLine: number }>;
  }> = [];

  const ensureFnIndex = (name: string): CollectedFunction[] => {
    if (!collected.functionIndexByName.has(name)) {
      collected.functionIndexByName.set(name, []);
    }
    return collected.functionIndexByName.get(name)!;
  };

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

  const currentFn = (explicitParent: string | null): string | null => {
    return explicitParent || fnStack[fnStack.length - 1] || null;
  };

  const extractPreloadModuleName = (
    lhs: LuaASTNode | null,
    rhs: LuaASTNode | null,
  ): string | null => {
    if (!lhs || !rhs || rhs.type !== 'FunctionDeclaration' || lhs.type !== 'IndexExpression')
      return null;
    if (exprName((lhs as any).base as LuaASTNode | undefined) !== 'package.preload') return null;
    return strLit((lhs as any).index as LuaASTNode | undefined);
  };

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

  const addStateAccess = (
    apiName: string,
    key: string,
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

    if (!fnName) return;
    for (const fn of ensureFnIndex(fnName)) {
      if (rw === 'read') fn.stateReads.add(key);
      if (rw === 'write') fn.stateWrites.add(key);
    }
  };

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

  const findAsyncFn = (callNode: LuaASTNode | null): LuaASTNode | null => {
    if (!callNode || callNode.type !== 'CallExpression') return null;
    if (directCalleeName(callNode) !== 'async') return null;
    const args = callArgs(callNode);
    const first = args[0];
    if (first && first.type === 'FunctionDeclaration') return first;
    return null;
  };

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
      const keyIndex = callee === 'setState' || callee === 'getState'
        ? args.length >= 2 ? 1 : 0
        : 0;
      const key = strLit(args[keyIndex]);
      const writeValue = callee === 'setChatVar' || callee === 'setState'
        ? strLit(args[keyIndex + 1])
        : null;
      if (key) addStateAccess(callee, key, caller, lineStart(node), writeValue);
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
