import fs from 'node:fs';
import path from 'node:path';
import { runAnalyzeModuleWorkflow } from '@/cli/analyze/module/workflow';
import { ensureDir } from '@/node/fs-helpers';
import { parseRisuLuaMode, type RisuLuaMode } from '../../shared/lua-bundler/risulua-mode';
import { parseRisuLuaSplitMode, type RisuLuaSplitCliMode } from '../../shared/risulua-split';
import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractLua,
  phase5_extractAssetsAsync,
  phase6_extractBackgroundEmbedding,
  phase7_extractVariables,
  phase8_extractModuleIdentity,
  phase9_extractModuleToggle,
} from './phases';

const HELP_TEXT = `
  RisuAI Module Extractor

  Usage:  risu-core extract <file.risum|file.json> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: ./module_<name>)
    --risulua-mode <classic|modular>  RisuLua 개발 방식: classic=단일 파일 개발, modular=모듈식 개발 (기본: classic)
    --risulua-split <none|report|coarse|module-table>  추출된 RisuLua split 산출물 생성 방식 (기본: none)
    -h, --help      도움말

  Phases:
    1. 모듈 파싱 (.risum/.json)
    2. lorebook 추출 → lorebooks/*.risulorebook + lorebooks/_order.json + lorebooks/_folders.json
    3. regex 추출 → regex/*.risuregex + regex/_order.json
    4. triggerscript 추출 → lua/*.risulua
    5. 에셋 추출/scaffold → assets/ + assets/manifest.json
    6. backgroundEmbedding 추출 → html/background.risuhtml
    7. module variables 추출 → variables/<moduleName>.risuvar
    8. 모듈 identity 추출 → .risumodule
    9. module toggle 추출 → toggle/<moduleName>.risutoggle

  Examples:
    risu-core extract my_module.risum
    risu-core extract my_module.json --out ./extracted
`;

export function isModuleFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.risum';
}

export async function runExtractWorkflow(argv: readonly string[]): Promise<number> {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  let modeResult: ReturnType<typeof parseRisuLuaMode>;
  let splitResult: ReturnType<typeof parseRisuLuaSplitMode>;
  try {
    splitResult = parseRisuLuaSplitMode(argv);
    modeResult = parseRisuLuaMode(splitResult.strippedArgv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${message}\n`);
    return 1;
  }

  const outIdx = modeResult.strippedArgv.indexOf('--out');
  const outArg = outIdx >= 0 ? modeResult.strippedArgv[outIdx + 1] : null;
  const filePath = modeResult.strippedArgv.find(
    (value) => !value.startsWith('-') && value !== outArg && value !== '--out',
  );

  if (helpMode || !filePath) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  try {
    await runMain(filePath, outArg, modeResult.mode ?? 'classic', splitResult.mode ?? 'none');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${message}\n`);
    return 1;
  }
}

function fmt(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function runMain(
  filePath: string,
  outArg: string | null,
  risuluaMode: RisuLuaMode,
  risuluaSplitMode: RisuLuaSplitCliMode,
): Promise<void> {
  const t0 = performance.now();
  console.log('\n  RisuAI Module Extractor\n');

  let t = performance.now();
  const parsed = phase1_parseModule(filePath);
  const safeName = sanitizeOutputName(
    parsed.module?.name || path.basename(filePath, path.extname(filePath)),
  );
  const defaultOutDir = `module_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);

  console.log(`     RisuLua: ${formatRisuLuaModeLabel(risuluaMode)}`);
  console.log(`     RisuLua split: ${risuluaSplitMode}`);
  console.log(`     ⏱  Phase 1: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase2_extractLorebooks(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 2: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase3_extractRegex(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 3: ${fmt(performance.now() - t)}`);

  t = performance.now();
  let phase4Error: Error | undefined;
  try {
    await phase4_extractLua(parsed.module, resolvedOutDir, risuluaMode, risuluaSplitMode);
  } catch (error) {
    phase4Error = error instanceof Error ? error : new Error(String(error));
    console.error(`     ⚠️ Phase 4 failed: ${phase4Error.message}`);
  }
  console.log(`     ⏱  Phase 4: ${fmt(performance.now() - t)}`);

  t = performance.now();
  await phase5_extractAssetsAsync(
    parsed.module,
    resolvedOutDir,
    parsed.assetBuffers,
    parsed.sourceFormat,
  );
  console.log(`     ⏱  Phase 5 (assets): ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase6_extractBackgroundEmbedding(parsed.module, resolvedOutDir);
  phase7_extractVariables(parsed.module, resolvedOutDir);
  phase8_extractModuleIdentity(parsed.module, resolvedOutDir, parsed.sourceFormat);
  phase9_extractModuleToggle(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 6-9: ${fmt(performance.now() - t)}`);

  t = performance.now();
  runModuleAnalysis(resolvedOutDir);
  console.log(`     ⏱  Phase 9 (analysis): ${fmt(performance.now() - t)}`);

  const total = performance.now() - t0;
  console.log('\n  ────────────────────────────────────────');
  console.log(`  추출 완료 -> ${path.relative('.', resolvedOutDir)}/`);
  console.log(`  ⏱  총 소요: ${fmt(total)}`);
  console.log('  ────────────────────────────────────────\n');

  // Re-throw phase 4 error after completing basic extraction
  if (phase4Error) {
    throw phase4Error;
  }
}

function formatRisuLuaModeLabel(mode: RisuLuaMode): string {
  return mode === 'modular' ? '모듈식 개발' : '단일 파일 개발';
}

function sanitizeOutputName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

function runModuleAnalysis(resolvedOutDir: string): void {
  const hasCanonicalMarker = fs.existsSync(path.join(resolvedOutDir, '.risumodule'));
  const hasLegacyModuleJson = fs.existsSync(path.join(resolvedOutDir, 'module.json'));

  if (!hasCanonicalMarker && !hasLegacyModuleJson) {
    console.log('  ⏭  canonical module extract에서는 module 분석을 건너뜁니다.');
    return;
  }

  console.log('\n  ═══ Phase 9: Module Analysis ═══');
  const code = runAnalyzeModuleWorkflow([resolvedOutDir]);
  if (code !== 0) {
    console.error(`  ⚠️ module analyze 실행 실패: exit code ${code}`);
  }
}
