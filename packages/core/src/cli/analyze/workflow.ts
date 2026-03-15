import fs from 'node:fs';
import path from 'node:path';
import luaparse from 'luaparse';
import { type Chunk } from 'luaparse';
import { type LuaASTNode } from '../../domain';
import { runCollectPhase } from './collector';
import { runAnalyzePhase } from './analyzer';
import { buildLorebookCorrelation, buildRegexCorrelation } from './correlation';
import { runReporting } from './reporting';
import { type ApiMeta, type CollectedData } from './types';

const RISUAI_API: Record<string, ApiMeta> = {
  getChatVar: { cat: 'state', access: 'injected', rw: 'read' },
  setChatVar: { cat: 'state', access: 'safe', rw: 'write' },
  getState: { cat: 'state', access: 'wrapper', rw: 'read' },
  setState: { cat: 'state', access: 'wrapper', rw: 'write' },
  getGlobalVar: { cat: 'state', access: 'injected', rw: 'read' },
  getChat: { cat: 'chat', access: 'wrapper', rw: 'read' },
  getFullChat: { cat: 'chat', access: 'wrapper', rw: 'read' },
  setChat: { cat: 'chat', access: 'safe', rw: 'write' },
  setFullChat: { cat: 'chat', access: 'safe', rw: 'write' },
  getChatLength: { cat: 'chat', access: 'injected', rw: 'read' },
  addChat: { cat: 'chat', access: 'safe', rw: 'write' },
  removeChat: { cat: 'chat', access: 'safe', rw: 'write' },
  cutChat: { cat: 'chat', access: 'safe', rw: 'write' },
  insertChat: { cat: 'chat', access: 'safe', rw: 'write' },
  reloadChat: { cat: 'chat', access: 'safe', rw: 'write' },
  reloadDisplay: { cat: 'ui', access: 'safe', rw: 'write' },
  alertNormal: { cat: 'ui', access: 'safe', rw: 'write' },
  alertError: { cat: 'ui', access: 'safe', rw: 'write' },
  alertInput: { cat: 'ui', access: 'safe', rw: 'write' },
  alertSelect: { cat: 'ui', access: 'safe', rw: 'write' },
  alertConfirm: { cat: 'ui', access: 'safe', rw: 'write' },
  generateImage: { cat: 'ai', access: 'low-level', rw: 'write' },
  LLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  LLMMain: { cat: 'ai', access: 'low-level', rw: 'write' },
  axLLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  axLLMMain: { cat: 'ai', access: 'low-level', rw: 'write' },
  simpleLLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  getName: { cat: 'character', access: 'injected', rw: 'read' },
  setName: { cat: 'character', access: 'safe', rw: 'write' },
  getDescription: { cat: 'character', access: 'safe', rw: 'read' },
  setDescription: { cat: 'character', access: 'safe', rw: 'write' },
  getPersonaName: { cat: 'character', access: 'injected', rw: 'read' },
  getPersonaDescription: { cat: 'character', access: 'injected', rw: 'read' },
  getCharacterImage: { cat: 'character', access: 'wrapper', rw: 'read' },
  getPersonaImage: { cat: 'character', access: 'wrapper', rw: 'read' },
  getCharacterFirstMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getCharacterLastMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getUserLastMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getLoreBooks: { cat: 'lore', access: 'wrapper', rw: 'read' },
  loadLoreBooks: { cat: 'lore', access: 'wrapper', rw: 'read' },
  upsertLocalLoreBook: { cat: 'lore', access: 'safe', rw: 'write' },
  stopChat: { cat: 'control', access: 'safe', rw: 'write' },
  getTokens: { cat: 'utility', access: 'safe', rw: 'read' },
  sleep: { cat: 'utility', access: 'safe', rw: 'write' },
  log: { cat: 'utility', access: 'wrapper', rw: 'write' },
  cbs: { cat: 'utility', access: 'injected', rw: 'read' },
  listenEdit: { cat: 'event', access: 'wrapper', rw: 'write' },
  async: { cat: 'utility', access: 'wrapper', rw: 'read' },
  request: { cat: 'network', access: 'low-level', rw: 'read' },
  similarity: { cat: 'ai', access: 'low-level', rw: 'read' },
  hash: { cat: 'utility', access: 'low-level', rw: 'read' },
};

