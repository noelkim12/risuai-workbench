import fs from 'node:fs';
import path from 'node:path';
import { runAnalyzeWorkflow as runLuaAnalyze } from './lua/workflow';
import { runAnalyzeCharxWorkflow as runCharxAnalyze } from './charx/workflow';
import { runAnalyzeComposeWorkflow } from './compose/workflow';
import { runAnalyzeModuleWorkflow } from './module/workflow';
import { runAnalyzePresetWorkflow } from './preset/workflow';

const KNOWN_TYPES = ['lua', 'charx', 'module', 'preset', 'compose'] as const;

/** Detect workspace type based on canonical markers instead of root JSON files. */
function detectWorkspaceType(targetDir: string): 'charx' | 'module' | 'preset' | null {
  // Check for module FIRST: metadata.json + lorebooks/ directory
  // Module has stricter criteria and takes precedence over preset
  if (
    fs.existsSync(path.join(targetDir, 'metadata.json')) &&
    fs.existsSync(path.join(targetDir, 'lorebooks'))
  ) {
    return 'module';
  }

  // Check for preset: metadata.json + at least one preset-bearing directory
  // Valid preset markers: prompts/, prompt_template/, regex/, model.json, parameters.json
  if (fs.existsSync(path.join(targetDir, 'metadata.json'))) {
    const hasPresetMarkers =
      fs.existsSync(path.join(targetDir, 'prompts')) ||
      fs.existsSync(path.join(targetDir, 'prompt_template')) ||
      fs.existsSync(path.join(targetDir, 'regex')) ||
      fs.existsSync(path.join(targetDir, 'model.json')) ||
      fs.existsSync(path.join(targetDir, 'parameters.json')) ||
      fs.existsSync(path.join(targetDir, 'instruct_settings.json'));
    if (hasPresetMarkers) {
      return 'preset';
    }
  }

  // Check for charx: character/ directory + lorebooks/ directory
  if (
    fs.existsSync(path.join(targetDir, 'character')) &&
    fs.existsSync(path.join(targetDir, 'lorebooks'))
  ) {
    return 'charx';
  }

  // Root JSON fallback removed - canonical workspace detection only
  return null;
}

const HELP_TEXT = `
  🐿️ risu-core analyze

  Usage:  risu-core analyze [--type <type>] <target> [options]

  Types:
    lua           Lua 스크립트 정적 분석 (default for .lua files)
    charx         캐릭터 카드 종합 분석 (default for directories with canonical charx markers)
    module        모듈 종합 분석 (default for directories with canonical module markers)
    preset        프리셋 종합 분석 (default for directories with canonical preset markers)
    compose       아티팩트 조합 충돌 분석 (explicit only)

  Auto-detection (canonical workspaces):
    .lua/.risulua file → lua
    directory          → detected by canonical markers (character/, lorebooks/, prompts/, metadata.json)
    compose            → auto-detect 없음, --type compose로 명시

  Run 'risu-core analyze --type <type> --help' for type-specific help.
`;

/** analyze CLI 진입점. --type 플래그 또는 대상 경로를 기준으로 lua/charx/module/preset/compose 분석을 분기한다. */
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

  if (typeArg === 'module') {
    return runAnalyzeModuleWorkflow(argv.filter(stripType));
  }

  if (typeArg === 'preset') {
    return runAnalyzePresetWorkflow(argv.filter(stripType));
  }

  if (typeArg === 'compose') {
    return runAnalyzeComposeWorkflow(argv.filter(stripType));
  }

  if (typeArg && !KNOWN_TYPES.includes(typeArg as (typeof KNOWN_TYPES)[number])) {
    console.error(`\n  ❌ Unknown analyze type: ${typeArg}`);
    console.error(`  Available types: ${KNOWN_TYPES.join(', ')}\n`);
    return 1;
  }

  // Auto-detect
  const target = argv.find(
    (v) => !v.startsWith('-') && v !== typeArg && !isOptionValue(argv, v),
  );

  if (target) {
    if (target.toLowerCase().endsWith('.lua') || target.toLowerCase().endsWith('.risulua')) {
      return runLuaAnalyze(argv);
    }

    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        const detectedType = detectWorkspaceType(target);
        switch (detectedType) {
          case 'module':
            return runAnalyzeModuleWorkflow(argv);
          case 'preset':
            return runAnalyzePresetWorkflow(argv);
          case 'charx':
            return runCharxAnalyze(argv);
          default:
            // No recognizable workspace markers found
            console.error(`\n  ❌ Cannot detect workspace type for: ${target}`);
            console.error(`  Expected canonical markers:`);
            console.error(`    - Preset: metadata.json + prompts/ | prompt_template/ | regex/`);
            console.error(`    - Module: metadata.json + lorebooks/`);
            console.error(`    - Charx:  character/ + lorebooks/\n`);
            return 1;
        }
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
  return prev === '--type' || prev === '--card' || prev === '--charx' || prev === '--out' || prev === '--locale';
}
