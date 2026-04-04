import fs from 'node:fs';
import path from 'node:path';
import { runAnalyzeWorkflow as runLuaAnalyze } from './lua/workflow';
import { runAnalyzeCharxWorkflow as runCharxAnalyze } from './charx/workflow';

const HELP_TEXT = `
  🐿️ risu-core analyze

  Usage:  risu-core analyze [--type <type>] <target> [options]

  Types:
    lua           Lua 스크립트 정적 분석 (default for .lua files)
    charx         캐릭터 카드 종합 분석 (default for directories with charx.json)

  Auto-detection:
    .lua file       → lua
    directory       → charx (charx.json 존재 시)

  Run 'risu-core analyze --type <type> --help' for type-specific help.
`;

/** analyze CLI 진입점. --type 플래그 또는 대상 파일 확장자를 기준으로 lua/charx 분석을 자동 분기한다. */
export function runAnalyzeWorkflow(argv: readonly string[]): number {
  const helpMode =
    argv.length === 0 ||
    (argv.includes('-h') && !hasTypeFlag(argv)) ||
    (argv.includes('--help') && !hasTypeFlag(argv));

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  const typeIdx = argv.indexOf('--type');
  const typeArg = typeIdx >= 0 ? argv[typeIdx + 1] : null;
  const stripType = (v: string) => v !== '--type' && v !== typeArg;

  if (typeArg === 'lua') {
    return runLuaAnalyze(argv.filter(stripType));
  }

  if (typeArg === 'charx') {
    return runCharxAnalyze(argv.filter(stripType));
  }

  if (typeArg && typeArg !== 'lua' && typeArg !== 'charx') {
    console.error(`\n  ❌ Unknown analyze type: ${typeArg}`);
    console.error('  Available types: lua, charx\n');
    return 1;
  }

  // Auto-detect
  const target = argv.find(
    (v) => !v.startsWith('-') && v !== typeArg && !isOptionValue(argv, v),
  );

  if (target) {
    if (target.endsWith('.lua')) {
      return runLuaAnalyze(argv);
    }

    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory() && fs.existsSync(path.join(target, 'charx.json'))) {
        return runCharxAnalyze(argv);
      }
    } catch {
      // fall through to default
    }
  }

  // Default: Lua (backward compat)
  return runLuaAnalyze(argv);
}

function hasTypeFlag(argv: readonly string[]): boolean {
  return argv.includes('--type');
}

function isOptionValue(argv: readonly string[], value: string): boolean {
  const idx = argv.indexOf(value);
  if (idx <= 0) return false;
  const prev = argv[idx - 1];
  return prev === '--type' || prev === '--card' || prev === '--charx' || prev === '--out';
}