const LUA_STDLIB_CALLS = new Set([
  'string', 'table', 'math', 'os', 'pcall', 'tostring', 'tonumber', 'type', 'ipairs', 'pairs', 'next', 'select', 'unpack', 'print', 'error', 'assert',
]);

const HELP_TEXT = `
  Usage: node analyze.js <file.lua> [options]

  Options:
    --card <path>     캐릭터 카드 (card.json 또는 .png) — Lua↔Lorebook 상관관계 분석
    --json            분석 데이터를 JSON 파일로 내보내기
    --no-markdown     마크다운 리포트 생성 안 함
    --no-html         HTML 분석 시트 생성 안 함
    -h, --help        도움말
  `;

export function runAnalyzeWorkflow(argv: readonly string[]): number {
  const markdownMode = !argv.includes('--no-markdown');
  const htmlMode = !argv.includes('--no-html');
  const jsonMode = argv.includes('--json');
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const cardIdx = argv.indexOf('--card');
  const cardArg = cardIdx >= 0 ? argv[cardIdx + 1] : null;
  const filePath = argv.find((value) => !value.startsWith('-') && value !== cardArg);

  if (helpMode || !filePath) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  const src = fs.readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const total = lines.length;
  console.log(`\n  🔍 ${path.basename(filePath)} (${total} lines)\n`);

  let ast: Chunk;
  try {
    ast = luaparse.parse(src, {
      comments: true,
      locations: true,
      ranges: true,
      scope: true,
      luaVersion: '5.3',
    }) as unknown as Chunk;
  } catch (error) {
    const parseError = error as { line?: number; column?: number; message?: string };
    console.error(`\n  ❌ Parse error at line ${parseError.line ?? '-'}, col ${parseError.column ?? '-'}: ${parseError.message ?? 'unknown'}\n`);
    return 1;
  }

  const body = ast.body as LuaASTNode[];
  const comments = (ast.comments || []) as LuaASTNode[];
  const { collected } = runCollectPhase({
    body,
    risuApi: RISUAI_API,
  });

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
    risuApi: RISUAI_API,
    luaStdlibCalls: LUA_STDLIB_CALLS,
  });

  const lorebookCorrelation = buildLorebookCorrelation({ cardArg, collected });
  const regexCorrelation = buildRegexCorrelation({ cardArg, collected });

  if (jsonMode) {
    const serialized = serializeCollected(collected);
    const baseName = path.basename(filePath, path.extname(filePath));
    const jsonPath = path.join(path.dirname(filePath), `${baseName}.analysis.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(serialized, null, 2), 'utf-8');
    console.log(`  ✅ JSON exported to ${jsonPath}`);
  }

  runReporting({
    filePath,
    markdownMode,
    htmlMode,
    total,
    lines,
    analyzePhase: {
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
    },
    collected,
    lorebookCorrelation,
    regexCorrelation,
  });

  return 0;
}

function serializeCollected(collected: CollectedData): Record<string, unknown> {
  const stateVarsObj: Record<string, unknown> = {};
  for (const [key, value] of collected.stateVars) {
    stateVarsObj[key] = {
      key: value.key,
      readBy: [...value.readBy].sort(),
      writtenBy: [...value.writtenBy].sort(),
      apis: [...value.apis].sort(),
      firstWriteValue: value.firstWriteValue,
      firstWriteFunction: value.firstWriteFunction,
      firstWriteLine: value.firstWriteLine,
      hasDualWrite: value.hasDualWrite,
    };
  }

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
    apiCategories: [...fn.apiCategories].sort(),
    apiNames: [...fn.apiNames].sort(),
    stateReads: [...fn.stateReads].sort(),
    stateWrites: [...fn.stateWrites].sort(),
  }));

  return {
    stateVars: stateVarsObj,
    functions: functionsArray,
    handlers: collected.handlers,
    apiCalls: collected.apiCalls,
  };
}
