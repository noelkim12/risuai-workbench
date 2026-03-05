function runCollectPhase(context) {
  const {
    body,
    RISUAI_API,
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
  } = context;

const collected = {
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

const fnHandled = new Set();
const fnStack = [];

function ensureFnIndex(name) {
  if (!collected.functionIndexByName.has(name)) collected.functionIndexByName.set(name, []);
  return collected.functionIndexByName.get(name);
}

function ensureStateVar(key) {
  if (!collected.stateVars.has(key)) {
    collected.stateVars.set(key, { key, readBy: new Set(), writtenBy: new Set(), apis: new Set(), firstWriteValue: null, firstWriteFunction: null, firstWriteLine: 0, hasDualWrite: false });
  }
  return collected.stateVars.get(key);
}

function currentFn(explicitParent) {
  return explicitParent || fnStack[fnStack.length - 1] || null;
}

function registerFunction(node, rawName, opts) {
  const startLine = lineStart(node);
  const baseName = rawName || `anonymous_L${startLine}`;
  let normalized = sanitizeName(baseName, `fn_l${startLine}`).replace(/-/g, "_");
  // Disambiguate when nested function redefines a name that already exists at a different scope
  const existingFns = collected.functionIndexByName.get(normalized);
  if (existingFns && existingFns.length > 0) {
    const parentFn = opts && opts.parentFunction ? opts.parentFunction : null;
    const existingParent = existingFns[0].parentFunction;
    if (parentFn !== existingParent) {
      normalized = `${normalized}_l${startLine}`;
    }
  }
  const rec = {
    name: normalized,
    displayName: baseName,
    startLine,
    endLine: lineEnd(node),
    lineCount: lineCount(node),
    isLocal: Boolean(opts && opts.isLocal),
    isAsync: Boolean(opts && opts.isAsync),
    params: safeArray(node.parameters).map((p) => exprName(p) || "...").filter(Boolean),
    parentFunction: opts && opts.parentFunction ? opts.parentFunction : null,
    isListenEditHandler: Boolean(opts && opts.isListenEditHandler),
    listenEditEventType: opts && opts.listenEditEventType ? opts.listenEditEventType : null,
    apiCategories: new Set(),
    apiNames: new Set(),
    stateReads: new Set(),
    stateWrites: new Set(),
  };
  collected.functions.push(rec);
  ensureFnIndex(rec.name).push(rec);
  fnHandled.add(nodeKey(node));
  const p = prefixOf(rec.displayName);
  if (p) {
    if (!collected.prefixBuckets.has(p)) collected.prefixBuckets.set(p, []);
    collected.prefixBuckets.get(p).push(rec);
  }
  return rec;
}

function markHandler(type, line, isAsync, fnName, detail) {
  collected.handlers.push({ type, line, isAsync: Boolean(isAsync), functionName: fnName || null, detail: detail || null });
}

function addApiCall(apiName, line, fnName) {
  const meta = RISUAI_API[apiName];
  if (!meta) return;
  collected.apiCalls.push({ apiName, category: meta.cat, access: meta.access, rw: meta.rw, line, containingFunction: fnName || "<top-level>" });
  if (!fnName) return;
  for (const f of ensureFnIndex(fnName)) {
    f.apiCategories.add(meta.cat);
    f.apiNames.add(apiName);
  }
}

function addStateAccess(apiName, key, fnName, line, writeValue) {
  if (!key) return;
  const sv = ensureStateVar(key);
  sv.apis.add(apiName);
  const rw = RISUAI_API[apiName] && RISUAI_API[apiName].rw;
  const owner = fnName || "<top-level>";
  if (rw === "read") sv.readBy.add(owner);
  if (rw === "write") {
    sv.writtenBy.add(owner);
    // Track first write value for registry suggestion
    if (sv.firstWriteValue === null && writeValue !== null && writeValue !== undefined) {
      sv.firstWriteValue = writeValue;
      sv.firstWriteFunction = owner;
      sv.firstWriteLine = line || 0;
    }
    // Detect dual-write pattern (setState + setChatVar for same key → number type)
    if (apiName === "setState" && sv.apis.has("setChatVar")) sv.hasDualWrite = true;
    if (apiName === "setChatVar" && sv.apis.has("setState")) sv.hasDualWrite = true;
  }
  if (!fnName) return;
  for (const f of ensureFnIndex(fnName)) {
    if (rw === "read") f.stateReads.add(key);
    if (rw === "write") f.stateWrites.add(key);
  }
}

function addDataTable(name, tableNode, depth) {
  if (!tableNode || tableNode.type !== "TableConstructorExpression") return;
  const fields = safeArray(tableNode.fields);
  if (fields.length < 3) return;
  collected.dataTables.push({ name: name || `table_l${lineStart(tableNode)}`, fieldCount: fields.length, startLine: lineStart(tableNode), endLine: lineEnd(tableNode), depth: depth || 0 });
}

function findAsyncFn(callNode) {
  if (!callNode || callNode.type !== "CallExpression") return null;
  if (directCalleeName(callNode) !== "async") return null;
  const args = callArgs(callNode);
  return args[0] && args[0].type === "FunctionDeclaration" ? args[0] : null;
}

function handleCallExpr(node, explicitParent) {
  const caller = currentFn(explicitParent);
  const callee = directCalleeName(node);
  if (!callee) return;
  collected.calls.push({ caller, callee, line: lineStart(node) });
  if (!RISUAI_API[callee]) return;
  addApiCall(callee, lineStart(node), caller);
  if (callee === "setChatVar" || callee === "getChatVar" || callee === "setState" || callee === "getState") {
    const key = strLit(callArgs(node)[1]);
    const writeValue = (callee === "setChatVar") ? strLit(callArgs(node)[2]) : null;
    if (key) addStateAccess(callee, key, caller, lineStart(node), writeValue);
  }
  if (callee === "getLoreBooks" || callee === "loadLoreBooks") {
    const keyword = strLit(callArgs(node)[1]);
    if (keyword) {
      collected.loreApiCalls.push({ apiName: callee, keyword, line: lineStart(node), containingFunction: caller || "<top-level>" });
    }
  }
  if (callee === "upsertLocalLoreBook") {
    collected.loreApiCalls.push({ apiName: callee, keyword: null, line: lineStart(node), containingFunction: caller || "<top-level>" });
  }
}

function walk(node, explicitParent) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, explicitParent);
    return;
  }

  if (node.type === "FunctionDeclaration") {
    const k = nodeKey(node);
    let rec;
    if (!fnHandled.has(k)) {
      rec = registerFunction(node, exprName(node.identifier) || `anonymous_l${lineStart(node)}`, { isLocal: Boolean(node.isLocal), isAsync: false, parentFunction: currentFn(explicitParent) });
    } else {
      const fallbackName = sanitizeName(exprName(node.identifier) || `anonymous_l${lineStart(node)}`, `fn_l${lineStart(node)}`).replace(/-/g, "_");
      rec = ensureFnIndex(fallbackName)[0] || null;
    }
    const fnName = rec ? rec.name : currentFn(explicitParent);
    const declaredName = exprName(node.identifier);
    if (["onStart", "onInput", "onOutput", "onButtonClick"].includes(declaredName || "")) {
      markHandler(declaredName, lineStart(node), Boolean(rec && rec.isAsync), rec ? rec.name : null, declaredName);
    }
    fnStack.push(fnName);
    walk(node.body, fnName);
    fnStack.pop();
    return;
  }

  if (node.type === "LocalStatement" || node.type === "AssignmentStatement") {
    const isLocalAssign = node.type === "LocalStatement";
    const vars = safeArray(node.variables);
    const init = safeArray(node.init);
    for (let i = 0; i < init.length; i++) {
      const lhs = vars[i];
      const rhs = init[i];
      const targetName = assignName(lhs) || `fn_l${lineStart(rhs)}`;
      if (rhs && rhs.type === "FunctionDeclaration") {
        const rec = registerFunction(rhs, targetName, { isLocal: isLocalAssign, isAsync: false, parentFunction: currentFn(explicitParent) });
        if (["onStart", "onInput", "onOutput", "onButtonClick"].includes(targetName)) markHandler(targetName, lineStart(rhs), false, rec.name, targetName);
        fnStack.push(rec.name);
        walk(rhs.body, rec.name);
        fnStack.pop();
        continue;
      }
      const asyncFn = findAsyncFn(rhs);
      if (asyncFn) {
        const rec = registerFunction(asyncFn, targetName, { isLocal: isLocalAssign, isAsync: true, parentFunction: currentFn(explicitParent) });
        if (["onInput", "onOutput", "onButtonClick"].includes(targetName)) markHandler(targetName, lineStart(rhs), true, rec.name, targetName);
        fnStack.push(rec.name);
        walk(asyncFn.body, rec.name);
        fnStack.pop();
        continue;
      }
      if (rhs && rhs.type === "TableConstructorExpression") addDataTable(targetName, rhs, fnStack.length);
      walk(rhs, explicitParent);
    }
    for (const v of vars) walk(v, explicitParent);
    return;
  }

  if (node.type === "CallStatement") {
    const expr = node.expression;
    const callee = directCalleeName(expr);
    if (callee === "listenEdit") {
      const args = callArgs(expr);
      const eventType = strLit(args[0]) || "unknown";
      const fnArg = args[1];
      if (fnArg && fnArg.type === "FunctionDeclaration") {
        const rec = registerFunction(fnArg, `listenEdit_${eventType}_l${lineStart(fnArg)}`, { isLocal: false, isAsync: false, parentFunction: currentFn(explicitParent), isListenEditHandler: true, listenEditEventType: eventType });
        markHandler("listenEdit", lineStart(expr), false, rec.name, eventType);
        fnStack.push(rec.name);
        walk(fnArg.body, rec.name);
        fnStack.pop();
      }
    }
    walk(expr, explicitParent);
    return;
  }

  if (node.type === "CallExpression") {
    handleCallExpr(node, explicitParent);
    walk(node.base, explicitParent);
    for (const a of callArgs(node)) walk(a, explicitParent);
    return;
  }

  for (const v of Object.values(node)) {
    if (!v) continue;
    if (Array.isArray(v)) {
      for (const c of v) walk(c, explicitParent);
    } else if (typeof v === "object") walk(v, explicitParent);
  }
}

walk(body, null);

  return {
    collected,
  };
}

module.exports = {
  runCollectPhase,
};
