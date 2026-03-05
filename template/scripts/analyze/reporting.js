const { renderHtml } = require("./reporting/htmlRenderer");

function runReporting(context) {
  const {
    fs,
    path,
    filePath,
    markdownMode,
    htmlMode,
    total,
    lines,
    commentSections,
    sectionMapSections,
    collected,
    stateOwnership,
    apiByCategory,
    moduleGroups,
    moduleByFunction,
    calledBy,
    callGraph,
    registryVars,
    lorebookCorrelation,
    regexCorrelation,
    RISUAI_API,
    MAX_MODULES_IN_REPORT,
    sanitizeName,
    rootFunctions,
    getDescendants,
  } = context;

// ═══════════════════════════════════════════════════════════
// PHASE 4: FORMAT — console output + markdown report
// ═══════════════════════════════════════════════════════════

function bar(size) {
  const n = Math.max(1, Math.round((size / total) * 30));
  return "█".repeat(n) + "░".repeat(30 - n);
}

function printSections() {
  console.log("  ════════════════════════════════════════");
  console.log("  섹션 맵");
  console.log("  ────────────────────────────────────────");
  if (!sectionMapSections.length) {
    console.log("  (없음)");
    return;
  }
  for (const s of sectionMapSections) {
    const size = s.endLine - s.startLine + 1;
    console.log(`  ${String(s.startLine).padStart(5)}  ${bar(size)} ${s.title} (${size})`);
  }
  if (sectionMapSections.length < commentSections.length) {
    console.log(`  ... ${commentSections.length - sectionMapSections.length}개 섹션은 요약에서 생략됨`);
  }
}

function printTopFunctions() {
  const sorted = [...collected.functions].sort((a, b) => b.lineCount - a.lineCount).slice(0, 20);
  console.log("\n  ────────────────────────────────────────");
  console.log(`  거대 함수 TOP ${sorted.length}`);
  console.log("  ────────────────────────────────────────");
  for (const fn of sorted) {
    const pct = total > 0 ? ((fn.lineCount / total) * 100).toFixed(1) : "0.0";
    const warn = fn.lineCount > 500 ? " ⚠️  분할 권장" : fn.lineCount > 200 ? " ⚡" : "";
    console.log(`  ${String(fn.lineCount).padStart(5)} (${pct}%)  ${fn.isLocal ? "local " : ""}${fn.displayName}${fn.isAsync ? " async" : ""}  [${fn.startLine}~${fn.endLine}]${warn}`);
  }
}

function printHandlers() {
  console.log("\n  ────────────────────────────────────────");
  console.log("  이벤트 핸들러");
  console.log("  ────────────────────────────────────────");
  if (!collected.handlers.length) {
    console.log("  (없음)");
    return;
  }
  for (const h of collected.handlers) {
    const detail = h.type === "listenEdit" ? ` (${h.detail})` : "";
    console.log(`  L${String(h.line).padStart(5)}  👂 ${h.type}${detail} [${h.isAsync ? "async" : "sync"}]`);
  }
}

function printStateVars() {
  console.log("\n  ────────────────────────────────────────");
  console.log(`  상태 변수 (${stateOwnership.length}개)`);
  console.log("  ────────────────────────────────────────");
  if (!stateOwnership.length) {
    console.log("  (없음)");
    return;
  }
  for (const s of stateOwnership.slice(0, 30)) {
    console.log(`  💾 ${s.key}  R:${s.readBy.length} W:${s.writers.length} owner:${s.ownerModule}${s.crossModule ? " ⚠️" : ""}`);
  }
  if (stateOwnership.length > 30) console.log(`  ... +${stateOwnership.length - 30} more`);
}

function printApiUsage() {
  console.log("\n  ────────────────────────────────────────");
  console.log("  RisuAI API 사용량");
  console.log("  ────────────────────────────────────────");
  if (!apiByCategory.size) {
    console.log("  (없음)");
    return;
  }
  for (const [cat, info] of [...apiByCategory.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const apis = [...info.apis].sort();
    const icon = cat === "state" ? "💾" : cat === "event" ? "👂" : cat === "ai" ? "⚡" : "📋";
    console.log(`  ${icon} ${cat.padEnd(10)} ${String(info.count).padStart(4)} calls  ${apis.slice(0, 4).join(", ")}${apis.length > 4 ? ` +${apis.length - 4}` : ""}`);
  }
}

function printModules() {
  console.log("\n  ════════════════════════════════════════");
  console.log("  📋 제안 모듈 구조");
  console.log("  ════════════════════════════════════════\n");
  const sorted = [...moduleGroups].sort((a, b) => `${a.dir}/${a.name}`.localeCompare(`${b.dir}/${b.name}`));
  const shown = sorted.slice(0, MAX_MODULES_IN_REPORT);
  for (const g of shown) {
    const icon = g.dir === "tstl/utils" ? "🔧" : g.dir === "tstl/handlers" ? "👂" : g.dir === "tstl/data" ? "💾" : "📦";
    const fns = [...g.functions];
    console.log(`  ${icon} ${g.dir}/${g.name}.ts${fns.length >= 12 ? " ⚠️" : ""}`);
    console.log(`     ${g.title} (${g.reason})`);
    for (const fn of fns.slice(0, 8)) {
      const rec = (collected.functionIndexByName.get(fn) || [])[0];
      if (!rec) continue;
      const nested = rec.parentFunction && moduleByFunction.get(rec.parentFunction) === moduleByFunction.get(rec.name);
      console.log(`     ${nested ? "↳" : "·"} ${rec.displayName}${rec.isAsync ? " [async]" : ""}`);
    }
    if (fns.length > 8) console.log(`     · +${fns.length - 8} more`);
    for (const t of g.tables) console.log(`     · table ${t}`);
    console.log("");
  }
  if (sorted.length > shown.length) {
    console.log(`  ... ${sorted.length - shown.length}개 모듈은 보고서 가독성을 위해 생략됨`);
    console.log("  (마크다운 파일에도 동일한 제한이 적용됩니다)");
    console.log("");
  }
}

function printRegistrySuggestion() {
  if (!registryVars.length) return;
  const MAX_CONSOLE_VARS = 20;
  console.log("\n  ════════════════════════════════════════");
  console.log(`  📋 Chat Variable Registry 제안 (${registryVars.length}개)`);
  console.log("  ────────────────────────────────────────");
  for (const v of registryVars.slice(0, MAX_CONSOLE_VARS)) {
    const type = v.suggestNumber ? "num" : "str";
    const init = v.isInitPattern ? "✓ init" : "      ";
    const dual = v.hasDualWrite ? " ↔" : "  ";
    const def = v.suggestedDefault !== "" ? v.suggestedDefault : '""';
    console.log(`  ${init}${dual} ${type.padEnd(3)} ${v.key.padEnd(30)} = ${def}  (R:${v.readCount} W:${v.writeCount})`);
  }
  if (registryVars.length > MAX_CONSOLE_VARS) {
    console.log(`  ... +${registryVars.length - MAX_CONSOLE_VARS} more (마크다운 참조)`);
  }
  console.log("");
}

function printSummary() {
  console.log("  ────────────────────────────────────────");
  console.log("  📊 요약");
  console.log(`     ${total} lines / ${collected.functions.length} functions / ${collected.handlers.length} handlers / ${collected.apiCalls.length} API calls`);
  console.log(`     500줄+ 함수: ${collected.functions.filter((f) => f.lineCount > 500).length}개 (분할 권장)`);
  console.log(`     200줄+ 함수: ${collected.functions.filter((f) => f.lineCount > 200).length}개`);
  console.log(`     상태 변수: ${stateOwnership.length}개 / 제안 모듈: ${moduleGroups.length}개`);
  console.log("");
}

printSections();
printTopFunctions();
printHandlers();
printStateVars();
printApiUsage();
printModules();
printRegistrySuggestion();
printSummary();

function printLorebookCorrelation() {
  if (!lorebookCorrelation) return;
  const lc = lorebookCorrelation;

  console.log("\n  ════════════════════════════════════════");
  console.log(`  📚 Lua↔Lorebook 상관관계`);
  console.log("  ────────────────────────────────────────");
  console.log(`     Lorebook: ${lc.totalEntries}개 엔트리 / ${lc.totalFolders}개 폴더`);
  console.log(`     Bridge 변수: ${lc.bridgedVars.length}개 (Lua↔Lorebook 공유)`);
  console.log(`     Lua 전용: ${lc.luaOnlyVars.length}개 / Lorebook 전용: ${lc.lorebookOnlyVars.length}개`);
  if (lc.loreApiCalls.length > 0) {
    console.log(`     Lorebook API: ${lc.loreApiCalls.length}개 호출`);
  }
  console.log("");

  if (lc.bridgedVars.length > 0) {
    console.log("  Bridge 변수 (Lua↔Lorebook):");
    for (const c of lc.bridgedVars.slice(0, 25)) {
      const dir = c.direction === "lua→lorebook" ? "→" : c.direction === "lorebook→lua" ? "←" : "↔";
      const luaSide = [...c.luaWriters, ...c.luaReaders].slice(0, 3).join(", ");
      const lbSide = [...c.lorebookReaders, ...c.lorebookWriters].slice(0, 3).join(", ");
      console.log(`  ${dir} ${c.varName.padEnd(30)} Lua:[${luaSide}] ↔ LB:[${lbSide}]`);
    }
    if (lc.bridgedVars.length > 25) console.log(`  ... +${lc.bridgedVars.length - 25} more`);
    console.log("");
  }

  if (lc.loreApiCalls.length > 0) {
    console.log("  Lorebook API 직접 호출:");
    for (const call of lc.loreApiCalls.slice(0, 15)) {
      const keyword = call.keyword ? ` "${call.keyword}"` : "";
      console.log(`  L${String(call.line).padStart(5)}  ${call.apiName}${keyword}  ← ${call.containingFunction}`);
    }
    if (lc.loreApiCalls.length > 15) console.log(`  ... +${lc.loreApiCalls.length - 15} more`);
    console.log("");
  }
}
printLorebookCorrelation();

function printRegexCorrelation() {
  if (!regexCorrelation) return;
  const rc = regexCorrelation;

  console.log("\n  ════════════════════════════════════════");
  console.log("  🔄 Lua↔Regex 상관관계");
  console.log("  ────────────────────────────────────────");
  console.log(`     Regex: ${rc.totalScripts}개 스크립트 / ${rc.activeScripts}개 활성`);
  console.log(`     Bridge 변수: ${rc.bridgedVars.length}개 (Lua↔Regex 공유)`);
  console.log(`     Lua 전용: ${rc.luaOnlyVars.length}개 / Regex 전용: ${rc.regexOnlyVars.length}개`);
  console.log("");

  if (rc.bridgedVars.length > 0) {
    console.log("  Bridge 변수 (Lua↔Regex):");
    for (const c of rc.bridgedVars.slice(0, 25)) {
      const dir = c.direction === "lua→regex" ? "→" : c.direction === "regex→lua" ? "←" : "↔";
      const luaSide = [...c.luaWriters, ...c.luaReaders].slice(0, 3).join(", ");
      const regexSide = [...c.regexReaders, ...c.regexWriters].slice(0, 3).join(", ");
      console.log(`  ${dir} ${c.varName.padEnd(30)} Lua:[${luaSide}] ↔ RX:[${regexSide}]`);
    }
    if (rc.bridgedVars.length > 25) console.log(`  ... +${rc.bridgedVars.length - 25} more`);
    console.log("");
  }
}
printRegexCorrelation();

const moduleFilePath = (g) => `${g.dir}/${g.name}.ts`;
const moduleFns = (g) => [...g.functions].map((n) => (collected.functionIndexByName.get(n) || [])[0]).filter(Boolean).sort((a, b) => a.startLine - b.startLine);
const mdRow = (arr) => `| ${arr.join(" | ")} |`;

function dependencyEdges() {
  const edges = new Set();
  for (const [caller, targets] of callGraph.entries()) {
    const from = moduleByFunction.get(caller);
    if (!from) continue;
    for (const callee of targets) {
      const to = moduleByFunction.get(callee);
      if (to && to !== from) edges.add(`${from}-->${to}`);
    }
  }
  return [...edges];
}

// ── Module interface computation ──────────────────────────

function computeModuleExports(g) {
  const exports = new Map();
  for (const fnName of g.functions) {
    const callers = calledBy.get(fnName) || new Set();
    for (const caller of callers) {
      const callerMod = moduleByFunction.get(caller);
      if (callerMod && callerMod !== g.name) {
        if (!exports.has(fnName)) exports.set(fnName, new Set());
        exports.get(fnName).add(callerMod);
      }
    }
  }
  return exports;
}

function computeModuleImports(g) {
  const imports = new Map();
  for (const fnName of g.functions) {
    const callees = callGraph.get(fnName) || new Set();
    for (const callee of callees) {
      const calleeMod = moduleByFunction.get(callee);
      if (calleeMod && calleeMod !== g.name) {
        if (!imports.has(callee)) imports.set(callee, calleeMod);
      }
    }
  }
  return imports;
}

function computeModuleStateVars(g) {
  const vars = [];
  for (const fnName of g.functions) {
    const fnRec = (collected.functionIndexByName.get(fnName) || [])[0];
    if (!fnRec) continue;
    for (const key of fnRec.stateReads) vars.push({ key, access: "read", fn: fnName });
    for (const key of fnRec.stateWrites) vars.push({ key, access: "write", fn: fnName });
  }
  const grouped = new Map();
  for (const v of vars) {
    const k = `${v.key}:${v.access}`;
    if (!grouped.has(k)) grouped.set(k, { key: v.key, access: v.access, fns: new Set() });
    grouped.get(k).fns.add(v.fn);
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key) || a.access.localeCompare(b.access));
}

function computeCrossModuleDeps() {
  const deps = new Map();
  for (const [caller, targets] of callGraph.entries()) {
    const fromMod = moduleByFunction.get(caller);
    if (!fromMod) continue;
    for (const callee of targets) {
      const toMod = moduleByFunction.get(callee);
      if (toMod && toMod !== fromMod) {
        const key = `${fromMod}\0${toMod}`;
        if (!deps.has(key)) deps.set(key, new Set());
        deps.get(key).add(callee);
      }
    }
  }
  return deps;
}

function computeExtractionOrder() {
  const modNames = moduleGroups.map(g => g.name);
  const modDeps = new Map();
  for (const name of modNames) modDeps.set(name, new Set());
  for (const g of moduleGroups) {
    for (const fnName of g.functions) {
      const callees = callGraph.get(fnName) || new Set();
      for (const callee of callees) {
        const calleeMod = moduleByFunction.get(callee);
        if (calleeMod && calleeMod !== g.name && modDeps.has(calleeMod)) {
          modDeps.get(g.name).add(calleeMod);
        }
      }
    }
  }
  const sorted = [];
  const remaining = new Set(modNames);
  const processed = new Set();
  while (remaining.size > 0) {
    const ready = [];
    for (const name of remaining) {
      const deps = modDeps.get(name) || new Set();
      let allDepsProcessed = true;
      for (const dep of deps) {
        if (!processed.has(dep)) { allDepsProcessed = false; break; }
      }
      if (allDepsProcessed) ready.push(name);
    }
    if (ready.length === 0) {
      sorted.push(...[...remaining].sort());
      break;
    }
    ready.sort((a, b) => {
      const ga = moduleGroups.find(g => g.name === a);
      const gb = moduleGroups.find(g => g.name === b);
      return (ga ? ga.functions.size : 0) - (gb ? gb.functions.size : 0);
    });
    for (const name of ready) {
      sorted.push(name);
      remaining.delete(name);
      processed.add(name);
    }
  }
  return sorted;
}

const MAX_SOURCE_LINES_PER_MODULE = 300;

function computeRelativeImport(fromGroup, toGroup) {
  const fromParts = fromGroup.dir.split("/");
  const toParts = toGroup.dir.split("/");
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++;
  const upSteps = fromParts.length - common;
  const downPath = toParts.slice(common).join("/");
  let relative = upSteps === 0 ? "." : Array(upSteps).fill("..").join("/");
  if (downPath) relative += "/" + downPath;
  return `${relative}/${toGroup.name}`;
}

function extractRootSourceChunks(g) {
  const fns = moduleFns(g);
  if (!fns.length && g.tables.size === 0) return [];
  const roots = fns.filter((fn) => {
    if (!fn.parentFunction) return true;
    return moduleByFunction.get(fn.parentFunction) !== g.name;
  });
  // Also include data tables as source chunks
  const chunks = [];
  for (const fn of roots) {
    const startIdx = Math.max(0, fn.startLine - 1);
    const endIdx = Math.min(total, fn.endLine);
    const sourceLines = [];
    for (let i = startIdx; i < endIdx; i++) sourceLines.push(lines[i]);
    chunks.push({
      name: fn.displayName,
      startLine: fn.startLine,
      endLine: fn.endLine,
      lineCount: fn.lineCount,
      isAsync: fn.isAsync,
      source: sourceLines.join("\n"),
    });
  }
  for (const t of collected.dataTables) {
    if (t.depth > 0) continue;
    const tName = sanitizeName(t.name, `data_${t.startLine}`);
    if (!g.tables.has(t.name)) continue;
    const startIdx = Math.max(0, t.startLine - 1);
    const endIdx = Math.min(total, t.endLine);
    const sourceLines = [];
    for (let i = startIdx; i < endIdx; i++) sourceLines.push(lines[i]);
    chunks.push({
      name: t.name,
      startLine: t.startLine,
      endLine: t.endLine,
      lineCount: t.endLine - t.startLine + 1,
      isAsync: false,
      source: sourceLines.join("\n"),
    });
  }
  chunks.sort((a, b) => a.startLine - b.startLine);
  return chunks;
}

function generateModuleConversionNotes(g) {
  const fns = moduleFns(g);
  const notes = [];
  // Async functions
  const asyncFns = fns.filter((f) => f.isAsync);
  if (asyncFns.length > 0) {
    notes.push(`Uses \`async()\` pattern: ${asyncFns.map((f) => f.displayName).join(", ")} → wrap with \`async((id: string) => { ... })\``);
  }
  // State variable patterns
  const modStateVars = computeModuleStateVars(g);
  const readKeys = [...new Set(modStateVars.filter((v) => v.access === "read").map((v) => v.key))];
  const writeKeys = [...new Set(modStateVars.filter((v) => v.access === "write").map((v) => v.key))];
  if (readKeys.length > 0 || writeKeys.length > 0) {
    const parts = [];
    if (readKeys.length > 0) parts.push(`read=[${readKeys.join(", ")}]`);
    if (writeKeys.length > 0) parts.push(`write=[${writeKeys.join(", ")}]`);
    notes.push(`State variables: ${parts.join(", ")} → convert to \`vars.get(id, key)\` / \`vars.set(id, key, value)\``);
  }
  // Low-level API calls
  const apiNames = new Set();
  for (const fnName of g.functions) {
    const fnRec = (collected.functionIndexByName.get(fnName) || [])[0];
    if (fnRec) for (const api of fnRec.apiNames) apiNames.add(api);
  }
  if (apiNames.size > 0) {
    const lowLevel = [...apiNames].filter((a) => RISUAI_API[a] && RISUAI_API[a].access === "low-level");
    if (lowLevel.length > 0) {
      notes.push(`Low-level API calls: ${lowLevel.join(", ")} → requires proper \`id\` parameter and error handling`);
    }
  }
  // Large functions warning
  const largeFns = fns.filter((f) => f.lineCount > 200);
  if (largeFns.length > 0) {
    notes.push(`Large functions (consider splitting): ${largeFns.map((f) => `${f.displayName} (${f.lineCount} lines)`).join(", ")}`);
  }
  // Handler patterns
  const handlers = fns.filter((f) => f.isListenEditHandler);
  if (handlers.length > 0) {
    notes.push(`listenEdit handlers: ${handlers.map((f) => `${f.displayName} (${f.listenEditEventType})`).join(", ")} → register in index.ts`);
  }
  // Main event handlers
  const mainHandlers = fns.filter((f) => ["onstart", "oninput", "onoutput", "onbuttonclick"].includes(f.displayName.toLowerCase()));
  if (mainHandlers.length > 0) {
    notes.push(`Event handlers: ${mainHandlers.map((f) => f.displayName).join(", ")} → assign to globals in index.ts`);
  }
  return notes;
}

function renderMarkdown() {
  const filename = path.basename(filePath);
  const crossDeps = computeCrossModuleDeps();
  const extractionOrder = computeExtractionOrder();
  const modByName = new Map(moduleGroups.map(g => [g.name, g]));
  const loreBridgeByVar = lorebookCorrelation
    ? new Map(lorebookCorrelation.bridgedVars.map((entry) => [entry.varName, entry]))
    : new Map();
  const regexBridgeByVar = regexCorrelation
    ? new Map(regexCorrelation.bridgedVars.map((entry) => [entry.varName, entry]))
    : new Map();
  const threeWayVars = [...loreBridgeByVar.keys()]
    .filter((varName) => regexBridgeByVar.has(varName))
    .sort();
  const listenEditHandlers = collected.handlers.filter((h) => h.type === "listenEdit");

  const out = [];

  out.push(`# ${filename} — Modularization Blueprint`);
  out.push("");
  out.push("> Auto-generated static analysis for AI-driven modularization.");
  out.push("> Source file is a monolithic Lua script for RisuAI character bundling.");
  out.push("> Use this document to extract functions into TypeScript modules.");
  out.push("");

  // ── Source Info ──
  out.push("## Source Info");
  out.push("| Metric | Value |");
  out.push("|--------|-------|");
  out.push(mdRow(["File", filename]));
  out.push(mdRow(["Total Lines", String(total)]));
  out.push(mdRow(["Functions (total)", String(collected.functions.length)]));
  out.push(mdRow(["Root Functions", String(rootFunctions.length)]));
  out.push(mdRow(["Event Handlers", String(collected.handlers.length)]));
  out.push(mdRow(["State Variables", String(stateOwnership.length)]));
  out.push(mdRow(["Suggested Modules", String(moduleGroups.length)]));
  out.push("");

  // ── Agent Instructions ──
  out.push("## Agent Instructions");
  out.push("");
  out.push("This document is a **work order** for converting a monolithic Lua script to TypeScript modules.");
  out.push("Each module specification includes the original Lua source, a pre-computed TS skeleton, and conversion notes.");
  out.push("");
  out.push("### Conversion Rules");
  out.push("");
  out.push("1. Convert modules in **Extraction Order** — earlier modules have no dependencies on later ones");
  out.push("2. Use `createRegistry()` for all `getChatVar`/`setChatVar`/`getState`/`setState` calls (see `tstl/utils/chatvar-registry.ts`)");
  out.push("3. Async functions: wrap with `async((id: string) => { ... })` — NOT native JS async/await");
  out.push("4. Use Lua patterns (not JS regex) — `%d+` not `\\\\d+`, `%s+` not `\\\\s+`");
  out.push("5. `string.gmatch` → use `collectMatches()` wrapper from `tstl/utils/lua.ts`");
  out.push("6. `string.gsub` → use `replace()` wrapper (returns string, not tuple)");
  out.push("7. Register all event handlers (`onInput`, `onOutput`, `onStart`, `onButtonClick`) and `listenEdit` calls in `tstl/index.ts`");
  out.push("8. Export functions that are called by other modules (see Exports table per module)");
  out.push("9. Run `npm run build` after each module to verify — TSTL compile errors surface at build time");
  out.push("");
  // ── Lorebook Correlation Rules (conditional) ──
  if (lorebookCorrelation && lorebookCorrelation.bridgedVars.length > 0) {
    out.push("### Lorebook Correlation Rules");
    out.push("");
    out.push("The Lua script shares state variables with lorebook entries via the CBS template system.");
    out.push("When converting Lua to TypeScript, these bindings MUST be preserved:");
    out.push("");
    out.push("1. **Variable name preservation**: State variables that bridge Lua↔Lorebook MUST keep their exact string keys");
    out.push("   - Lua `setChatVar(id, \"varName\", value)` → TS `vars.set(id, \"varName\", value)`");
    out.push("   - Lorebook reads this as `{{getvar::varName}}`");
    out.push("   - ⚠️ Renaming breaks the lorebook binding **silently** — no build-time error");
    out.push("2. **Initialization order**: Variables must be initialized BEFORE lorebook entries that use them become active");
    out.push("   - Variables set in `onStart` / init functions are safe — initialized before chat interaction");
    out.push("   - See the \"Bridge Variables\" table in the Lorebook Correlation section below");
    out.push("3. **Type preservation**: Lorebooks interpret ALL variables as strings via CBS templates");
    out.push("   - Even if Lua uses numeric operations, the lorebook sees the string representation");
    out.push("   - Dual-write pattern (`setState` + `setChatVar`) must be preserved for numeric variables");
    out.push("   - Example: Lua `setChatVar(id, \"display_mode\", \"2\")` → Lorebook `{{? {{getvar::display_mode}} == 2}}` (string comparison)");
    out.push("   - If TS code writes `vars.set(id, \"display_mode\", 2)` (number), the CBS conditional may break");
    out.push("4. **Lorebook API calls**: Direct lorebook access patterns must be preserved");
    out.push("   - `getLoreBooks(id, \"keyword\")` → loads entries matching the keyword");
    out.push("   - `loadLoreBooks(id, ...)` → loads entries into context");
    out.push("   - `upsertLocalLoreBook(id, entry)` → modifies entries at runtime");
    out.push("5. **Cross-reference the Lorebook Correlation section** at the bottom of this document");
    out.push("   - Each lorebook entry lists which variables it uses and which Lua functions it depends on");
    out.push("   - Use this to verify no bindings are broken during conversion");
    out.push("");
  }

  if (regexCorrelation && regexCorrelation.bridgedVars.length > 0) {
    out.push("### Regex Correlation Rules");
    out.push("");
    out.push("The Lua script shares state variables with regex(customScripts) entries via the CBS template system.");
    out.push("When converting Lua to TypeScript, these bindings MUST be preserved:");
    out.push("");
    out.push("1. **Variable name preservation**: State variables that bridge Lua↔Regex MUST keep their exact string keys");
    out.push("   - Lua `setChatVar(id, \"varName\", value)` → TS `vars.set(id, \"varName\", value)`");
    out.push("   - Regex reads/writes this via `{{getvar::varName}}`, `{{setvar::varName}}`, `{{addvar::varName}}`");
    out.push("   - ⚠️ Renaming breaks regex binding **silently** — no build-time error");
    out.push("2. **Regex type semantics**: Preserve execution intent by type");
    out.push("   - `editdisplay`: transforms AI output text into display HTML (post-response)");
    out.push("   - `editprocess`: rewrites message text before AI processing");
    out.push("   - `editdisplay` example: Regex matches marker `【INFO】` → outputs HTML with CSS + CBS variables for display");
    out.push("   - `editprocess` example: Regex captures structured Lua output → rewrites into AI context instructions with hidden information");
    out.push("3. **Output format bridge**: Lua markers trigger regex `editdisplay` HTML conversion");
    out.push("   - Lua emits a marker string (e.g. `【INFO】`) as plain text in chat output");
    out.push("   - Regex `editdisplay` matches the marker and replaces it with styled HTML + CSS");
    out.push("   - The replacement HTML often contains CBS variables (`{{getvar::...}}`) resolved at display time");
    out.push("   - ⚠️ Changing the marker string in Lua breaks the regex match — user sees raw marker text");
    out.push("   - See the \"Structured Text Marker Pipeline\" section below for the full marker mapping");
    out.push("4. **Conditional enablement (`ableFlag`)**: Some regex scripts are gated by CBS variables");
    out.push("   - Preserve any variable bindings used in `ableFlag` to avoid accidental disablement");
    out.push("5. **Cross-reference the Regex Correlation section** at the bottom of this document");
    out.push("   - Each regex script lists used variables and dependent Lua writer functions");
    out.push("   - Use this to verify no regex/Lua pipeline bindings are broken");
    out.push("");
  }

  if (
    lorebookCorrelation
    && regexCorrelation
    && lorebookCorrelation.bridgedVars.length > 0
    && regexCorrelation.bridgedVars.length > 0
  ) {
    out.push("### Three-Way Binding Model");
    out.push("");
    out.push("The character card uses a three-layer architecture where Lua, Lorebook, and Regex share state through CBS (Chat Bot Script) variables:");
    out.push("");
    out.push("```");
    out.push("+-------------+      setChatVar(id, key, val)      +-------------+");
    out.push("|             | ---------------------------------> |             |");
    out.push("|    Lua      |                                    |  CBS State  |");
    out.push("|  (trigger)  | <--------------------------------- |  Variables  |");
    out.push("|             |      getChatVar(id, key)           |             |");
    out.push("+-------------+                                    +------+------+");
    out.push("                                                         |      ");
    out.push("                                  +----------------------+----------------------+");
    out.push("                                  | {{getvar::key}}      | {{getvar::key}}      |");
    out.push("                                  v                      v                      |");
    out.push("                          +---------------+      +---------------+             |");
    out.push("                          |   Lorebook    |      |    Regex     |             |");
    out.push("                          |   (entries)   |      | (customScr.) |             |");
    out.push("                          | conditional   |      | editdisplay  |             |");
    out.push("                          | AI context    |      | editprocess  |             |");
    out.push("                          +---------------+      +---------------+             |");
    out.push("                                  |                      |                      |");
    out.push("                                  | {{setvar::key}}      | {{setvar::key}}      |");
    out.push("                                  +----------------------+----------------------+");
    out.push("                                                         |");
    out.push("                                                         v");
    out.push("                                                  CBS State Updated");
    out.push("```");
    out.push("");
    out.push("**Key implications for conversion:**");
    out.push("- A single variable can have consumers in ALL three layers simultaneously");
    out.push("- Changing a variable key in Lua breaks both lorebook AND regex bindings");
    out.push("- No build-time error — failures are silent and only visible at runtime");
    out.push("");
    out.push("**Variables spanning all three layers in this card:**");
    if (threeWayVars.length === 0) {
      out.push("(이 카드에는 세 레이어 모두에 걸친 변수가 없습니다)");
    } else {
      for (const varName of threeWayVars) {
        const lore = loreBridgeByVar.get(varName);
        const regex = regexBridgeByVar.get(varName);
        const luaWriters = [...new Set([...(lore ? lore.luaWriters : []), ...(regex ? regex.luaWriters : [])])].sort();
        const loreConsumers = [...new Set([...(lore ? lore.lorebookReaders : []), ...(lore ? lore.lorebookWriters : [])])].sort();
        const regexConsumers = [...new Set([...(regex ? regex.regexReaders : []), ...(regex ? regex.regexWriters : [])])].sort();
        out.push(`- \`${varName}\` — Lua: [${luaWriters.join(", ") || "(none)"}] → LB: [${loreConsumers.join(", ") || "(none)"}] + RX: [${regexConsumers.join(", ") || "(none)"}]`);
      }
    }
    out.push("");
  }

  if (regexCorrelation && regexCorrelation.scriptInfos.some((info) => info.type === "editdisplay" && info.inPattern)) {
    out.push("### Structured Text Marker Pipeline");
    out.push("");
    out.push("Lua outputs **marker strings** into chat messages. Regex `editdisplay` rules match these markers and replace them with styled HTML. This is a two-stage rendering pipeline:");
    out.push("");
    out.push("```");
    out.push("[Stage 1] Lua outputs marker     →  \"【INFO】\"  (plain text in chat)");
    out.push("[Stage 2] Regex editdisplay      →  <style>...</style><div>...HTML...</div>");
    out.push("[Stage 3] CBS vars in HTML       →  {{getvar::some_variable}} resolved at display time");
    out.push("```");
    out.push("");
    out.push("**⚠️ Critical**: If the marker string in Lua changes, the regex `in` pattern no longer matches, and the HTML conversion silently fails — the user sees raw marker text.");
    out.push("");
    out.push("**Additional display layer — `listenEdit`:**");
    out.push("If the Lua source contains `listenEdit(\"editDisplay\", ...)`, there is a SECOND display transformation layer running in Lua itself. Both layers coexist and may process different markers. When converting to TypeScript, ensure `listenEdit` handlers are registered in `tstl/index.ts`.");
    out.push("");
    out.push("| Marker | Regex Script | CBS Variables Used |");
    out.push("|--------|--------------|--------------------|");
    for (const info of regexCorrelation.scriptInfos) {
      if (info.type !== "editdisplay" || !info.inPattern) continue;
      const marker = info.inPattern.replace(/\r?\n/g, "\\n");
      out.push(mdRow([
        `\`${marker}\``,
        info.comment,
        info.vars.length > 0 ? info.vars.join(", ") : "(none)",
      ]));
    }
    out.push("");

    if (listenEditHandlers.length > 0) {
      out.push("- `listenEdit` handlers detected in Lua:");
      for (const handler of listenEditHandlers) {
        const eventType = handler.detail || "unknown";
        const fnName = handler.functionName;
        const fnRec = fnName ? (collected.functionIndexByName.get(fnName) || [])[0] : null;
        let markers = [];
        if (fnRec) {
          const source = lines.slice(fnRec.startLine - 1, fnRec.endLine).join("\n");
          const allGsubs = [...source.matchAll(/gsub\(\s*[\"']([^\"']+)[\"']/g)].map((m) => m[1]);
          // Filter out common utility patterns (trim, whitespace, newlines, single-char escapes)
          const isUtility = (p) => /^[%\\]?[snr]+[+*$^]*$/.test(p) || /^\^?%s/.test(p) || /^%s/.test(p) || p === '\n' || p === '\r' || p === '\r\n' || p.length <= 2;
          markers = allGsubs.filter(p => !isUtility(p));
        }
        const markerInfo = markers.length > 0
          ? markers.map((m) => `\`${m}\``).join(", ")
          : "(marker pattern not detected from handler source)";
        out.push(`  - Event \`${eventType}\`: markers ${markerInfo}`);
      }
      out.push("");
    }
  }

  if (
    (lorebookCorrelation && lorebookCorrelation.bridgedVars.length > 0)
    || (regexCorrelation && regexCorrelation.bridgedVars.length > 0)
  ) {
    out.push("### Common Conversion Pitfalls");
    out.push("");
    out.push("These are frequent mistakes when converting Lua scripts that interact with lorebooks and regex:");
    out.push("");
    out.push("**1. Variable key renaming**");
    out.push("```ts");
    out.push("// ❌ WRONG — renamed for TypeScript conventions");
    out.push("vars.set(id, \"playerScore\", level);  // was \"player_score\"");
    out.push("// Lorebook {{getvar::player_score}} now returns empty string");
    out.push("// Regex {{getvar::player_score}} also breaks");
    out.push("// No build error. No runtime error. Silent data loss.");
    out.push("");
    out.push("// ✅ CORRECT — preserve exact key");
    out.push("vars.set(id, \"player_score\", level)");
    out.push("```");
    out.push("");
    out.push("**2. Marker string modification**");
    out.push("```ts");
    out.push("// ❌ WRONG — \"improved\" marker format");
    out.push("addChat(id, `[INFO_PANEL]${panelHtml}[/INFO_PANEL]`);");
    out.push("// Regex in=\"【INFO】\" no longer matches");
    out.push("// User sees raw \"[INFO_PANEL]...\" text");
    out.push("");
    out.push("// ✅ CORRECT — preserve exact marker string");
    out.push("addChat(id, `【INFO】${panelHtml}【/INFO】`);");
    out.push("```");
    out.push("");
    out.push("**3. editprocess output format change**");
    out.push("```ts");
    out.push("// ❌ WRONG — restructured output format");
    out.push("const output = `Name: ${name}, Level: ${level}`;");
    out.push("// Regex in=\"\\[Name: (.*?) \\| Level: (.*?) \\| ...\\]\" no longer matches");
    out.push("// AI receives raw structured text instead of rewritten context");
    out.push("");
    out.push("// ✅ CORRECT — preserve exact delimiters and format");
    out.push("const output = `[Name: ${name} | Level: ${level} | ...]`;");
    out.push("```");
    out.push("");
    out.push("**4. Type coercion changes**");
    out.push("```ts");
    out.push("// ❌ WRONG — using number type");
    out.push("vars.set(id, \"display_mode\", 2);  // number, not string");
    out.push("// CBS {{? {{getvar::display_mode}} == 2}} may fail (string vs number comparison)");
    out.push("");
    out.push("// ✅ CORRECT — preserve string type");
    out.push("vars.set(id, \"display_mode\", \"2\");  // or tostring(2)");
    out.push("```");
    out.push("");
    out.push("**5. Missing listenEdit registration**");
    out.push("```ts");
    out.push("// ❌ WRONG — converted the handler but forgot to register");
    out.push("// tstl/handlers/edit_display.ts has the function");
    out.push("// but tstl/index.ts doesn't call listenEdit(...)");
    out.push("");
    out.push("// ✅ CORRECT — register in index.ts");
    out.push("import { handleEditDisplay } from \"./handlers/edit_display\";");
    out.push("listenEdit(\"editDisplay\", handleEditDisplay);");
    out.push("```");
    out.push("");
  }

  out.push("### Lua → TypeScript Cheat Sheet");
  out.push("");
  out.push("| Lua | TypeScript (TSTL) |");
  out.push("|-----|--------------------|");
  out.push("| `local x = 42` | `const x = 42` or `let x = 42` |");
  out.push("| `function foo(a, b) ... end` | `function foo(a: type, b: type) { ... }` |");
  out.push("| `local function foo() end` | `function foo() { }` (module-scoped) |");
  out.push("| `foo = async(function(id) ... end)` | `const foo = async((id: string) => { ... })` |");
  out.push("| `if x then ... elseif y then ... end` | `if (x) { ... } else if (y) { ... }` |");
  out.push("| `for i = 1, n do ... end` | `for (let i = 1; i <= n; i++) { ... }` |");
  out.push("| `for k, v in pairs(t) do` | `for (const [k, v] of Object.entries(t)) {` or `for (const [k, v] of pairs(t)) {` |");
  out.push("| `for i, v in ipairs(t) do` | `for (const [i, v] of ipairs(t)) {` |");
  out.push("| `t[#t + 1] = x` | `t.push(x)` or `t[t.length] = x` |");
  out.push("| `#t` | `t.length` |");
  out.push("| `string.find(s, pat)` | `const [pos] = string.find(s, pat)` |");
  out.push("| `string.sub(s, i, j)` | `string.sub(s, i, j)` |");
  out.push("| `string.format(...)` | `string.format(...)` |");
  out.push("| `tostring(x)` | `tostring(x)` |");
  out.push("| `tonumber(x)` | `tonumber(x)` |");
  out.push("| `pcall(fn)` | `const [ok, err] = pcall(() => { ... })` |");
  out.push("| `x ~= y` | `x !== y` |");
  out.push("| `x == nil` | `x === undefined` |");
  out.push("| `..` (concat) | `` `${a}${b}` `` or `a + b` |");
  out.push("| `-- comment` | `// comment` |");
  out.push("");

  // ── Extraction Order ──
  out.push("## Extraction Order");
  out.push("");
  out.push("Extract modules in this order. Modules with no dependencies come first.");
  out.push("");
  out.push("| # | Module | Dependencies | Functions | Reason |");
  out.push("|---|--------|--------------|-----------|--------|");
  for (let i = 0; i < extractionOrder.length; i++) {
    const name = extractionOrder[i];
    const g = modByName.get(name);
    if (!g) continue;
    const deps = new Set();
    for (const fnName of g.functions) {
      const callees = callGraph.get(fnName) || new Set();
      for (const callee of callees) {
        const calleeMod = moduleByFunction.get(callee);
        if (calleeMod && calleeMod !== g.name) deps.add(calleeMod);
      }
    }
    const depStr = deps.size > 0 ? [...deps].sort().join(", ") : "(none)";
    out.push(mdRow([String(i + 1), `\`${moduleFilePath(g)}\``, depStr, String(g.functions.size), g.reason]));
  }
  out.push("");

  // ── Module Specifications ──
  out.push("## Module Specifications");
  out.push("");

  for (const name of extractionOrder) {
    const g = modByName.get(name);
    if (!g) continue;
    const fns = moduleFns(g);
    const modExports = computeModuleExports(g);
    const modImports = computeModuleImports(g);
    const modStateVars = computeModuleStateVars(g);

    out.push(`### \`${moduleFilePath(g)}\``);
    out.push(`- **Reason**: ${g.reason}`);
    if (fns.length > 0) {
      const minLine = Math.min(...fns.map(f => f.startLine));
      const maxLine = Math.max(...fns.map(f => f.endLine));
      out.push(`- **Source Range**: L${minLine}–L${maxLine}`);
    }
    out.push("");

    // Functions table
    out.push("#### Functions");
    out.push("| Function | Lines | Params | Nested In |");
    out.push("|----------|-------|--------|-----------|");
    for (const fn of fns) {
      const isNested = fn.parentFunction && moduleByFunction.get(fn.parentFunction) === moduleByFunction.get(fn.name);
      const indent = isNested ? "↳ " : "";
      const params = fn.params.length > 0 ? fn.params.join(", ") : "-";
      const parent = isNested ? fn.parentFunction : "-";
      const asyncTag = fn.isAsync ? " (async)" : "";
      out.push(mdRow([
        indent + fn.displayName + asyncTag,
        `L${fn.startLine}–L${fn.endLine} (${fn.lineCount})`,
        params,
        parent
      ]));
    }
    if (fns.length === 0 && g.tables.size > 0) {
      out.push(mdRow([`(data) ${[...g.tables].join(", ")}`, "-", "-", "-"]));
    }
    out.push("");

    // Exports
    if (modExports.size > 0) {
      out.push("#### Exports");
      out.push("| Function | Called By Modules |");
      out.push("|----------|------------------|");
      for (const [fnName, mods] of [...modExports].sort((a, b) => a[0].localeCompare(b[0]))) {
        out.push(mdRow([fnName, [...mods].sort().join(", ")]));
      }
      out.push("");
    }

    // Imports
    if (modImports.size > 0) {
      out.push("#### Imports");
      out.push("| Function | From Module |");
      out.push("|----------|-------------|");
      const byModule = new Map();
      for (const [fnName, mod] of modImports) {
        if (!byModule.has(mod)) byModule.set(mod, []);
        byModule.get(mod).push(fnName);
      }
      for (const [mod, importFns] of [...byModule].sort((a, b) => a[0].localeCompare(b[0]))) {
        for (const fn of importFns.sort()) {
          out.push(mdRow([fn, mod]));
        }
      }
      out.push("");
    }

    // State Variables
    if (modStateVars.length > 0) {
      out.push("#### State Variables");
      out.push("| Variable | Access | By Functions |");
      out.push("|----------|--------|--------------|");
      for (const sv of modStateVars) {
        out.push(mdRow([sv.key, sv.access, [...sv.fns].sort().join(", ")]));
      }
      out.push("");
    }

    // Lua Source
    const sourceChunks = extractRootSourceChunks(g);
    if (sourceChunks.length > 0) {
      const totalSourceLines = sourceChunks.reduce((sum, c) => sum + c.lineCount, 0);
      out.push("#### Lua Source");
      out.push("");
      if (totalSourceLines > MAX_SOURCE_LINES_PER_MODULE) {
        out.push(`> ⚠️ Total ${totalSourceLines} lines — showing boundaries only. Refer to original file for full source.`);
        out.push("");
        out.push("```lua");
        for (const chunk of sourceChunks) {
          out.push(`-- ── ${chunk.name} (L${chunk.startLine}–L${chunk.endLine}, ${chunk.lineCount} lines) ──`);
          const chunkLines = chunk.source.split("\n");
          if (chunkLines.length <= 25) {
            out.push(chunk.source);
          } else {
            out.push(chunkLines.slice(0, 15).join("\n"));
            out.push(`-- ... ${chunkLines.length - 20} lines omitted — see original L${chunk.startLine + 15}–L${chunk.endLine - 5} ...`);
            out.push(chunkLines.slice(-5).join("\n"));
          }
          out.push("");
        }
        out.push("```");
      } else {
        out.push("```lua");
        for (const chunk of sourceChunks) {
          out.push(`-- ── ${chunk.name} (L${chunk.startLine}–L${chunk.endLine}) ──`);
          out.push(chunk.source);
          out.push("");
        }
        out.push("```");
      }
      out.push("");
    }

    // Target TS Skeleton
    {
      out.push("#### Target TS Skeleton");
      out.push("");
      out.push("```typescript");
      out.push(`// ${moduleFilePath(g)}`);

      // Import statements from other modules
      const importsByPath = new Map();
      for (const [fnName, fromMod] of modImports) {
        const fromGroup = modByName.get(fromMod);
        if (!fromGroup) continue;
        const importPath = computeRelativeImport(g, fromGroup);
        if (!importsByPath.has(importPath)) importsByPath.set(importPath, []);
        importsByPath.get(importPath).push(fnName);
      }
      for (const [importPath, importedFns] of [...importsByPath].sort()) {
        out.push(`import { ${importedFns.sort().join(", ")} } from "${importPath}";`);
      }

      // State variable registry import hint
      const modSV = computeModuleStateVars(g);
      if (modSV.length > 0) {
        out.push(`import { vars } from "${computeRelativeImport(g, { dir: "tstl/modules", name: "registry" })}"; // adjust path to your registry`);
      }

      if (importsByPath.size > 0 || modSV.length > 0) out.push("");

      // Function stubs (root-level only)
      for (const fn of fns) {
        const isNested = fn.parentFunction && moduleByFunction.get(fn.parentFunction) === g.name;
        if (isNested) continue;

        const isExported = modExports.has(fn.name);
        const exportTag = isExported ? "export " : "";
        const params = fn.params.length > 0 ? fn.params.map((p) => `${p}: unknown`).join(", ") : "";

        if (fn.isAsync) {
          out.push(`${exportTag}const ${fn.displayName} = async((${params || "id: string"}) => {`);
        } else {
          out.push(`${exportTag}function ${fn.displayName}(${params}) {`);
        }
        out.push(`  // TODO: Convert from Lua L${fn.startLine}–L${fn.endLine} (${fn.lineCount} lines)`);

        // Show nested function hints
        const children = getDescendants(fn.name).filter((c) => moduleByFunction.get(c.name) === g.name);
        for (const child of children) {
          out.push(`  // ↳ nested: ${child.displayName} (L${child.startLine}–L${child.endLine})`);
        }

        if (fn.isAsync) {
          out.push(`});`);
        } else {
          out.push(`}`);
        }
        out.push("");
      }

      // Data table stubs
      for (const tName of g.tables) {
        out.push(`export const ${tName} = {`);
        out.push(`  // TODO: Convert data table from Lua`);
        out.push(`};`);
        out.push("");
      }

      out.push("```");
      out.push("");
    }

    // Conversion Notes
    const convNotes = generateModuleConversionNotes(g);
    if (convNotes.length > 0) {
      out.push("#### Conversion Notes");
      out.push("");
      for (const note of convNotes) {
        out.push(`- ${note}`);
      }
      out.push("");
    }

    out.push("---");
    out.push("");
  }

  // ── Cross-Module Dependencies ──
  out.push("## Cross-Module Dependencies");
  out.push("| From | To | Via Functions |");
  out.push("|------|-----|---------------|");
  const depEntries = [...crossDeps.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, fns] of depEntries) {
    const [from, to] = key.split("\0");
    out.push(mdRow([from, to, [...fns].sort().join(", ")]));
  }
  if (!depEntries.length) out.push(mdRow(["-", "-", "-"]));
  out.push("");

  // ── State Variable Ownership ──
  out.push("## State Variable Ownership");
  out.push("| Variable | Owner Module | Read By | Written By | Cross-Module |");
  out.push("|----------|-------------|---------|------------|--------------|");
  for (const s of stateOwnership) {
    out.push(mdRow([
      s.key,
      s.ownerModule,
      s.readBy.join(", ") || "-",
      s.writers.join(", ") || "-",
      s.crossModule ? "Yes" : "No"
    ]));
  }
  if (!stateOwnership.length) out.push(mdRow(["-", "-", "-", "-", "-"]));
  out.push("");

  // ── Event Handlers ──
  out.push("## Event Handlers");
  out.push("| Handler | Type | Line | Async | Module |");
  out.push("|---------|------|------|-------|--------|");
  for (const h of collected.handlers) {
    const mod = h.functionName ? (moduleByFunction.get(h.functionName) || "-") : "-";
    out.push(mdRow([
      h.functionName || "-",
      h.type === "listenEdit" ? `listenEdit(${h.detail})` : h.type,
      `L${h.line}`,
      h.isAsync ? "Yes" : "No",
      mod
    ]));
  }
  if (!collected.handlers.length) out.push(mdRow(["-", "-", "-", "-", "-"]));
  out.push("");

  // ── RisuAI API Usage ──
  out.push("## RisuAI API Usage");
  out.push("| Category | APIs | Count |");
  out.push("|----------|------|-------|");
  const apiRows = [...apiByCategory.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [cat, info] of apiRows) out.push(mdRow([cat, [...info.apis].sort().join(", "), String(info.count)]));
  if (!apiRows.length) out.push(mdRow(["-", "-", "0"]));
  out.push("");

  // ── Chat Variable Registry Suggestion ──
  if (registryVars.length > 0) {
    const MAX_REG_VARS = 80;
    out.push("## Chat Variable Registry (Suggested)");
    out.push("");
    out.push("> 정적 분석으로 감지된 채팅 변수들입니다.");
    out.push("> `createRegistry()` 스키마의 시작점으로 활용하세요.");
    out.push("");

    // ── Variables table ──
    out.push("### Detected Variables");
    out.push("| Variable | Type | Default | Init | Reads | Writes | First Writer | Dual-Write |");
    out.push("|----------|------|---------|:----:|:-----:|:------:|-------------|:----------:|");
    const shownVars = registryVars.slice(0, MAX_REG_VARS);
    for (const v of shownVars) {
      const type = v.suggestNumber ? "number" : "string";
      const def = v.suggestedDefault !== "" ? `\`${v.suggestedDefault}\`` : '`""`';
      const init = v.isInitPattern ? "✓" : "-";
      const dual = v.hasDualWrite ? "✓" : "-";
      out.push(mdRow([v.key, type, def, init, String(v.readCount), String(v.writeCount), v.firstWriteFunction, dual]));
    }
    if (registryVars.length > MAX_REG_VARS) {
      out.push(`\n> ... +${registryVars.length - MAX_REG_VARS}개 변수는 요약에서 생략됨`);
    }
    out.push("");

    // ── Suggested schema code block ──
    out.push("### Suggested Schema");
    out.push("");
    out.push("```typescript");
    out.push('import { createRegistry } from "./utils/chatvar-registry";');
    out.push("");
    out.push("export const vars = createRegistry({");

    const initVars = shownVars.filter(v => v.isInitPattern);
    const syncVars = shownVars.filter(v => !v.isInitPattern && v.hasDualWrite);
    const runtimeVars = shownVars.filter(v => !v.isInitPattern && !v.hasDualWrite);

    function emitVarLine(v, isLast) {
      const val = v.suggestNumber ? (Number(v.suggestedDefault) || 0) : JSON.stringify(v.suggestedDefault || "");
      const comma = isLast ? "" : ",";
      out.push(`  ${JSON.stringify(v.key)}: { default: ${val} }${comma}`);
    }

    if (initVars.length) {
      out.push("  // ── Initialized Variables ──");
      for (let i = 0; i < initVars.length; i++) {
        const isLast = !syncVars.length && !runtimeVars.length && i === initVars.length - 1;
        emitVarLine(initVars[i], isLast);
      }
    }
    if (syncVars.length) {
      if (initVars.length) out.push("");
      out.push("  // ── State-synced Variables (number) ──");
      for (let i = 0; i < syncVars.length; i++) {
        const isLast = !runtimeVars.length && i === syncVars.length - 1;
        emitVarLine(syncVars[i], isLast);
      }
    }
    if (runtimeVars.length) {
      if (initVars.length || syncVars.length) out.push("");
      out.push("  // ── Runtime Variables ──");
      for (let i = 0; i < runtimeVars.length; i++) {
        emitVarLine(runtimeVars[i], i === runtimeVars.length - 1);
      }
    }

    out.push("});");
    out.push("```");
    out.push("");

    // ── Warnings ──
    const warnings = [];
    for (const v of shownVars) {
      if (v.writeCount > 0 && v.readCount === 0) {
        warnings.push(`⚠️ \`${v.key}\`: 쓰기만 발생 (${v.writeCount}회) — CBS 템플릿 전용 변수이거나 사용되지 않는 변수일 수 있음`);
      }
      if (!v.isInitPattern && v.writeCount > 3) {
        warnings.push(`💡 \`${v.key}\`: 초기화 패턴 미감지 — nil-check 없이 ${v.writeCount}회 쓰기 발생. 레지스트리에 초기값 등록 권장`);
      }
    }
    if (warnings.length) {
      out.push("### Warnings");
      out.push("");
      for (const w of warnings.slice(0, 20)) out.push(`- ${w}`);
      if (warnings.length > 20) out.push(`- ... +${warnings.length - 20}개`);
      out.push("");
    }
  }

  // ── Lorebook Correlation ──
  if (lorebookCorrelation) {
    const lc = lorebookCorrelation;

    out.push("## Lua↔Lorebook Correlation");
    out.push("");
    out.push(`> ${lc.totalEntries}개 lorebook 엔트리 분석됨 (${lc.totalFolders}개 폴더).`);
    out.push(`> ${lc.bridgedVars.length}개 변수가 Lua와 Lorebook 사이를 연결합니다.`);
    out.push("");

    if (lc.bridgedVars.length > 0) {
      out.push("### Bridge Variables (Lua↔Lorebook)");
      out.push("");
      out.push("| Variable | Direction | Lua Writers | Lua Readers | Lorebook Readers | Lorebook Writers |");
      out.push("|----------|-----------|-------------|-------------|-----------------|------------------|");
      for (const c of lc.bridgedVars) {
        out.push(mdRow([
          "`" + c.varName + "`",
          c.direction,
          c.luaWriters.join(", ") || "-",
          c.luaReaders.join(", ") || "-",
          c.lorebookReaders.join(", ") || "-",
          c.lorebookWriters.join(", ") || "-",
        ]));
      }
      out.push("");
    }

    if (lc.entryInfos.length > 0) {
      out.push("### Lorebook Entry Dependencies");
      out.push("");
      out.push("| Lorebook Entry | Folder | Used Variables | Lua Function Dependencies |");
      out.push("|----------------|--------|----------------|---------------------------|");
      for (const info of lc.entryInfos) {
        out.push(mdRow([
          info.name,
          info.folder || "-",
          info.vars.map(v => "`" + v + "`").join(", "),
          info.luaDeps.join(", ") || "-",
        ]));
      }
      out.push("");
    }

    if (lc.loreApiCalls.length > 0) {
      out.push("### Direct Lorebook API Calls");
      out.push("");
      out.push("| API | Keyword | Line | Function |");
      out.push("|-----|---------|------|----------|");
      for (const call of lc.loreApiCalls) {
        out.push(mdRow([call.apiName, call.keyword ? "`" + call.keyword + "`" : "-", `L${call.line}`, call.containingFunction]));
      }
      out.push("");
    }

    const luaOnly = lc.luaOnlyVars.filter(c => c.luaWriters.length > 0 || c.luaReaders.length > 0);
    const lbOnly = lc.lorebookOnlyVars.filter(c => c.lorebookReaders.length > 0 || c.lorebookWriters.length > 0);
    if (luaOnly.length > 0 || lbOnly.length > 0) {
      out.push("### Unmapped Variables");
      out.push("");
      if (luaOnly.length > 0) {
        out.push("**Lua-only** (Lua에서 참조되지만 Lorebook에는 없음):");
        out.push("");
        for (const c of luaOnly.slice(0, 30)) {
          const fns = [...new Set([...c.luaWriters, ...c.luaReaders])].join(", ");
          out.push(`- \`${c.varName}\` ← ${fns}`);
        }
        if (luaOnly.length > 30) out.push(`- ... +${luaOnly.length - 30}개`);
        out.push("");
      }
      if (lbOnly.length > 0) {
        out.push("**Lorebook-only** (Lorebook에서 참조되지만 Lua에는 없음):");
        out.push("");
        for (const c of lbOnly.slice(0, 30)) {
          const entries = [...new Set([...c.lorebookReaders, ...c.lorebookWriters])].join(", ");
          out.push(`- \`${c.varName}\` ← ${entries}`);
        }
        if (lbOnly.length > 30) out.push(`- ... +${lbOnly.length - 30}개`);
        out.push("");
      }
    }
  }

  if (regexCorrelation) {
    const rc = regexCorrelation;

    out.push("## Lua↔Regex Correlation");
    out.push("");
    out.push(`> ${rc.totalScripts}개 regex 스크립트 분석됨 (${rc.activeScripts}개 활성, disabled 포함 총계 유지).`);
    out.push(`> ${rc.bridgedVars.length}개 변수가 Lua와 Regex 사이를 연결합니다.`);
    out.push("");

    if (rc.bridgedVars.length > 0) {
      out.push("### Bridge Variables (Lua↔Regex)");
      out.push("");
      out.push("| Variable | Direction | Lua Writers | Lua Readers | Regex Readers | Regex Writers |");
      out.push("|----------|-----------|-------------|-------------|---------------|---------------|");
      for (const c of rc.bridgedVars) {
        out.push(mdRow([
          "`" + c.varName + "`",
          c.direction,
          c.luaWriters.join(", ") || "-",
          c.luaReaders.join(", ") || "-",
          c.regexReaders.join(", ") || "-",
          c.regexWriters.join(", ") || "-",
        ]));
      }
      out.push("");
    }

    if (rc.scriptInfos.length > 0) {
      out.push("### Regex Script Dependencies");
      out.push("");
      out.push("| Regex Script | Type | Used Variables | Lua Function Dependencies |");
      out.push("|--------------|------|----------------|---------------------------|");
      for (const info of rc.scriptInfos) {
        out.push(mdRow([
          info.comment,
          info.type,
          info.vars.map(v => "`" + v + "`").join(", "),
          info.luaDeps.join(", ") || "-",
        ]));
      }
      out.push("");
    }

    const luaOnly = rc.luaOnlyVars.filter(c => c.luaWriters.length > 0 || c.luaReaders.length > 0);
    const regexOnly = rc.regexOnlyVars.filter(c => c.regexReaders.length > 0 || c.regexWriters.length > 0);
    if (luaOnly.length > 0 || regexOnly.length > 0) {
      out.push("### Unmapped Variables");
      out.push("");
      if (luaOnly.length > 0) {
        out.push("**Lua-only** (Lua에서 참조되지만 Regex에는 없음):");
        out.push("");
        for (const c of luaOnly.slice(0, 30)) {
          const fns = [...new Set([...c.luaWriters, ...c.luaReaders])].join(", ");
          out.push(`- \`${c.varName}\` ← ${fns}`);
        }
        if (luaOnly.length > 30) out.push(`- ... +${luaOnly.length - 30}개`);
        out.push("");
      }
      if (regexOnly.length > 0) {
        out.push("**Regex-only** (Regex에서 참조되지만 Lua에는 없음):");
        out.push("");
        for (const c of regexOnly.slice(0, 30)) {
          const scripts = [...new Set([...c.regexReaders, ...c.regexWriters])].join(", ");
          out.push(`- \`${c.varName}\` ← ${scripts}`);
        }
        if (regexOnly.length > 30) out.push(`- ... +${regexOnly.length - 30}개`);
        out.push("");
      }
    }
  }

  return out.join("\n");
}

const parsed = path.parse(filePath);

if (markdownMode) {
  const outPath = path.join(parsed.dir, `${parsed.name}.analysis.md`);
  fs.writeFileSync(outPath, renderMarkdown(), "utf-8");
  console.log(`  📄 Markdown report written: ${outPath}`);
}

if (htmlMode) {
  const outPath = path.join(parsed.dir, `${parsed.name}.analysis.html`);
  const html = renderHtml({
    path,
    filePath,
    total,
    collected,
    stateOwnership,
    apiByCategory,
    moduleGroups,
    lorebookCorrelation,
    regexCorrelation,
    MAX_MODULES_IN_REPORT,
    computeExtractionOrder,
    computeCrossModuleDeps,
    generateModuleConversionNotes,
    moduleFns,
    extractRootSourceChunks,
  });
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`  \u{1F4C4} HTML report written: ${outPath}`);
}

}

module.exports = {
  runReporting,
};
