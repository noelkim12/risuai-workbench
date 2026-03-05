function runAnalyzePhase(context) {
  const {
    comments,
    total,
    collected,
    RISUAI_API,
    LUA_STDLIB_CALLS,
    lineStart,
    sanitizeName,
    toModuleName,
    maxBlankRun,
  } = context;

  const isSectionSeparatorComment = (v) => {
    const t = String(v || "").trim();
    return /^[\s=═-]{3,}$/.test(t) || /[=═]{3,}/.test(t);
  };

function collectCommentSections() {
  const sorted = [...comments].sort((a, b) => lineStart(a) - lineStart(b));
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (!isSectionSeparatorComment(c.value)) continue;
    let title = null;
    for (let j = i + 1; j < sorted.length; j++) {
      const n = sorted[j];
      if (lineStart(n) - lineStart(c) > 3) break;
      const t = String(n.value || "").trim();
      if (!t || isSectionSeparatorComment(t)) continue;
      title = t.replace(/^[-=\s═]+/, "").replace(/[-=\s═]+$/, "").trim();
      if (title) break;
    }
    out.push({ title: title || `섹션 L${lineStart(c)}`, line: lineStart(c), source: "comment" });
  }
  out.sort((a, b) => a.line - b.line);
  const dedup = [];
  for (const s of out) if (!dedup.length || dedup[dedup.length - 1].line !== s.line) dedup.push(s);
  return dedup;
}

function collectPrefixSections() {
  const out = [];
  for (const [prefix, list] of collected.prefixBuckets.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.startLine - b.startLine);
    out.push({ title: `${prefix}_*`, line: sorted[0].startLine, source: "prefix", prefix, endLineHint: sorted[sorted.length - 1].endLine });
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

function collectGapSections() {
  const sorted = [...collected.functions].sort((a, b) => a.startLine - b.startLine);
  const out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (maxBlankRun(sorted[i].endLine + 1, sorted[i + 1].startLine - 1) > 3) {
      out.push({ title: `클러스터 L${sorted[i + 1].startLine}`, line: sorted[i + 1].startLine, source: "blank-gap" });
    }
  }
  return out;
}

function materializeSections(signals) {
  const sorted = [...signals].sort((a, b) => a.line - b.line);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push({ title: sorted[i].title, source: sorted[i].source, startLine: sorted[i].line, endLine: i + 1 < sorted.length ? sorted[i + 1].line - 1 : total });
  }
  return out.filter((s) => s.endLine >= s.startLine);
}

const commentSections = collectCommentSections();
const prefixSections = collectPrefixSections();
const gapSections = collectGapSections();
let signals;
const noisyCommentSections = commentSections.length > Math.max(60, Math.floor(collected.functions.length * 0.6));
if (commentSections.length && !noisyCommentSections) signals = commentSections;
else if (prefixSections.length) signals = prefixSections;
else if (gapSections.length) signals = [{ title: "전체", line: 1, source: "default" }, ...gapSections];
else signals = [{ title: "전체", line: 1, source: "default" }];
const sections = materializeSections(signals);

function buildSectionMapSections() {
  const commentMap = commentSections.length ? materializeSections(commentSections) : [];
  if (commentMap.length) {
    const minSize = Math.max(20, Math.floor(total * 0.003));
    const filtered = commentMap.filter((s) => {
      const size = s.endLine - s.startLine + 1;
      const t = String(s.title || "").trim();
      if (!t) return false;
      if (size < minSize && s.startLine > 300) return false;
      if (/^섹션\s+L\d+$/i.test(t)) return false;
      return true;
    });
    if (filtered.length) return filtered.slice(0, 40);
    return commentMap.slice(0, 40);
  }
  return sections.slice(0, 40);
}

const sectionMapSections = buildSectionMapSections();

const callGraph = new Map();
for (const fn of collected.functions) if (!callGraph.has(fn.name)) callGraph.set(fn.name, new Set());
for (const c of collected.calls) {
  if (!c.caller || !c.callee) continue;
  if (LUA_STDLIB_CALLS.has(c.callee) || RISUAI_API[c.callee]) continue;
  const normalizedCallee = sanitizeName(c.callee, c.callee).replace(/-/g, "_");
  if (!callGraph.has(c.caller)) callGraph.set(c.caller, new Set());
  callGraph.get(c.caller).add(normalizedCallee);
}

const calledBy = new Map();
for (const [caller, targets] of callGraph.entries()) {
  for (const t of targets) {
    if (!calledBy.has(t)) calledBy.set(t, new Set());
    calledBy.get(t).add(caller);
  }
}

const apiByCategory = new Map();
for (const a of collected.apiCalls) {
  if (!apiByCategory.has(a.category)) apiByCategory.set(a.category, { apis: new Set(), count: 0 });
  const row = apiByCategory.get(a.category);
  row.apis.add(a.apiName);
  row.count += 1;
}

