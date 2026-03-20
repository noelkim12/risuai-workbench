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

export function runCollectPhase(params: {
  body: LuaASTNode[];
  risuApi: Record<string, ApiMeta>;
}): { collected: CollectedData } {
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
  };

  const fnHandled = new Set<string>();
  const fnStack: Array<string | null> = [];

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
    const callee = directCalleeName(node);
    if (!callee) return;

    collected.calls.push({ caller, callee, line: lineStart(node) });
    if (!risuApi[callee]) return;

    addApiCall(callee, lineStart(node), caller);

    if (callee === 'setChatVar' || callee === 'getChatVar' || callee === 'setState' || callee === 'getState') {
      const key = strLit(callArgs(node)[1]);
      const writeValue = callee === 'setChatVar' ? strLit(callArgs(node)[2]) : null;
      if (key) addStateAccess(callee, key, caller, lineStart(node), writeValue);
    }

    if (callee === 'getLoreBooks' || callee === 'loadLoreBooks') {
      const keyword = strLit(callArgs(node)[1]);
      if (keyword) {
        collected.loreApiCalls.push({
          apiName: callee,
          keyword,
          line: lineStart(node),
          containingFunction: caller || '<top-level>',
        });
      }
    }

    if (callee === 'upsertLocalLoreBook') {
      collected.loreApiCalls.push({
        apiName: callee,
        keyword: null,
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
        const fallbackName = sanitizeName(exprName((node as any).identifier) || `anonymous_l${lineStart(node)}`, `fn_l${lineStart(node)}`).replace(/-/g, '_');
        rec = ensureFnIndex(fallbackName)[0] || null;
      }

      const fnName = rec ? rec.name : currentFn(explicitParent);
      const declaredName = exprName((node as any).identifier);
      if (declaredName && ['onStart', 'onInput', 'onOutput', 'onButtonClick'].includes(declaredName)) {
        markHandler(declaredName, lineStart(node), Boolean(rec?.isAsync), rec?.name || null, declaredName);
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
      for (const arg of callArgs(node)) walk(arg, explicitParent);
      return;
    }

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
  return { collected };
}
