#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const luaparse = require('luaparse');
const {
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
  toModuleName,
  prefixOf,
  createMaxBlankRun,
} = require("./shared/analyze-helpers");
const { buildLorebookCorrelation, buildRegexCorrelation } = require("./analyze/correlation");
const { runReporting } = require("./analyze/reporting");
const { runCollectPhase } = require("./analyze/collector");
const { runAnalyzePhase } = require("./analyze/analyzer");
const RISUAI_API = {
  getChatVar: { cat: "state", access: "injected", rw: "read" },
  setChatVar: { cat: "state", access: "safe", rw: "write" },
  getState: { cat: "state", access: "wrapper", rw: "read" },
  setState: { cat: "state", access: "wrapper", rw: "write" },
  getGlobalVar: { cat: "state", access: "injected", rw: "read" },
  getChat: { cat: "chat", access: "wrapper", rw: "read" },
  getFullChat: { cat: "chat", access: "wrapper", rw: "read" },
  setChat: { cat: "chat", access: "safe", rw: "write" },
  setFullChat: { cat: "chat", access: "safe", rw: "write" },
  getChatLength: { cat: "chat", access: "injected", rw: "read" },
  addChat: { cat: "chat", access: "safe", rw: "write" },
  removeChat: { cat: "chat", access: "safe", rw: "write" },
  cutChat: { cat: "chat", access: "safe", rw: "write" },
  insertChat: { cat: "chat", access: "safe", rw: "write" },
  reloadChat: { cat: "chat", access: "safe", rw: "write" },
  reloadDisplay: { cat: "ui", access: "safe", rw: "write" },
  alertNormal: { cat: "ui", access: "safe", rw: "write" },
  alertError: { cat: "ui", access: "safe", rw: "write" },
  alertInput: { cat: "ui", access: "safe", rw: "write" },
  alertSelect: { cat: "ui", access: "safe", rw: "write" },
  alertConfirm: { cat: "ui", access: "safe", rw: "write" },
  generateImage: { cat: "ai", access: "low-level", rw: "write" },
  LLM: { cat: "ai", access: "low-level", rw: "write" },
  LLMMain: { cat: "ai", access: "low-level", rw: "write" },
  axLLM: { cat: "ai", access: "low-level", rw: "write" },
  axLLMMain: { cat: "ai", access: "low-level", rw: "write" },
  simpleLLM: { cat: "ai", access: "low-level", rw: "write" },
  getName: { cat: "character", access: "injected", rw: "read" },
  setName: { cat: "character", access: "safe", rw: "write" },
  getDescription: { cat: "character", access: "safe", rw: "read" },
  setDescription: { cat: "character", access: "safe", rw: "write" },
  getPersonaName: { cat: "character", access: "injected", rw: "read" },
  getPersonaDescription: { cat: "character", access: "injected", rw: "read" },
  getCharacterImage: { cat: "character", access: "wrapper", rw: "read" },
  getPersonaImage: { cat: "character", access: "wrapper", rw: "read" },
  getCharacterFirstMessage: { cat: "character", access: "injected", rw: "read" },
  getCharacterLastMessage: { cat: "character", access: "injected", rw: "read" },
  getUserLastMessage: { cat: "character", access: "injected", rw: "read" },
  getLoreBooks: { cat: "lore", access: "wrapper", rw: "read" },
  loadLoreBooks: { cat: "lore", access: "wrapper", rw: "read" },
  upsertLocalLoreBook: { cat: "lore", access: "safe", rw: "write" },
  stopChat: { cat: "control", access: "safe", rw: "write" },
  getTokens: { cat: "utility", access: "safe", rw: "read" },
  sleep: { cat: "utility", access: "safe", rw: "write" },
  log: { cat: "utility", access: "wrapper", rw: "write" },
  cbs: { cat: "utility", access: "injected", rw: "read" },
  listenEdit: { cat: "event", access: "wrapper", rw: "write" },
  async: { cat: "utility", access: "wrapper", rw: "read" },
  request: { cat: "network", access: "low-level", rw: "read" },
  similarity: { cat: "ai", access: "low-level", rw: "read" },
  hash: { cat: "utility", access: "low-level", rw: "read" },
};
const LUA_STDLIB_CALLS = new Set(["string", "table", "math", "os", "pcall", "tostring", "tonumber", "type", "ipairs", "pairs", "next", "select", "unpack", "print", "error", "assert"]);
const MAX_MODULES_IN_REPORT = 120;
const argv = process.argv.slice(2);
const markdownMode = !argv.includes("--no-markdown");
const htmlMode = !argv.includes("--no-html");
const jsonMode = argv.includes("--json");
const helpMode = argv.includes("-h") || argv.includes("--help") || argv.length === 0;
const cardIdx = argv.indexOf("--card");
const cardArg = cardIdx >= 0 ? argv[cardIdx + 1] : null;
const filePath = argv.find((a) => !a.startsWith("-") && a !== cardArg);
if (helpMode || !filePath) {
  console.log(`
  Usage: node analyze.js <file.lua> [options]

  Options:
    --card <path>     캐릭터 카드 (card.json 또는 .png) — Lua↔Lorebook 상관관계 분석
    --json            분석 데이터를 JSON 파일로 내보내기
    --no-markdown     마크다운 리포트 생성 안 함
    --no-html         HTML 분석 시트 생성 안 함
    -h, --help        도움말
  `);
  process.exit(0);
}
if (!fs.existsSync(filePath)) {
  console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
  process.exit(1);
}
const src = fs.readFileSync(filePath, "utf-8");
const lines = src.split("\n");
const total = lines.length;
console.log(`\n  🔍 ${path.basename(filePath)} (${total} lines)\n`);
// ═══════════════════════════════════════════════════════════
// PHASE 1: PARSE — luaparse AST extraction
// ═══════════════════════════════════════════════════════════

