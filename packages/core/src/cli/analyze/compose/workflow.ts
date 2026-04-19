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
import { parseLorebookContent } from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '@/domain/regex';
import { parseVariableContent } from '@/domain/custom-extension/extensions/variable';
import { readJsonIfExists, readTextIfExists } from '@/node/fs-helpers';
import { detectLocale } from '../shared/i18n';
import { collectHTMLCBS, collectTSCBS, collectVariablesCBS, importLuaAnalysis, loadLuaArtifacts } from '../charx/collectors';
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
  // Check for canonical markers or legacy charx.json
  const hasCanonicalMarkers =
    fs.existsSync(path.join(outputDir, 'character')) ||
    fs.existsSync(path.join(outputDir, 'lorebooks'));
  const charxPath = path.join(outputDir, 'charx.json');
  const hasLegacyCharxJson = fs.existsSync(charxPath);

  if (!hasCanonicalMarkers && !hasLegacyCharxJson) {
    throw new Error(
      `Canonical charx workspace markers not found: ${outputDir}. ` +
        `Expected character/ or lorebooks/ directory (canonical) or charx.json (legacy)`,
    );
  }

  // Build charx from legacy JSON or create minimal structure for canonical workspace
  let charx: unknown;
  if (hasLegacyCharxJson) {
    charx = JSON.parse(fs.readFileSync(charxPath, 'utf-8'));
  } else {
    charx = buildMinimalCharxForCompose(outputDir);
  }

  const variables = collectVariablesCBS(charx, outputDir).variables;
  const regexScripts = getCustomScripts(charx);

  // Use fresh Lua analysis from source files when available, fallback to imported analysis
  const luaArtifacts = loadLuaArtifacts(outputDir, charxPath);
  const luaCBS = luaArtifacts.length > 0
    ? luaArtifacts.flatMap((artifact) => artifact.elementCbs)
    : importLuaAnalysis(outputDir);

  const elements = [
    ...collectLorebookCBS(getAllLorebookEntries(charx)),
    ...collectRegexCBSFromCharx(charx),
    ...collectTSCBS(outputDir),
    ...luaCBS,
    ...(collectHTMLCBS(charx, outputDir).cbsData ? [collectHTMLCBS(charx, outputDir).cbsData!] : []),
  ];

  // For canonical workspaces without charx.json, read lorebook keywords and regex from canonical files
  const lorebookKeywords = hasLegacyCharxJson
    ? groupLorebookKeywords(buildLorebookEntryInfos(getAllLorebookEntries(charx)))
    : collectLorebookKeywordsFromCanonical(outputDir);

  const regexPatterns = hasLegacyCharxJson
    ? buildRegexScriptInfos(regexScripts).map((script, index) => ({ ...script, order: index }))
    : collectRegexPatternsFromCanonical(outputDir);

  return {
    name: resolveCharxName(charx) || path.basename(outputDir),
    type: 'charx',
    elements,
    defaultVariables: variables,
    lorebookKeywords,
    regexPatterns,
  };
}

function buildModuleArtifactInput(outputDir: string): ArtifactInput {
  // Check for canonical markers or legacy module.json
  const hasCanonicalMarkers =
    fs.existsSync(path.join(outputDir, 'metadata.json')) &&
    fs.existsSync(path.join(outputDir, 'lorebooks'));
  const modulePath = path.join(outputDir, 'module.json');
  const hasLegacyModuleJson = fs.existsSync(modulePath);

  if (!hasCanonicalMarkers && !hasLegacyModuleJson) {
    throw new Error(
      `Canonical module workspace markers not found: ${outputDir}. ` +
        `Expected metadata.json + lorebooks/ directory (canonical) or module.json (legacy)`,
    );
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
    defaultVariables: collectModuleVariables(outputDir),
    lorebookKeywords: groupLorebookKeywords(collectLorebookEntryInfosFromDir(path.join(outputDir, 'lorebooks'), '[module]')),
    regexPatterns: collectRegexPatternsFromDir(path.join(outputDir, 'regex'), '[module]'),
    namespace:
      typeof collected.metadata.namespace === 'string' && collected.metadata.namespace.length > 0
        ? collected.metadata.namespace
        : undefined,
  };
}

