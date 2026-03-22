import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson } from '@/node/fs-helpers';
import { runAnalyzeWorkflow } from '@/cli/analyze/lua/workflow';
import { runAnalyzeCardWorkflow } from '@/cli/analyze/charx/workflow';
import {
  phase1_parseCard,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssets,
  phase6_extractBackgroundHTML,
  phase7_extractVariables,
  phase8_extractCharacterCard,
} from './phases';

type ParsedCardResult = {
  card: unknown;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
};

const HELP_TEXT = `
  🐿️ RisuAI Character Card Extractor

  Usage:  node extract.js <file.charx|file.png> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: . 프로젝트 루트)
    --json-only     Phase 1만 실행 (card.json만 출력)
    -h, --help      도움말

  Phases:
    1. 캐릭터 카드 파싱 → card.json
    2. globalLore 추출 → lorebooks/ + lorebooks/manifest.json
    3. customscript(regex) 추출 → regex/
    4. triggerlua 스크립트 추출 → lua/
    5. 에셋 바이너리 추출 → assets/ + assets/manifest.json
    6. backgroundHTML 추출 → html/background.html
    7. defaultVariables 추출 → variables/default.txt + default.json
    8. Character Card 추출 → character/ (identity, messages, prompting, metadata, extensions)
    9. Lua 분석 (analyze.js)
    10. 카드 종합 분석 (analyze-card.js) → analysis/

  Examples:
    node extract.js mychar.charx
    node extract.js mychar.png --out ./other-dir
    node extract.js mychar.charx --json-only
`;

export function runExtractWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const jsonOnly = argv.includes('--json-only');
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
  const outDir = outArg || '.';
  const filePath = argv.find(
    (value) =>
      !value.startsWith('-') && value !== outArg && value !== '--out' && value !== '--json-only',
  );

  if (helpMode || !filePath) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  try {
    runMain(filePath, outDir, jsonOnly);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

function runMain(filePath: string, outDir: string, jsonOnly: boolean): void {
  console.log('\n  🐿️ RisuAI Character Card Extractor\n');

  const { card, assetSources, mainImage } = phase1_parseCard(filePath);
  const resolvedOutDir = path.resolve(outDir);
  ensureDir(resolvedOutDir);
  const cardJsonPath = path.join(resolvedOutDir, 'card.json');
  writeJson(cardJsonPath, card);
  console.log(`\n     ✅ card.json → ${path.relative('.', cardJsonPath)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  phase2_extractLorebooks(card, resolvedOutDir);
  phase3_extractRegex(card, resolvedOutDir);
  phase4_extractTriggerLua(card, resolvedOutDir);
  phase5_extractAssets(card, resolvedOutDir, assetSources, mainImage);
  phase6_extractBackgroundHTML(card, resolvedOutDir);
  phase7_extractVariables(card, resolvedOutDir);
  phase8_extractCharacterCard(card, resolvedOutDir);
  runLuaAnalysis(resolvedOutDir, cardJsonPath);
  runCardAnalysis(resolvedOutDir, cardJsonPath);

  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 추출 완료 → ${path.relative('.', resolvedOutDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}

function runLuaAnalysis(resolvedOutDir: string, cardJsonPath: string): void {
  const luaDir = path.join(resolvedOutDir, 'lua');
  if (!fs.existsSync(luaDir)) return;

  const luaFiles = fs.readdirSync(luaDir).filter((file) => file.endsWith('.lua'));
  if (luaFiles.length === 0) return;

  console.log('\n  ═══ Phase 9: Lua Analysis ═══');

  for (const luaFile of luaFiles) {
    const luaPath = path.join(luaDir, luaFile);
    const code = runAnalyzeWorkflow([luaPath, '--card', cardJsonPath, '--json']);
    if (code !== 0) {
      console.error(`  ⚠️ analyze.js 실행 실패: ${luaFile} — exit code ${code}`);
    }
  }
}

function runCardAnalysis(resolvedOutDir: string, cardJsonPath: string): void {
  if (!fs.existsSync(cardJsonPath)) return;

  console.log('\n  ═══ Phase 10: Card Analysis ═══');
  const code = runAnalyzeCardWorkflow([resolvedOutDir]);
  if (code !== 0) {
    console.error(`  ⚠️ analyze-card.js 실행 실패: exit code ${code}`);
  }
}
