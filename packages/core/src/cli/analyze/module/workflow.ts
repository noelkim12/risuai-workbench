import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeTokenBudget,
  analyzeVariableFlow,
  detectDeadCode,
  analyzeLorebookStructure,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
  getModuleLorebookEntriesFromModule,
} from '@/domain';
import { readJsonIfExists } from '@/node/fs-helpers';
import { detectLocale } from '../shared/i18n';
import { runAnalyzeWorkflow as runLuaAnalyzeWorkflow } from '../lua/workflow';
import {
  collectLorebookEntryInfosFromDir,
  collectLorebookTokenComponentsFromDir,
  collectLuaTokenComponents,
  collectRegexScriptInfosFromDir,
  collectRegexTokenComponentsFromDir,
  collectSingleFileTokenComponent,
} from '../shared/cross-cutting';
import { collectModuleCBS } from './collectors';
import { renderModuleMarkdown } from './reporting';
import { renderModuleHtml } from './reporting/htmlRenderer';
import type { ModuleReportData } from './types';

const HELP_TEXT = `
  🐿️ RisuAI Module Analyzer

  Usage:  risu-core analyze --type module <extracted-module-dir> [options]

  Output:
    analysis/module-analysis.md    Markdown summary report
    analysis/module-analysis.html  Self-contained HTML report

  Options:
    --help, -h    Show this help
`;

/** module analyze CLI 진입점. COLLECT → CORRELATE → REPORT 파이프라인을 실행한다. */
export function runAnalyzeModuleWorkflow(argv: readonly string[]): number {
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

  const moduleJsonPath = path.join(outputDir, 'module.json');
  if (!fs.existsSync(moduleJsonPath)) {
    console.error(`\n  ❌ module.json을 찾을 수 없습니다: ${moduleJsonPath}\n`);
    return 1;
  }

  try {
    ensureLuaAnalysis(outputDir);

    const collected = collectModuleCBS(outputDir);
    const moduleJson = readJsonIfExists(moduleJsonPath);
    const moduleName =
      typeof collected.metadata.name === 'string' && collected.metadata.name.length > 0
        ? collected.metadata.name
        : path.basename(outputDir);

    const allCBS = [
      ...collected.lorebookCBS,
      ...collected.regexCBS,
      ...collected.luaCBS,
      ...(collected.htmlCBS ? [collected.htmlCBS] : []),
    ];
    const unifiedGraph = buildUnifiedCBSGraph(allCBS, {});
    const lorebookRegexCorrelation = buildLorebookRegexCorrelation(
      collected.lorebookCBS,
      collected.regexCBS,
    );
    const tokenBudget = analyzeTokenBudget([
      ...collectLorebookTokenComponentsFromDir(path.join(outputDir, 'lorebooks'), 'lorebook', '[module]'),
      ...collectRegexTokenComponentsFromDir(path.join(outputDir, 'regex'), 'regex', '[module]'),
      ...collectLuaTokenComponents(outputDir, 'lua'),
      ...collectSingleFileTokenComponent(
        path.join(outputDir, 'html', 'background.html'),
        'html',
        'background.html',
        true,
      ),
    ]);
    const variableFlow = analyzeVariableFlow(allCBS, {});
    const deadCode = detectDeadCode(variableFlow, {
      lorebookEntries: collectLorebookEntryInfosFromDir(path.join(outputDir, 'lorebooks'), '[module]'),
      regexScripts: collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'), '[module]'),
    });
    const lorebookStructure = analyzeLorebookStructure(
      getModuleLorebookEntriesFromModule(moduleJson),
    );

    const reportData: ModuleReportData = {
      moduleName,
      collected,
      unifiedGraph,
      lorebookRegexCorrelation,
      lorebookStructure,
      tokenBudget,
      variableFlow,
      deadCode,
    };

    renderModuleMarkdown(reportData, outputDir, locale);
    renderModuleHtml(reportData, outputDir, locale);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Module analysis failed: ${message}\n`);
    return 1;
  }
}

function ensureLuaAnalysis(outputDir: string): void {
  const luaDir = path.join(outputDir, 'lua');
  if (!fs.existsSync(luaDir)) return;

  const luaFiles = fs.readdirSync(luaDir).filter((file) => file.endsWith('.lua'));
  for (const luaFile of luaFiles) {
    const luaPath = path.join(luaDir, luaFile);
    const analysisPath = luaPath.replace(/\.lua$/u, '.analysis.json');
    if (fs.existsSync(analysisPath)) continue;

    const code = runLuaAnalyzeWorkflow([luaPath, '--json', '--no-markdown', '--no-html']);
    if (code !== 0) {
      console.error(`  ⚠️ Lua analyze failed: ${luaFile} — exit code ${code}`);
    }
  }
}
