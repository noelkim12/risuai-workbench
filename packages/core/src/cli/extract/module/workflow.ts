import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson } from '../../../node/fs-helpers';
import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssets,
  phase6_extractBackgroundEmbedding,
  phase7_extractModuleIdentity,
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

  Examples:
    risu-core extract my_module.risum
    risu-core extract my_module.json --out ./extracted
    risu-core extract my_module.risum --json-only
`;

export function isModuleFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.risum';
}

export function runExtractWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const jsonOnly = argv.includes('--json-only');
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
  const filePath = argv.find(
    (value) =>
      !value.startsWith('-') &&
      value !== outArg &&
      value !== '--out' &&
      value !== '--json-only',
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
    runMain(filePath, outArg, jsonOnly);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${message}\n`);
    return 1;
  }
}

function runMain(filePath: string, outArg: string | null, jsonOnly: boolean): void {
  console.log('\n  RisuAI Module Extractor\n');

  const parsed = phase1_parseModule(filePath);
  const safeName = sanitizeOutputName(parsed.module?.name || path.basename(filePath, path.extname(filePath)));
  const defaultOutDir = `module_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);

  const moduleJsonPath = path.join(resolvedOutDir, 'module.json');
  writeJson(moduleJsonPath, parsed.module);
  console.log(`\n     module.json -> ${path.relative('.', moduleJsonPath)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  phase2_extractLorebooks(parsed.module, resolvedOutDir);
  phase3_extractRegex(parsed.module, resolvedOutDir);
  phase4_extractTriggerLua(parsed.module, resolvedOutDir);
  phase5_extractAssets(parsed.module, resolvedOutDir, parsed.assetBuffers, parsed.sourceFormat);
  phase6_extractBackgroundEmbedding(parsed.module, resolvedOutDir);
  phase7_extractModuleIdentity(parsed.module, resolvedOutDir);

  console.log('\n  ────────────────────────────────────────');
  console.log(`  추출 완료 -> ${path.relative('.', resolvedOutDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}

function sanitizeOutputName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}
