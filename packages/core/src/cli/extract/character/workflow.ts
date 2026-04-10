import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson } from '@/node/fs-helpers';
import { runAnalyzeWorkflow } from '@/cli/analyze/lua/workflow';
import { runAnalyzeCharxWorkflow } from '@/cli/analyze/charx/workflow';
import { getCharacterName } from '@/domain/charx/data';
import { sanitizeFilename } from '../../../utils/filenames';
import {
  phase1_parseCharxAsync,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssetsAsync,
  phase6_extractBackgroundHTML,
  phase7_extractVariables,
  phase8_extractCharacterFields,
} from './phases';

type ParsedCharxResult = {
  charx: unknown;
  assetSources: Record<string, Uint8Array>;
  mainImage: Buffer | null;
};

const HELP_TEXT = `
  🐿️ RisuAI Character Card Extractor

  Usage:  node extract.js <file.charx|file.png> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: ./character_<name>)
    --json-only     Phase 1만 실행 (charx.json만 출력)
    -h, --help      도움말

  Phases:
    1. 캐릭터 카드 파싱 → charx.json
    2. globalLore 추출 → lorebooks/ + lorebooks/manifest.json
    3. customscript(regex) 추출 → regex/
    4. triggerlua 스크립트 추출 → lua/
    5. 에셋 바이너리 추출 → assets/ + assets/manifest.json
    6. backgroundHTML 추출 → html/background.html
    7. defaultVariables 추출 → variables/default.txt + default.json
    8. Character Card 추출 → character/ (identity, messages, prompting, metadata, extensions)
    9. Lua 분석 (analyze.js)
    10. 카드 종합 분석 (analyze-charx.js) → analysis/

  Examples:
    node extract.js mychar.charx
    node extract.js mychar.png --out ./other-dir
    node extract.js mychar.charx --json-only
`;

export async function runExtractWorkflow(argv: readonly string[]): Promise<number> {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const jsonOnly = argv.includes('--json-only');
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
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
    await runMain(filePath, outArg, jsonOnly);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

function fmt(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function runMain(filePath: string, outArg: string | null, jsonOnly: boolean): Promise<void> {
  const t0 = performance.now();
  console.log('\n  🐿️ RisuAI Character Card Extractor\n');

  let t = performance.now();
  const { charx, assetSources, mainImage }: ParsedCharxResult = await phase1_parseCharxAsync(filePath);
  const safeName = sanitizeFilename(
    getCharacterName(charx),
    path.basename(filePath, path.extname(filePath)),
  );
  const defaultOutDir = `character_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);
  const charxJsonPath = path.join(resolvedOutDir, 'charx.json');
  writeJson(charxJsonPath, charx);
  console.log(`\n     ✅ charx.json → ${path.relative('.', charxJsonPath)}`);
  console.log(`     ⏱  Phase 1: ${fmt(performance.now() - t)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  t = performance.now();
  phase2_extractLorebooks(charx, resolvedOutDir);
  console.log(`     ⏱  Phase 2: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase3_extractRegex(charx, resolvedOutDir);
  console.log(`     ⏱  Phase 3: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase4_extractTriggerLua(charx, resolvedOutDir);
  console.log(`     ⏱  Phase 4: ${fmt(performance.now() - t)}`);

  t = performance.now();
  await phase5_extractAssetsAsync(charx, resolvedOutDir, assetSources, mainImage);
  console.log(`     ⏱  Phase 5 (assets): ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase6_extractBackgroundHTML(charx, resolvedOutDir);
  phase7_extractVariables(charx, resolvedOutDir);
  phase8_extractCharacterFields(charx, resolvedOutDir);
  console.log(`     ⏱  Phase 6-8: ${fmt(performance.now() - t)}`);

  t = performance.now();
  runLuaAnalysis(resolvedOutDir, charxJsonPath);
  console.log(`     ⏱  Phase 9 (lua analysis): ${fmt(performance.now() - t)}`);

  t = performance.now();
  runCharxAnalysis(resolvedOutDir, charxJsonPath);
  console.log(`     ⏱  Phase 10 (charx analysis): ${fmt(performance.now() - t)}`);

  const total = performance.now() - t0;
  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 추출 완료 → ${path.relative('.', resolvedOutDir)}/`);
  console.log(`  ⏱  총 소요: ${fmt(total)}`);
  console.log('  ────────────────────────────────────────\n');
}

function runLuaAnalysis(resolvedOutDir: string, charxJsonPath: string): void {
  const luaDir = path.join(resolvedOutDir, 'lua');
  if (!fs.existsSync(luaDir)) return;

  const luaFiles = fs.readdirSync(luaDir).filter((file) => file.endsWith('.lua'));
  if (luaFiles.length === 0) return;

  console.log('\n  ═══ Phase 9: Lua Analysis ═══');

  for (const luaFile of luaFiles) {
    const luaPath = path.join(luaDir, luaFile);
    const code = runAnalyzeWorkflow([luaPath, '--charx', charxJsonPath, '--json']);
    if (code !== 0) {
      console.error(`  ⚠️ analyze.js 실행 실패: ${luaFile} — exit code ${code}`);
    }
  }
}

function runCharxAnalysis(resolvedOutDir: string, charxJsonPath: string): void {
  if (!fs.existsSync(charxJsonPath)) return;

  console.log('\n  ═══ Phase 10: Card Analysis ═══');
  const code = runAnalyzeCharxWorkflow([resolvedOutDir]);
  if (code !== 0) {
    console.error(`  ⚠️ analyze-charx.js 실행 실패: exit code ${code}`);
  }
}