function buildPresetArtifactInput(outputDir: string): ArtifactInput {
  // Check for canonical markers or legacy preset.json
  const hasCanonicalMarkers =
    fs.existsSync(path.join(outputDir, 'metadata.json')) &&
    fs.existsSync(path.join(outputDir, 'prompts'));
  const presetPath = path.join(outputDir, 'preset.json');
  const hasLegacyPresetJson = fs.existsSync(presetPath);

  if (!hasCanonicalMarkers && !hasLegacyPresetJson) {
    throw new Error(
      `Canonical preset workspace markers not found: ${outputDir}. ` +
        `Expected metadata.json + prompts/ directory (canonical) or preset.json (legacy)`,
    );
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

/**
 * Collect module default variables from canonical .risuvar file or legacy default.json.
 * Canonical path: variables/<moduleName>.risuvar
 * Legacy path: variables/default.json
 */
function collectModuleVariables(outputDir: string): Record<string, string> {
  const variablesDir = path.join(outputDir, 'variables');
  if (!fs.existsSync(variablesDir)) {
    return {};
  }

  // Try canonical .risuvar files first
  const risuvarFiles = fs.readdirSync(variablesDir).filter((f) => f.endsWith('.risuvar'));
  if (risuvarFiles.length > 0) {
    // Use the first .risuvar file found (should be the module's variables)
    const risuvarPath = path.join(variablesDir, risuvarFiles[0]!);
    const content = readTextIfExists(risuvarPath);
    if (content) {
      try {
        return parseVariableContent(content);
      } catch {
        // Fall through to legacy format
      }
    }
  }

  // Fallback to legacy default.json
  const jsonPath = path.join(variablesDir, 'default.json');
  const jsonContent = readJsonIfExists(jsonPath);
  if (jsonContent) {
    return parseDefaultVariablesJson(jsonContent ?? {});
  }

  // Fallback to legacy default.txt
  const txtPath = path.join(variablesDir, 'default.txt');
  const txtContent = readTextIfExists(txtPath);
  if (txtContent && txtContent.trim()) {
    // Parse key=value format
    const variables: Record<string, string> = {};
    for (const line of txtContent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        variables[line] = '';
      } else {
        variables[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
      }
    }
    return variables;
  }

  return {};
}

/**
 * Build minimal charx structure from canonical artifacts for compose analysis.
 */
function buildMinimalCharxForCompose(outputDir: string): unknown {
  // Read character metadata if available
  const metadataPath = path.join(outputDir, 'character', 'metadata.json');
  let name = 'Unknown';

  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { name?: string };
      if (typeof metadata.name === 'string' && metadata.name.length > 0) {
        name = metadata.name;
      }
    } catch {
      // Ignore metadata parse errors
    }
  }

  // Build minimal charx structure
  return {
    spec: 'chara_card_v3',
    data: {
      name,
      character_book: { entries: [] },
      extensions: {
        risuai: {
          customScripts: [],
        },
      },
    },
  };
}

/**
 * Collect lorebook keywords from canonical .risulorebook files.
 * Used when charx.json is not available.
 */
function collectLorebookKeywordsFromCanonical(outputDir: string): Record<string, string[]> {
  const lorebooksDir = path.join(outputDir, 'lorebooks');
  if (!fs.existsSync(lorebooksDir)) {
    return {};
  }

  const keywordMap: Record<string, string[]> = {};

  // Read all .risulorebook files recursively
  const risuFiles = listRisuLorebookFilesRecursive(lorebooksDir);
  for (const filePath of risuFiles) {
    const content = readTextIfExists(filePath);
    if (!content) continue;

    try {
      const parsed = parseLorebookContent(content);
      const entryName = path.basename(filePath, '.risulorebook');

      // Add each key as a keyword mapping to this entry
      for (const key of parsed.keys) {
        if (!keywordMap[key]) {
          keywordMap[key] = [];
        }
        if (!keywordMap[key].includes(entryName)) {
          keywordMap[key].push(entryName);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return keywordMap;
}

/**
 * Collect regex patterns from canonical .risuregex files.
 * Used when charx.json is not available.
 */
function collectRegexPatternsFromCanonical(outputDir: string): Array<{ name: string; in: string; order?: number }> {
  const regexDir = path.join(outputDir, 'regex');
  if (!fs.existsSync(regexDir)) {
    return [];
  }

  const patterns: Array<{ name: string; in: string; order?: number }> = [];

  // Read all .risuregex files recursively
  const risuFiles = listRisuRegexFilesRecursive(regexDir);
  for (const [index, filePath] of risuFiles.entries()) {
    const content = readTextIfExists(filePath);
    if (!content) continue;

    try {
      const parsed = parseRegexContent(content);
      const name = path.basename(filePath, '.risuregex');

      patterns.push({
        name,
        in: parsed.in,
        order: risuFiles.length - index, // Reverse order for execution priority
      });
    } catch {
      // Ignore parse errors
    }
  }

  return patterns;
}

/** List all .risulorebook files recursively. */
function listRisuLorebookFilesRecursive(rootDir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listRisuLorebookFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.risulorebook')) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/** List all .risuregex files recursively. */
function listRisuRegexFilesRecursive(rootDir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listRisuRegexFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.risuregex')) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}
