import fs from 'node:fs';
import path from 'node:path';
import {
  type ArtifactInput,
  analyzeComposition,
  collectLorebookCBS,
  collectRegexCBSFromCharx,
  getAllLorebookEntries,
  getCustomScripts,
  parseDefaultVariablesJson,
} from '@/domain';
import { readJsonIfExists } from '@/node/fs-helpers';
import { detectLocale } from '../shared/i18n';
import { collectHTMLCBS, collectTSCBS, collectVariablesCBS, importLuaAnalysis } from '../charx/collectors';
import { collectModuleCBS } from '../module/collectors';
import { collectPresetSources } from '../preset/collectors';
import {
  buildLorebookEntryInfos,
  buildRegexScriptInfos,
  collectLorebookEntryInfosFromDir,
  collectRegexScriptInfosFromDir,
} from '../shared/cross-cutting';
import { renderComposeMarkdown } from './reporting';
import { renderComposeHtml } from './reporting/htmlRenderer';
import type { ComposeReportData } from './types';

const HELP_TEXT = `
  🐿️ RisuAI Composition Analyzer

  Usage:  risu-core analyze --type compose <charx-dir> [--module <module-dir>...] [--preset <preset-dir>]

  Options:
    --module <dir>    Add a module directory (repeatable)
    --preset <dir>    Add a preset directory
    --help, -h        Show this help
`;

/** compose analyze CLI 진입점. */
export function runAnalyzeComposeWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  const locale = detectLocale(argv);
  const charxDir = argv.find((arg) => !arg.startsWith('-') && !isOptionValue(argv, arg));
  const moduleDirs = collectFlagValues(argv, '--module');
  const presetDir = collectFlagValue(argv, '--preset');

  if (!charxDir && moduleDirs.length === 0 && !presetDir) {
    console.error('  ❌ At least one artifact directory is required.');
    return 1;
  }

  try {
    const charx = charxDir ? buildCharxArtifactInput(charxDir) : undefined;
    const modules = moduleDirs.map((dir) => buildModuleArtifactInput(dir));
    const preset = presetDir ? buildPresetArtifactInput(presetDir) : undefined;
    const result = analyzeComposition({ charx, modules, preset });

    const outputDir = charxDir ?? moduleDirs[0] ?? presetDir;
    if (!outputDir) {
      console.error('  ❌ No output directory could be resolved.');
      return 1;
    }
    const analysisDir = path.join(outputDir, 'analysis');
    const reportData: ComposeReportData = { result };

    renderComposeMarkdown(reportData, analysisDir, locale);
    renderComposeHtml(reportData, analysisDir, locale);

    console.log(`  ✅ Composition analysis complete: ${analysisDir}`);
    console.log(`  📊 Compatibility score: ${result.summary.compatibilityScore}/100`);
    console.log(`  ⚠️  Conflicts found: ${result.summary.totalConflicts}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Composition analysis failed: ${message}\n`);
    return 1;
  }
}

function collectFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && index + 1 < argv.length) {
      values.push(argv[index + 1]!);
    }
  }
  return values;
}

function collectFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1]! : null;
}

function isOptionValue(argv: readonly string[], value: string): boolean {
  const index = argv.indexOf(value);
  if (index <= 0) return false;
  const prev = argv[index - 1];
  return prev === '--module' || prev === '--preset' || prev === '--type' || prev === '--locale';
}

function buildCharxArtifactInput(outputDir: string): ArtifactInput {
  const charxPath = path.join(outputDir, 'charx.json');
  if (!fs.existsSync(charxPath)) {
    throw new Error(`charx.json을 찾을 수 없습니다: ${charxPath}`);
  }
  const charx = JSON.parse(fs.readFileSync(charxPath, 'utf-8')) as unknown;
  const variables = collectVariablesCBS(charx, outputDir).variables;
  const regexScripts = getCustomScripts(charx);
  const elements = [
    ...collectLorebookCBS(getAllLorebookEntries(charx)),
    ...collectRegexCBSFromCharx(charx),
    ...collectTSCBS(outputDir),
    ...importLuaAnalysis(outputDir),
    ...(collectHTMLCBS(charx, outputDir).cbsData ? [collectHTMLCBS(charx, outputDir).cbsData!] : []),
  ];

  return {
    name: resolveCharxName(charx) || path.basename(outputDir),
    type: 'charx',
    elements,
    defaultVariables: variables,
    lorebookKeywords: groupLorebookKeywords(buildLorebookEntryInfos(getAllLorebookEntries(charx))),
    regexPatterns: buildRegexScriptInfos(regexScripts).map((script, index) => ({ ...script, order: index })),
  };
}

