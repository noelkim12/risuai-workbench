import fs from 'node:fs';
import path from 'node:path';
import { buildUnifiedCBSGraph, type ElementCBSData } from '@/domain';
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

  const outputDir = argv.find((arg) => !arg.startsWith('-'));
  if (!outputDir || !fs.existsSync(outputDir)) {
    console.error('\n  ❌ Target directory not found.\n');
    return 1;
  }

  const presetJsonPath = path.join(outputDir, 'preset.json');
  if (!fs.existsSync(presetJsonPath)) {
    console.error(`\n  ❌ preset.json을 찾을 수 없습니다: ${presetJsonPath}\n`);
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

    const reportData: PresetReportData = {
      presetName,
      collected,
      unifiedGraph,
    };

    renderPresetMarkdown(reportData, outputDir);
    renderPresetHtml(reportData, outputDir);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Preset analysis failed: ${message}\n`);
    return 1;
  }
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
