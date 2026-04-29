import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '@/node/fs-helpers';
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
  🐿️ RisuAI Character Card Extractor (canonical mode)

  Usage:  node extract.js <file.charx|file.png> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: ./character_<name>)
    --json-only     (deprecated) Phase 1만 실행
    -h, --help      도움말

  Phases (canonical mode — no charx.json):
    1. 캐릭터 카드 파싱 (internal)
    2. lorebook 추출 → lorebooks/*.risulorebook + _order.json + _folders.json
    3. regex 추출 → regex/*.risuregex + _order.json
    4. triggerscript 추출 → lua/triggerscript.risulua
    5. 에셋 바이너리 추출 → assets/ + assets/manifest.json
    6. backgroundHTML 추출 → html/background.risuhtml
    7. defaultVariables 추출 → variables/default.risuvar
    8. Character Card 추출 → .risuchar + character/*.risutext + alternate_greetings/*.risutext
    9. Lua 분석 (analyze.js) — deferred to T13
    10. 카드 종합 분석 (analyze-charx.js) → analysis/ — deferred to T13

  Notes:
    - charx.json is NOT emitted in canonical mode
    - All data is stored as canonical .risu* artifacts
    - .risutoggle is NOT supported for charx (module/preset only)
    - Charx analysis (Phase 10) is temporarily disabled pending T13 migration

  Examples:
    node extract.js mychar.charx
    node extract.js mychar.png --out ./other-dir
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
  console.log('\n  🐿️ RisuAI Character Card Extractor (canonical)\n');

  let t = performance.now();
  const { charx, assetSources, mainImage }: ParsedCharxResult = await phase1_parseCharxAsync(filePath);
  const safeName = sanitizeFilename(
    getCharacterName(charx),
    path.basename(filePath, path.extname(filePath)),
  );
  const defaultOutDir = `character_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);

  // Note: charx.json is NOT written in canonical mode
  // All data is emitted as canonical .risu* artifacts only
  console.log(`\n     ✅ Canonical extract mode — no charx.json`);
  console.log(`     ⏱  Phase 1: ${fmt(performance.now() - t)}`);

  if (jsonOnly) {
    console.log('\n  ⚠️  --json-only is deprecated in canonical mode\n');
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
  const assetManifest = await phase5_extractAssetsAsync(charx, resolvedOutDir, assetSources, mainImage);
  console.log(`     ⏱  Phase 5 (assets): ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase6_extractBackgroundHTML(charx, resolvedOutDir);
  phase7_extractVariables(charx, resolvedOutDir);
  phase8_extractCharacterFields(charx, resolvedOutDir, assetManifest);
  console.log(`     ⏱  Phase 6-8: ${fmt(performance.now() - t)}`);

  // Analysis phases deferred to T13 (canonical workspace migration)
  // Phase 9 (Lua analysis) and Phase 10 (charx analysis) are temporarily disabled
  // because they depend on charx.json which is intentionally excluded in T12
  console.log(`     ⏱  Phase 9-10 (analysis): deferred to T13`);

  const total = performance.now() - t0;
  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 추출 완료 → ${path.relative('.', resolvedOutDir)}/`);
  console.log(`  ⏱  총 소요: ${fmt(total)}`);
  console.log('  ────────────────────────────────────────\n');
}
