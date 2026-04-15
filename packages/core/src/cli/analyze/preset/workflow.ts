import fs from 'node:fs';
import path from 'node:path';
import {
  analyzePromptChain,
  analyzeTokenBudget,
  analyzeVariableFlow,
  buildUnifiedCBSGraph,
  detectDeadCode,
  type ElementCBSData,
} from '@/domain';
import { detectLocale } from '../shared/i18n';
import {
  collectJsonTextFieldComponents,
  collectNamedTextFileComponents,
  collectRegexScriptInfosFromDir,
  collectRegexTokenComponentsFromDir,
} from '../shared/cross-cutting';
import { collectPresetSources } from './collectors';
import { renderPresetMarkdown } from './reporting';
import { renderPresetHtml } from './reporting/htmlRenderer';
import type { PresetReportData, PromptSource } from './types';

const HELP_TEXT = `
  🐿️ RisuAI Preset Analyzer

  Usage:  risu-core analyze --type preset <extracted-preset-dir> [options]

  Output:
    analysis/preset-analysis.md    Markdown summary report
    analysis/preset-analysis.html  Self-contained HTML report

  Options:
    --help, -h    Show this help
`;

/** preset analyze CLI 진입점. COLLECT → CORRELATE → REPORT 파이프라인을 실행한다. */
export function runAnalyzePresetWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  const locale = detectLocale(argv);
  const outputDir = argv.find((arg) => !arg.startsWith('-'));
  if (!outputDir || !fs.existsSync(outputDir)) {
    console.error('\n  ❌ Target directory not found.\n');
    return 1;
  }

  // Check for canonical workspace markers or legacy preset.json
  // Valid canonical markers: metadata.json + at least one of prompts/, prompt_template/, regex/, model.json, parameters.json
  const hasMetadata = fs.existsSync(path.join(outputDir, 'metadata.json'));
  const hasCanonicalPresetMarkers = hasMetadata && (
    fs.existsSync(path.join(outputDir, 'prompts')) ||
    fs.existsSync(path.join(outputDir, 'prompt_template')) ||
    fs.existsSync(path.join(outputDir, 'regex')) ||
    fs.existsSync(path.join(outputDir, 'model.json')) ||
    fs.existsSync(path.join(outputDir, 'parameters.json')) ||
    fs.existsSync(path.join(outputDir, 'instruct_settings.json'))
  );
  const hasLegacyPresetJson = fs.existsSync(path.join(outputDir, 'preset.json'));

  if (!hasCanonicalPresetMarkers && !hasLegacyPresetJson) {
    console.error(`\n  ❌ Canonical preset workspace markers not found: ${outputDir}`);
    console.error(`  Expected one of:`);
    console.error(`    - metadata.json + prompts/ directory (canonical workspace)`);
    console.error(`    - metadata.json + prompt_template/ directory (canonical workspace)`);
    console.error(`    - metadata.json + regex/ directory (canonical workspace)`);
    console.error(`    - metadata.json + model.json/parameters.json (canonical workspace)`);
    console.error(`    - preset.json (legacy workspace)\n`);
    return 1;
  }

  try {
    const collected = collectPresetSources(outputDir);
    const presetName =
      typeof collected.metadata.name === 'string' && collected.metadata.name.length > 0
        ? collected.metadata.name
        : path.basename(outputDir);

    const allCBS: ElementCBSData[] = [
      ...collected.prompts.map(toPromptElement),
      ...collected.promptTemplates.map(toTemplateElement),
      ...collected.regexCBS,
    ];
    const unifiedGraph = buildUnifiedCBSGraph(allCBS, {});
    const tokenBudget = analyzeTokenBudget([
      ...collectNamedTextFileComponents(path.join(outputDir, 'prompts'), 'prompt', [
        'main.txt',
        'jailbreak.txt',
        'global_note.txt',
      ]),
      ...collectJsonTextFieldComponents(path.join(outputDir, 'prompt_template'), 'template', [
        'text',
        'content',
        'prompt',
      ]),
      ...collectRegexTokenComponentsFromDir(path.join(outputDir, 'regex'), 'regex', '[preset]'),
      ...fallbackPromptTokenComponents(outputDir, collected),
    ]);
    const variableFlow = analyzeVariableFlow(allCBS, {});
    const promptChain = analyzePromptChain(buildPromptChainInputs(collected));
    const deadCode = detectDeadCode(variableFlow, {
      lorebookEntries: [],
      regexScripts: collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'), '[preset]'),
    });

    const reportData: PresetReportData = {
      presetName,
      collected,
      unifiedGraph,
      tokenBudget,
      variableFlow,
      deadCode,
      promptChain,
    };

    renderPresetMarkdown(reportData, outputDir, locale);
    renderPresetHtml(reportData, outputDir, locale);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Preset analysis failed: ${message}\n`);
    return 1;
  }
}

function fallbackPromptTokenComponents(
  outputDir: string,
  collected: ReturnType<typeof collectPresetSources>,
): Array<{ category: string; name: string; text: string; alwaysActive: boolean }> {
  if (fs.existsSync(path.join(outputDir, 'prompts')) || fs.existsSync(path.join(outputDir, 'prompt_template'))) {
    return [];
  }

  const promptComponents = collected.prompts.map((prompt) => ({
    category: 'prompt',
    name: prompt.name,
    text: prompt.text,
    alwaysActive: true,
  }));
  const templateComponents = collected.promptTemplates.map((template) => ({
    category: 'template',
    name: template.name,
    text: template.text,
    alwaysActive: true,
  }));

  return promptComponents.length > 0 || templateComponents.length > 0
    ? [...promptComponents, ...templateComponents]
    : [];
}

function buildPromptChainInputs(
  collected: ReturnType<typeof collectPresetSources>,
): Array<{ name: string; text: string; type: string }> {
  if (collected.promptTemplates.length > 0) {
    return [...collected.promptTemplates]
      .sort((left, right) => left.order - right.order)
      .map((template) => ({
        name: template.name,
        text: template.text,
        type: template.chainType,
      }));
  }

  return [...collected.prompts]
    .sort((left, right) => left.order - right.order)
    .map((prompt) => ({
      name: prompt.name,
      text: prompt.text,
      type: prompt.chainType,
    }));
}

function toPromptElement(prompt: PromptSource): ElementCBSData {
  return {
    elementType: 'prompt',
    elementName: `[preset]/prompt/${prompt.name}`,
    reads: prompt.reads,
    writes: prompt.writes,
  };
}

function toTemplateElement(template: PromptSource): ElementCBSData {
  return {
    elementType: 'template',
    elementName: `[preset]/template/${template.name}`,
    reads: template.reads,
    writes: template.writes,
  };
}