function buildModuleArtifactInput(outputDir: string): ArtifactInput {
  const modulePath = path.join(outputDir, 'module.json');
  if (!fs.existsSync(modulePath)) {
    throw new Error(`module.json을 찾을 수 없습니다: ${modulePath}`);
  }
  const collected = collectModuleCBS(outputDir);
  const elements = [
    ...collected.lorebookCBS,
    ...collected.regexCBS,
    ...collected.luaCBS,
    ...(collected.htmlCBS ? [collected.htmlCBS] : []),
  ];

  return {
    name:
      typeof collected.metadata.name === 'string' && collected.metadata.name.length > 0
        ? collected.metadata.name
        : path.basename(outputDir),
    type: 'module',
    elements,
    defaultVariables: parseDefaultVariablesJson(readJsonIfExists(path.join(outputDir, 'variables', 'default.json')) ?? {}),
    lorebookKeywords: groupLorebookKeywords(collectLorebookEntryInfosFromDir(path.join(outputDir, 'lorebooks'), '[module]')),
    regexPatterns: collectRegexPatternsFromDir(path.join(outputDir, 'regex'), '[module]'),
    namespace:
      typeof collected.metadata.namespace === 'string' && collected.metadata.namespace.length > 0
        ? collected.metadata.namespace
        : undefined,
  };
}

function buildPresetArtifactInput(outputDir: string): ArtifactInput {
  const presetPath = path.join(outputDir, 'preset.json');
  if (!fs.existsSync(presetPath)) {
    throw new Error(`preset.json을 찾을 수 없습니다: ${presetPath}`);
  }
  const collected = collectPresetSources(outputDir);
  const elements = [
    ...collected.prompts.map((prompt) => ({
      elementType: 'prompt' as const,
      elementName: `[preset]/prompt/${prompt.name}`,
      reads: prompt.reads,
      writes: prompt.writes,
    })),
    ...collected.promptTemplates.map((template) => ({
      elementType: 'template' as const,
      elementName: `[preset]/template/${template.name}`,
      reads: template.reads,
      writes: template.writes,
    })),
    ...collected.regexCBS,
  ];

  return {
    name:
      typeof collected.metadata.name === 'string' && collected.metadata.name.length > 0
        ? collected.metadata.name
        : path.basename(outputDir),
    type: 'preset',
    elements,
    defaultVariables: {},
    regexPatterns: collectRegexPatternsFromDir(path.join(outputDir, 'regex'), '[preset]'),
  };
}

function groupLorebookKeywords(
  entries: Array<{ name: string; keywords: string[] }>,
): Record<string, string[]> {
  const keywordMap: Record<string, string[]> = {};
  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      keywordMap[keyword] ??= [];
      keywordMap[keyword]!.push(entry.name);
    }
  }
  return keywordMap;
}

function collectRegexPatternsFromDir(
  regexDir: string,
  prefix: string,
): Array<{ name: string; in: string; order?: number }> {
  return collectRegexScriptInfosFromDir(regexDir, prefix).map((script, index) => ({
    ...script,
    order: index,
  }));
}

function resolveCharxName(charx: unknown): string {
  if (typeof charx !== 'object' || charx == null) return 'Unknown';
  const record = charx as { data?: { name?: unknown }; name?: unknown };
  if (typeof record.data?.name === 'string' && record.data.name.length > 0) return record.data.name;
  if (typeof record.name === 'string' && record.name.length > 0) return record.name;
  return 'Unknown';
}