let ast;
try {
  ast = luaparse.parse(src, { comments: true, locations: true, ranges: true, scope: true, luaVersion: "5.3" });
} catch (e) {
  console.error(`\n  ❌ Parse error at line ${e.line}, col ${e.column}: ${e.message}\n`);
  process.exit(1);
}
const body = ast.body;
const comments = ast.comments || [];
const maxBlankRun = createMaxBlankRun(lines, total);


// ═══════════════════════════════════════════════════════════
// PHASE 2: COLLECT — single-pass AST walker
// ═══════════════════════════════════════════════════════════

const { collected } = runCollectPhase({
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
});

// ═══════════════════════════════════════════════════════════
// PHASE 3: ANALYZE — module grouping, call graph, state ownership
// ═══════════════════════════════════════════════════════════

const {
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
} = runAnalyzePhase({
  comments,
  total,
  collected,
  RISUAI_API,
  LUA_STDLIB_CALLS,
  lineStart,
  sanitizeName,
  toModuleName,
  maxBlankRun,
});

// ═══════════════════════════════════════════════════════════
// PHASE 3.5: LOREBOOK CORRELATION (optional, requires --card)
// ═══════════════════════════════════════════════════════════

const lorebookCorrelation = buildLorebookCorrelation({ cardArg, collected });
const regexCorrelation = buildRegexCorrelation({ cardArg, collected });

// ═══════════════════════════════════════════════════════════
// PHASE 3.6: JSON EXPORT (optional, requires --json)
// ═══════════════════════════════════════════════════════════

function serializeCollected(collected) {
  // Convert Maps and Sets to plain objects/arrays for JSON serialization
  const stateVarsObj = {};
  for (const [key, value] of collected.stateVars) {
    stateVarsObj[key] = {
      key: value.key,
      readBy: Array.from(value.readBy).sort(),
      writtenBy: Array.from(value.writtenBy).sort(),
      apis: Array.from(value.apis).sort(),
      firstWriteValue: value.firstWriteValue,
      firstWriteFunction: value.firstWriteFunction,
      firstWriteLine: value.firstWriteLine,
      hasDualWrite: value.hasDualWrite,
    };
  }

  // Serialize functions with state reads/writes as arrays
  const functionsArray = collected.functions.map((fn) => ({
    name: fn.name,
    displayName: fn.displayName,
    startLine: fn.startLine,
    endLine: fn.endLine,
    lineCount: fn.lineCount,
    isLocal: fn.isLocal,
    isAsync: fn.isAsync,
    params: fn.params,
    parentFunction: fn.parentFunction,
    isListenEditHandler: fn.isListenEditHandler,
    listenEditEventType: fn.listenEditEventType,
    apiCategories: Array.from(fn.apiCategories).sort(),
    apiNames: Array.from(fn.apiNames).sort(),
    stateReads: Array.from(fn.stateReads).sort(),
    stateWrites: Array.from(fn.stateWrites).sort(),
  }));

  return {
    stateVars: stateVarsObj,
    functions: functionsArray,
    handlers: collected.handlers,
    apiCalls: collected.apiCalls,
  };
}

if (jsonMode) {
  const serialized = serializeCollected(collected);
  const baseName = path.basename(filePath, path.extname(filePath));
  const jsonPath = path.join(path.dirname(filePath), `${baseName}.analysis.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(serialized, null, 2), "utf-8");
  console.log(`  ✅ JSON exported to ${jsonPath}`);
}

// ═══════════════════════════════════════════════════════════
// PHASE 4: FORMAT — console output + markdown report
// ═══════════════════════════════════════════════════════════

runReporting({
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
});
