import fs from 'node:fs';
import path from 'node:path';
import { runAnalyzePresetWorkflow } from '@/cli/analyze/preset/workflow';
import { ensureDir, writeJson } from '@/node/fs-helpers';
import {
  phase1_parsePreset,
  phase2_extractPrompts,
  phase3_extractPromptTemplate,
  phase4_extractParameters,
  phase5_extractModelConfig,
  phase6_extractProviderSettings,
  phase7_extractPromptSettings,
  phase8_extractRegexAndAdvanced,
} from './phases';

const HELP_TEXT = `
  RisuAI Preset Extractor

  Usage:  risu-core extract <file.json|file.preset> [options]

  Supported formats:
    .json, .preset         JSON 프리셋 (RisuAI / NAI / SillyTavern)
    .risupreset, .risup    바이너리 프리셋

  Options:
    --out <dir>     출력 디렉토리 (기본: ./preset_<name>)
    --json-only     Phase 1만 실행 (metadata.json만 출력)
    -h, --help      도움말

  Phases:
    1. 프리셋 파싱 + 타입 감지 (RisuAI / NAI / SillyTavern)
    2. 프롬프트 추출 → prompts/ (main.txt, jailbreak.txt, global_note.txt)
    3. 프롬프트 템플릿 추출 → prompt_template/ (*.risuprompt + _order.json)
    4. 파라미터 추출 → parameters.json
    5. 모델 설정 추출 → model.json
    6. 프로바이더 설정 추출 → provider/ (ooba.json, nai.json, ain.json)
    7. 프롬프트 세팅 추출 → prompt_settings.json, instruct_settings.json, toggle/prompt_template.risutoggle 등
    8. Regex & 고급 설정 추출 → regex/*.risuregex, advanced.json

  Examples:
    risu-core extract my_preset.json
    risu-core extract my_preset.preset --out ./extracted
    risu-core extract my_preset.json --json-only
`;

const PRESET_EXTENSIONS = new Set(['.json', '.preset', '.risupreset', '.risup']);

export function isPresetFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return PRESET_EXTENSIONS.has(ext) && !isLikelyCharacterCard(filePath, ext);
}

function isLikelyCharacterCard(filePath: string, ext: string): boolean {
  if (ext !== '.json') return false;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return !!(data.spec && (data.spec.startsWith('chara_card') || data.data?.name));
  } catch {
    return false;
  }
}

export function runExtractWorkflow(argv: readonly string[]): number {
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
    runMain(filePath, outArg, jsonOnly);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${message}\n`);
    return 1;
  }
}

function runMain(filePath: string, outArg: string | null, jsonOnly: boolean): void {
  console.log('\n  RisuAI Preset Extractor\n');

  const parsed = phase1_parsePreset(filePath);

  const safeName = parsed.name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
  const defaultOutDir = `preset_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);

  const metadataPath = path.join(resolvedOutDir, 'metadata.json');
  writeJson(metadataPath, {
    name: parsed.name,
    preset_type: parsed.presetType,
    source_format: parsed.sourceFormat,
    import_format: parsed.importFormat,
    source_file: path.basename(filePath),
  });
  console.log(`\n     metadata.json -> ${path.relative('.', metadataPath)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  phase2_extractPrompts(parsed, resolvedOutDir);
  phase3_extractPromptTemplate(parsed, resolvedOutDir);
  phase4_extractParameters(parsed, resolvedOutDir);
  phase5_extractModelConfig(parsed, resolvedOutDir);
  phase6_extractProviderSettings(parsed, resolvedOutDir);
  phase7_extractPromptSettings(parsed, resolvedOutDir);
  phase8_extractRegexAndAdvanced(parsed, resolvedOutDir);
  runPresetAnalysis(resolvedOutDir);

  console.log('\n  ────────────────────────────────────────');
  console.log(`  추출 완료 -> ${path.relative('.', resolvedOutDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}

function runPresetAnalysis(resolvedOutDir: string): void {
  console.log('\n  ═══ Phase 9: Preset Analysis ═══');
  const code = runAnalyzePresetWorkflow([resolvedOutDir]);
  if (code !== 0) {
    console.error(`  ⚠️ preset analyze 실행 실패: exit code ${code}`);
  }
}