const moduleGroups = [];
const moduleByFunction = new Map();

function createGroup(seed) {
  const g = {
    name: toModuleName(seed.name) || `module_${moduleGroups.length + 1}`,
    title: seed.title || seed.name,
    reason: seed.reason || "heuristic",
    source: seed.source || "heuristic",
    functions: new Set(),
    tables: new Set(),
    apiCats: new Set(),
    stateKeys: new Set(),
    dir: "tstl/modules",
  };
  moduleGroups.push(g);
  return g;
}

function addFnToGroup(group, fn) {
  if (moduleByFunction.has(fn.name)) return;
  group.functions.add(fn.name);
  moduleByFunction.set(fn.name, group.name);
  for (const c of fn.apiCategories) group.apiCats.add(c);
  for (const k of fn.stateReads) group.stateKeys.add(k);
  for (const k of fn.stateWrites) group.stateKeys.add(k);
}

// ── Containment tree ─────────────────────────────────────
const childrenOf = new Map();
const rootFunctions = [];

for (const fn of collected.functions) {
  if (fn.parentFunction && collected.functionIndexByName.has(fn.parentFunction)) {
    if (!childrenOf.has(fn.parentFunction)) childrenOf.set(fn.parentFunction, []);
    childrenOf.get(fn.parentFunction).push(fn);
  } else {
    rootFunctions.push(fn);
  }
}

function getDescendants(fnName) {
  const result = [];
  for (const child of (childrenOf.get(fnName) || [])) {
    result.push(child);
    result.push(...getDescendants(child.name));
  }
  return result;
}

function addFnTreeToGroup(group, fn) {
  addFnToGroup(group, fn);
  for (const desc of getDescendants(fn.name)) addFnToGroup(group, desc);
}


// ── Repetitive naming pattern detection ──────────────────
function detectRepetitiveGroups() {
  const patterns = new Map();
  for (const fn of rootFunctions) {
    const name = fn.displayName;
    let base = null;
    const m1 = name.match(/^(.+?)_\d+_\w+$/);
    if (m1 && m1[1].length >= 3) base = m1[1];
    if (!base) {
      const m2 = name.match(/^(.+?)\d+$/);
      if (m2 && m2[1].length >= 3) base = m2[1];
    }
    if (base) {
      if (!patterns.has(base)) patterns.set(base, []);
      patterns.get(base).push(fn);
    }
  }
  return new Map([...patterns].filter(([_, fns]) => fns.length >= 3));
}
const repetitiveGroups = detectRepetitiveGroups();

// ── Step 1: Event handler modules ────────────────────────
for (const fn of rootFunctions) {
  const isMainHandler = ["onStart", "onInput", "onOutput", "onButtonClick"].includes(fn.displayName);
  if (!isMainHandler && !fn.isListenEditHandler) continue;
  if (moduleByFunction.has(fn.name)) continue;
  const modName = fn.isListenEditHandler ? `listener_${fn.listenEditEventType || "unknown"}` : fn.displayName;
  const g = createGroup({ name: modName, title: modName, reason: "event-handler", source: "handler" });
  addFnTreeToGroup(g, fn);
}

// ── Step 2: Repetitive pattern modules ───────────────────
for (const [pattern, fns] of repetitiveGroups) {
  if (fns.every((fn) => moduleByFunction.has(fn.name))) continue;
  const g = createGroup({ name: pattern, title: `${pattern}_* (${fns.length} functions)`, reason: "repetitive-pattern", source: "pattern" });
  for (const fn of fns) if (!moduleByFunction.has(fn.name)) addFnTreeToGroup(g, fn);
}

// ── Step 2.5: Widely-called functions → shared utilities ──
const widelyUsedFns = [];
for (const fn of rootFunctions) {
  if (moduleByFunction.has(fn.name)) continue;
  if (fn.lineCount > 30) continue;
  const callerMods = new Set();
  for (const [caller, targets] of callGraph.entries()) {
    if (targets.has(fn.name) && moduleByFunction.has(caller)) {
      callerMods.add(moduleByFunction.get(caller));
    }
  }
  if (callerMods.size >= 2) widelyUsedFns.push(fn);
}
if (widelyUsedFns.length > 0) {
  const g = createGroup({ name: "shared", title: "Shared Functions", reason: "widely-used", source: "cross-module" });
  for (const fn of widelyUsedFns) addFnTreeToGroup(g, fn);
}

// ── Step 3: Agglomerative function clustering ────────────
const unassigned = rootFunctions.filter((fn) => !moduleByFunction.has(fn.name));

