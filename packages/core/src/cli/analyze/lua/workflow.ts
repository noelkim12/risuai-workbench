import fs from 'node:fs';
import path from 'node:path';
import { analyzeLuaFile } from '@/domain/analyze/lua-core';
import { detectLocale } from '../shared/i18n';
import { runReporting } from './reporting';

const HELP_TEXT = `
  Usage: node analyze.js <file.lua> [options]

  Options:
    --charx <path>    캐릭터 카드 (charx.json 또는 .png) — Lua↔Lorebook 상관관계 분석 (--card도 허용)
    --json            분석 데이터를 JSON 파일로 내보내기
    --no-markdown     마크다운 리포트 생성 안 함
    --no-html         HTML 분석 시트 생성 안 함
    -h, --help        도움말
  `;

/** Lua 스크립트 정적 분석 CLI 진입점. 공유 분석 코어 결과를 리포팅 파이프라인에 연결한다. */
export function runAnalyzeWorkflow(argv: readonly string[]): number {
  const markdownMode = !argv.includes('--no-markdown');
  const htmlMode = !argv.includes('--no-html');
  const jsonMode = argv.includes('--json');
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const locale = detectLocale(argv);
  const charxIdx = argv.indexOf('--charx');
  const cardIdx = argv.indexOf('--card');
  const flagIdx = charxIdx >= 0 ? charxIdx : cardIdx;
  const charxArg = flagIdx >= 0 ? argv[flagIdx + 1] : null;
  const localeIdx = argv.indexOf('--locale');
  const localeArg = localeIdx >= 0 ? argv[localeIdx + 1] : null;
  const filePath = argv.find((value) => !value.startsWith('-') && value !== charxArg && value !== localeArg);

  if (helpMode || !filePath) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  let luaArtifact: ReturnType<typeof analyzeLuaFile>;
  try {
    luaArtifact = analyzeLuaFile({ filePath, charxArg });
  } catch (error) {
    const parseError = error as { line?: number; column?: number; message?: string };
    console.error(
      `\n  ❌ Parse error at line ${parseError.line ?? '-'}, col ${parseError.column ?? '-'}: ${parseError.message ?? 'unknown'}\n`,
    );
    return 1;
  }

  console.log(`\n  🔍 ${path.basename(filePath)} (${luaArtifact.totalLines} lines)\n`);

  if (cardIdx >= 0 && charxIdx < 0) {
    console.warn('  ⚠️  --card is deprecated; use --charx instead.');
  }

  if (jsonMode) {
    const baseName = path.basename(filePath, path.extname(filePath));
    const jsonPath = path.join(path.dirname(filePath), `${baseName}.analysis.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(luaArtifact.serialized, null, 2), 'utf-8');
    console.log(`  ✅ JSON exported to ${jsonPath}`);
  }

  runReporting(
    {
      filePath,
      total: luaArtifact.totalLines,
      analyzePhase: luaArtifact.analyzePhase,
      collected: luaArtifact.collected,
      lorebookCorrelation: luaArtifact.lorebookCorrelation,
      regexCorrelation: luaArtifact.regexCorrelation,
    },
    { markdown: markdownMode, html: htmlMode },
    locale,
  );

  return 0;
}
