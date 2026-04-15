import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeTextMentions,
  analyzeTokenBudget,
  analyzeVariableFlow,
  detectDeadCode,
  analyzeLorebookStructure,
  analyzeLorebookActivationChainsFromModule,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
  getModuleLorebookEntriesFromModule,
} from '@/domain';
import { parseLorebookContent } from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '@/domain/custom-extension/extensions/regex';
import { readJsonIfExists } from '@/node/fs-helpers';
import { detectLocale } from '../shared/i18n';
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
import { runModuleWiki } from './wiki/workflow';

const HELP_TEXT = `
  🐿️ RisuAI Module Analyzer

  Usage:  risu-core analyze --type module <extracted-module-dir> [options]

  Output:
    analysis/module-analysis.md    Markdown summary report
    analysis/module-analysis.html  Self-contained HTML report

  Options:
    --wiki            Generate wiki alongside markdown/html
    --wiki-only       Generate wiki only
    --wiki-root PATH  Wiki output root (default: <parent>/wiki)
    --help, -h        Show this help
`;

/** module analyze CLI 진입점. COLLECT → CORRELATE → REPORT 파이프라인을 실행한다. */
export function runAnalyzeModuleWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');
  const wiki = argv.includes('--wiki');
  const wikiOnly = argv.includes('--wiki-only');
  const wikiRootIdx = argv.indexOf('--wiki-root');
  const wikiRoot = wikiRootIdx >= 0 ? argv[wikiRootIdx + 1] : undefined;

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

  // Check for canonical workspace markers or legacy module.json
  const hasCanonicalMarkers =
    fs.existsSync(path.join(outputDir, 'metadata.json')) &&
    fs.existsSync(path.join(outputDir, 'lorebooks'));
  const hasLegacyModuleJson = fs.existsSync(path.join(outputDir, 'module.json'));

  if (!hasCanonicalMarkers && !hasLegacyModuleJson) {
    console.error(`\n  ❌ Canonical module workspace markers not found: ${outputDir}`);
    console.error(`  Expected one of:`);
    console.error(`    - metadata.json + lorebooks/ directory (canonical workspace)`);
    console.error(`    - module.json (legacy workspace)\n`);
    return 1;
  }

  try {
    const collected = collectModuleCBS(outputDir);

    // Build module data from canonical artifacts or legacy module.json
    const moduleJsonPath = path.join(outputDir, 'module.json');
    const moduleJson = readJsonIfExists(moduleJsonPath);
    const moduleData = moduleJson ?? buildMinimalModuleFromCanonical(outputDir);

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
      // Canonical format: background.risuhtml (preferred), fallback to background.html
      ...collectSingleFileTokenComponent(
        path.join(outputDir, 'html', 'background.risuhtml'),
        'html',
        'background.risuhtml',
        true,
      ),
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
      getModuleLorebookEntriesFromModule(moduleData),
    );
    const lorebookActivationChain = analyzeLorebookActivationChainsFromModule(moduleData);

    const allLuaApiNames = new Set<string>();
    for (const artifact of collected.luaArtifacts) {
      for (const fn of artifact.collected.functions) {
        if (fn.name && fn.name !== '<top-level>') {
          allLuaApiNames.add(fn.name);
        }
      }
    }

    // NOTE: Must match lorebookStructure.entries filter (folders only) to
    // keep positional indices aligned. See charx/workflow.ts for details.
    const rawModuleEntries = getModuleLorebookEntriesFromModule(moduleData) as Array<Record<string, unknown>>;
    const textMentionEntries = rawModuleEntries
      .filter((e) => e.mode !== 'folder')
      .map((e, i) => {
        const name = typeof e.name === 'string' && e.name ? e.name
          : typeof e.comment === 'string' && e.comment ? e.comment
          : `entry-${i}`;
        const content = typeof e.content === 'string' ? e.content : '';
        const keys = Array.isArray(e.keys) ? (e.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [];
        return { id: lorebookStructure?.entries[i]?.id ?? name, name, content, keys };
      });

    const textMentions = analyzeTextMentions(
      textMentionEntries,
      new Set(unifiedGraph.keys()),
      allLuaApiNames,
      textMentionEntries,
    );

    const reportData: ModuleReportData = {
      moduleName,
      collected,
      unifiedGraph,
      lorebookRegexCorrelation,
      lorebookStructure,
      lorebookActivationChain,
      tokenBudget,
      variableFlow,
      deadCode,
      textMentions,
      luaArtifacts: collected.luaArtifacts,
    };

    if (!wikiOnly) {
      renderModuleMarkdown(reportData, outputDir, locale);
      renderModuleHtml(reportData, outputDir, locale);
    }
    if (wiki || wikiOnly) {
      runModuleWiki(reportData, {
        extractDir: outputDir,
        wikiRoot,
      });
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Module analysis failed: ${message}\n`);
    return 1;
  }
}

/**
 * Build minimal module structure from canonical artifacts for analysis.
 * This creates a skeleton module object that allows existing analysis functions to work
 * without requiring the full module.json file.
 */
function buildMinimalModuleFromCanonical(outputDir: string): Record<string, unknown> {
  // Read metadata if available
  const metadataPath = path.join(outputDir, 'metadata.json');
  let name = 'Unknown';
  let namespace: string | undefined;

  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as {
        name?: string;
        namespace?: string;
      };
      if (typeof metadata.name === 'string' && metadata.name.length > 0) {
        name = metadata.name;
      }
      if (typeof metadata.namespace === 'string' && metadata.namespace.length > 0) {
        namespace = metadata.namespace;
      }
    } catch {
      // Ignore metadata parse errors
    }
  }

  // Read lorebook entries from canonical .risulorebook files
  const lorebookEntries = collectModuleLorebookEntriesFromCanonical(outputDir);

  // Read regex scripts from canonical .risuregex files
  const regexScripts = collectModuleRegexScriptsFromCanonical(outputDir);

  // Build minimal module structure with populated lorebook and regex data
  const moduleData: Record<string, unknown> = {
    name,
    lorebook: lorebookEntries,
    regex: regexScripts,
    trigger: [],
  };

  if (namespace !== undefined) {
    moduleData.namespace = namespace;
  }

  return moduleData;
}

/**
 * Collect module lorebook entries from canonical .risulorebook files.
 * Converts canonical format to upstream module format for analysis.
 */
function collectModuleLorebookEntriesFromCanonical(outputDir: string): Array<Record<string, unknown>> {
  const lorebooksDir = path.join(outputDir, 'lorebooks');
  if (!fs.existsSync(lorebooksDir)) {
    return [];
  }

  const entries: Array<Record<string, unknown>> = [];

  // Read all .risulorebook files recursively
  const risuFiles = listRisuLorebookFilesRecursive(lorebooksDir);
  for (const filePath of risuFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content) continue;

    try {
      const parsed = parseLorebookContent(content);

      // Convert canonical format to upstream module format
      // Module format uses 'key' (single) instead of 'keys' (array)
      const entry: Record<string, unknown> = {
        comment: parsed.comment,
        content: parsed.content,
        mode: parsed.mode,
        alwaysActive: parsed.constant,
        selective: parsed.selective,
        insertorder: parsed.insertion_order,
        useRegex: parsed.use_regex,
        // Module uses single key, take first key from canonical keys array
        key: parsed.keys[0] ?? '',
      };

      // Add optional fields if present
      if (parsed.secondary_keys !== undefined && parsed.secondary_keys.length > 0) {
        entry.secondkey = parsed.secondary_keys[0]; // Module uses single secondkey
      }
      if (parsed.folder !== undefined && parsed.folder !== null) {
        entry.folder = parsed.folder;
      }
      if (parsed.book_version !== undefined) {
        entry.bookVersion = parsed.book_version;
      }
      if (parsed.activation_percent !== undefined) {
        entry.activationPercent = parsed.activation_percent;
      }

      entries.push(entry);
    } catch {
      // Ignore parse errors
    }
  }

  return entries;
}

/**
 * Collect module regex scripts from canonical .risuregex files.
 * Converts canonical format to upstream module format for analysis.
 */
function collectModuleRegexScriptsFromCanonical(outputDir: string): Array<Record<string, unknown>> {
  const regexDir = path.join(outputDir, 'regex');
  if (!fs.existsSync(regexDir)) {
    return [];
  }

  const scripts: Array<Record<string, unknown>> = [];

  // Read all .risuregex files recursively
  const risuFiles = listRisuRegexFilesRecursive(regexDir);
  for (const [index, filePath] of risuFiles.entries()) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content) continue;

    try {
      const parsed = parseRegexContent(content);
      const comment = parsed.comment || path.basename(filePath, '.risuregex');

      // Convert canonical format to upstream module format
      scripts.push({
        comment,
        in: parsed.in,
        out: parsed.out,
        flag: parsed.flag,
        ableFlag: parsed.ableFlag,
        type: parsed.type,
        order: risuFiles.length - index, // Reverse order for execution priority
      });
    } catch {
      // Ignore parse errors
    }
  }

  return scripts;
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