function pairScore(a, b) {
  let score = 0;
  const callsA = callGraph.get(a.name) || new Set();
  const callsB = callGraph.get(b.name) || new Set();
  if (callsA.has(b.name)) score += 5;
  if (callsB.has(a.name)) score += 5;
  const stateA = new Set([...a.stateReads, ...a.stateWrites]);
  const stateB = new Set([...b.stateReads, ...b.stateWrites]);
  for (const k of stateA) if (stateB.has(k)) score += 3;
  for (const t of callsA) if (callsB.has(t)) score += 1;
  const calledByA = calledBy.get(a.name) || new Set();
  const calledByB = calledBy.get(b.name) || new Set();
  for (const c of calledByA) if (calledByB.has(c)) score += 1;
  return score;
}

// Precompute pairwise scores
const pairScoreCache = new Map();
for (let i = 0; i < unassigned.length; i++) {
  for (let j = i + 1; j < unassigned.length; j++) {
    const a = unassigned[i], b = unassigned[j];
    const s = pairScore(a, b);
    if (s > 0) {
      pairScoreCache.set(`${a.name}\0${b.name}`, s);
      pairScoreCache.set(`${b.name}\0${a.name}`, s);
    }
  }
}
function getCachedScore(a, b) { return pairScoreCache.get(`${a.name}\0${b.name}`) || 0; }

// Initial clusters: one per function
let clusters = unassigned.map((fn) => ({ fns: [fn] }));

// Agglomerative merge (single linkage, max 12 functions per cluster)
while (clusters.length > 1) {
  let bestI = -1, bestJ = -1, bestMax = 0;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (clusters[i].fns.length + clusters[j].fns.length > 12) continue;
      let maxScore = 0;
      for (const a of clusters[i].fns) {
        for (const b of clusters[j].fns) {
          const s = getCachedScore(a, b);
          if (s > maxScore) maxScore = s;
        }
      }
      if (maxScore > bestMax) { bestI = i; bestJ = j; bestMax = maxScore; }
    }
  }
  if (bestMax < 6) break;
  clusters[bestI].fns.push(...clusters[bestJ].fns);
  clusters.splice(bestJ, 1);
}

// Create modules from clusters
for (const cluster of clusters) {
  if (!cluster.fns.length) continue;
  if (cluster.fns.length === 1 && cluster.fns[0].lineCount < 200) continue;
  // Pick most "central" function (most intra-cluster connections) for naming
  let bestNameFn = cluster.fns[0];
  let bestConns = -1;
  for (const fn of cluster.fns) {
    let conns = 0;
    const callees = callGraph.get(fn.name) || new Set();
    for (const callee of callees) if (cluster.fns.some(f => f.name === callee)) conns++;
    const callers = calledBy.get(fn.name) || new Set();
    for (const caller of callers) if (cluster.fns.some(f => f.name === caller)) conns++;
    if (conns > bestConns || (conns === bestConns && fn.lineCount > bestNameFn.lineCount)) {
      bestConns = conns;
      bestNameFn = fn;
    }
  }
  const g = createGroup({
    name: bestNameFn.displayName,
    title: bestNameFn.displayName,
    reason: cluster.fns.length > 1 ? "function-cluster" : "standalone-function",
    source: "function"
  });
  for (const fn of cluster.fns) addFnTreeToGroup(g, fn);
}

// 3d: Absorb remaining singletons (skip handler modules to avoid bloat)
for (const fn of rootFunctions) {
  if (moduleByFunction.has(fn.name)) continue;
  let best = null;
  let bestScore = 0;
  for (const g of moduleGroups) {
    if (g.reason === "event-handler" || g.reason === "widely-used") continue;
    let score = 0;
    const fState = new Set([...fn.stateReads, ...fn.stateWrites]);
    for (const k of fState) if (g.stateKeys.has(k)) score += 3;
    for (const t of (callGraph.get(fn.name) || [])) if (g.functions.has(t)) score += 2;
    for (const [caller, targets] of callGraph.entries()) {
      if (targets.has(fn.name) && g.functions.has(caller)) score += 2;
    }
    for (const c of fn.apiCategories) if (g.apiCats.has(c)) score += 1;
    if (score > bestScore) { best = g; bestScore = score; }
  }
  if (best && bestScore >= 3) {
    addFnTreeToGroup(best, fn);
  }
}

// ── Step 5: Remaining → utils / misc ─────────────────────
const remaining = rootFunctions.filter((fn) => !moduleByFunction.has(fn.name));
if (remaining.length > 0) {
  const utilities = remaining.filter((fn) => fn.apiNames.size === 0 && fn.stateReads.size === 0 && fn.stateWrites.size === 0);
  const misc = remaining.filter((fn) => fn.apiNames.size > 0 || fn.stateReads.size > 0 || fn.stateWrites.size > 0);
  if (utilities.length) {
    const g = createGroup({ name: "helpers", title: "Helper Utilities", reason: "pure-utility", source: "utility" });
    for (const fn of utilities) addFnTreeToGroup(g, fn);
  }
  if (misc.length) {
    const g = createGroup({ name: "misc", title: "Miscellaneous", reason: "uncategorized", source: "misc" });
    for (const fn of misc) addFnTreeToGroup(g, fn);
  }
}

