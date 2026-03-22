import fs from 'node:fs';
import path from 'node:path';
import luaparse from 'luaparse';
import { type Chunk } from 'luaparse';
import { type LuaASTNode } from '@/domain';
import { RISUAI_API, LUA_STDLIB_CALLS } from '@/domain/analyze/lua-api';
import { runCollectPhase } from '@/domain/analyze/lua-collector';
import { runAnalyzePhase } from '@/domain/analyze/lua-analyzer';
import { type CollectedData } from '@/domain/analyze/lua-analysis-types';
import { buildLorebookCorrelation, buildRegexCorrelation } from './correlation';
import { runReporting } from './reporting';

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
    console.error(
      `\n  ❌ Parse error at line ${parseError.line ?? '-'}, col ${parseError.column ?? '-'}: ${parseError.message ?? 'unknown'}\n`,
    );
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
