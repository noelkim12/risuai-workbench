import fs from 'node:fs';
import path from 'node:path';
import { runAnalyzeModuleWorkflow } from '@/cli/analyze/module/workflow';
import { ensureDir, writeJson } from '@/node/fs-helpers';
import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssetsAsync,
  phase6_extractBackgroundEmbedding,
  phase7_extractModuleIdentity,
  phase8_extractModuleToggle,
} from './phases';

const HELP_TEXT = `
  RisuAI Module Extractor

  Usage:  risu-core extract <file.risum|file.json> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: ./module_<name>)
    --json-only     Phase 1만 실행 (module.json만 출력)
    -h, --help      도움말

  Phases:
    1. 모듈 파싱 (.risum/.json) → module.json
    2. lorebook 추출 → lorebooks/ + lorebooks/manifest.json + lorebooks/_order.json
    3. regex 추출 → regex/ + regex/_order.json
    4. triggerlua 스크립트 추출 → lua/
    5. 에셋 추출 (risum only) → assets/ + assets/manifest.json
    6. backgroundEmbedding 추출 → html/background.html
    7. 모듈 identity 추출 → metadata.json
    8. module toggle 추출 → toggle/<moduleName>.risutoggle

  Examples:
    risu-core extract my_module.risum
    risu-core extract my_module.json --out ./extracted
    risu-core extract my_module.risum --json-only
`;

export function isModuleFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.risum';
}

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
    console.error(`\n  파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  try {
    await runMain(filePath, outArg, jsonOnly);
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

async function runMain(filePath: string, outArg: string | null, jsonOnly: boolean): Promise<void> {
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

  const moduleJsonPath = path.join(resolvedOutDir, 'module.json');
  writeJson(moduleJsonPath, parsed.module);
  console.log(`\n     module.json -> ${path.relative('.', moduleJsonPath)}`);
  console.log(`     ⏱  Phase 1: ${fmt(performance.now() - t)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  t = performance.now();
  phase2_extractLorebooks(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 2: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase3_extractRegex(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 3: ${fmt(performance.now() - t)}`);

  t = performance.now();
  phase4_extractTriggerLua(parsed.module, resolvedOutDir);
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
  phase7_extractModuleIdentity(parsed.module, resolvedOutDir);
  phase8_extractModuleToggle(parsed.module, resolvedOutDir);
  console.log(`     ⏱  Phase 6-8: ${fmt(performance.now() - t)}`);

  t = performance.now();
  runModuleAnalysis(resolvedOutDir);
  console.log(`     ⏱  Phase 9 (analysis): ${fmt(performance.now() - t)}`);

  const total = performance.now() - t0;
  console.log('\n  ────────────────────────────────────────');
  console.log(`  추출 완료 -> ${path.relative('.', resolvedOutDir)}/`);
  console.log(`  ⏱  총 소요: ${fmt(total)}`);
  console.log('  ────────────────────────────────────────\n');
}

function sanitizeOutputName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

function runModuleAnalysis(resolvedOutDir: string): void {
  console.log('\n  ═══ Phase 9: Module Analysis ═══');
  const code = runAnalyzeModuleWorkflow([resolvedOutDir]);
  if (code !== 0) {
    console.error(`  ⚠️ module analyze 실행 실패: exit code ${code}`);
  }
}