// ── Step 6: Top-level data tables only ───────────────────
for (const t of collected.dataTables) {
  if (t.depth > 0) continue;
  const name = sanitizeName(t.name, `data_${moduleGroups.length + 1}`);
  let g = moduleGroups.find((x) => x.name === name);
  if (!g) g = createGroup({ name, title: t.name, reason: "data-table", source: "table" });
  g.tables.add(t.name);
}

// ── Step 7: Directory assignment ─────────────────────────
for (const g of moduleGroups) {
  const fns = [...g.functions].map((n) => (collected.functionIndexByName.get(n) || [])[0]).filter(Boolean);
  const hasListenEdit = fns.some((f) => f.isListenEditHandler);
  const isHandler = g.reason === "event-handler";
  const onlyStdlib = fns.length > 0 && fns.every((f) => f.apiNames.size === 0);
  const isPureData = g.tables.size > 0 && g.functions.size === 0;
  if (isPureData) g.dir = "tstl/data";
  else if (hasListenEdit || isHandler) g.dir = "tstl/handlers";
  else if (g.reason === "pure-utility" || onlyStdlib) g.dir = "tstl/utils";
  else g.dir = "tstl/modules";
}

// ── Dedup ────────────────────────────────────────────────
const dedupedGroups = new Map();
for (const g of moduleGroups) {
  if (!g.functions.size && !g.tables.size) continue;
  const key = `${g.dir}/${g.name}`;
  const found = dedupedGroups.get(key);
  if (!found) {
    dedupedGroups.set(key, g);
    continue;
  }
  for (const fn of g.functions) found.functions.add(fn);
  for (const tb of g.tables) found.tables.add(tb);
  for (const c of g.apiCats) found.apiCats.add(c);
  for (const k of g.stateKeys) found.stateKeys.add(k);
}
moduleGroups.length = 0;
for (const g of dedupedGroups.values()) moduleGroups.push(g);

const stateOwnership = [];
for (const [key, access] of collected.stateVars.entries()) {
  const writers = [...access.writtenBy].filter((n) => n !== "<top-level>");
  const readBy = [...access.readBy].filter((n) => n !== "<top-level>");
  const writerModuleCount = new Map();
  for (const fn of writers) {
    const mod = moduleByFunction.get(fn) || "(unassigned)";
    writerModuleCount.set(mod, (writerModuleCount.get(mod) || 0) + 1);
  }
  let ownerModule = "(none)";
  let ownerCount = -1;
  for (const [mod, count] of writerModuleCount.entries()) {
    if (count > ownerCount) {
      ownerModule = mod;
      ownerCount = count;
    }
  }
  const mods = new Set([...writers, ...readBy].map((f) => moduleByFunction.get(f) || "(unassigned)"));
  stateOwnership.push({ key, readBy, writers, ownerModule, crossModule: mods.size > 1 });
}
stateOwnership.sort((a, b) => a.key.localeCompare(b.key));

// ── Chat Variable Registry: init pattern detection ──
const registryVars = [];
for (const [key, access] of collected.stateVars.entries()) {
  // Only setChatVar-based variables (not pure setState)
  if (!access.apis.has("setChatVar") && !access.apis.has("getChatVar")) continue;
  const fn = access.firstWriteFunction;
  let isInitPattern = false;
  if (fn) {
    const lcFn = fn.toLowerCase();
    if (lcFn.includes("init") || lcFn === "onstart" || lcFn === "<top-level>") {
      isInitPattern = true;
    }
  }
  // Determine suggested type: dual-write or numeric-looking default → number
  const fwv = access.firstWriteValue;
  const looksNumeric = fwv !== null && /^-?\d+(\.\d+)?$/.test(fwv);
  const suggestNumber = access.hasDualWrite || (looksNumeric && access.apis.has("setState"));
  registryVars.push({
    key,
    suggestedDefault: fwv !== null ? fwv : "",
    suggestNumber,
    isInitPattern,
    readCount: access.readBy.size,
    writeCount: access.writtenBy.size,
    firstWriteFunction: access.firstWriteFunction || "-",
    hasDualWrite: access.hasDualWrite,
  });
}
registryVars.sort((a, b) => {
  // Init pattern first, then by key name
  if (a.isInitPattern !== b.isInitPattern) return a.isInitPattern ? -1 : 1;
  return a.key.localeCompare(b.key);
});

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
  };
}

module.exports = {
  runAnalyzePhase,
};
