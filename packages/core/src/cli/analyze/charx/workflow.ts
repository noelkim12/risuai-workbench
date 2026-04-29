import fs from 'node:fs';
import path from 'node:path';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import {
  analyzeTextMentions,
  analyzeTokenBudget,
  analyzeVariableFlow,
  detectDeadCode,
  getAllLorebookEntries,
  getCustomScripts,
  analyzeLorebookStructureFromCharx,
  analyzeLorebookActivationChainsFromCharx,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
} from '@/domain';
import {
  assembleLorebookCollection,
  parseLorebookContent,
  parseLorebookOrder,
  type LorebookCanonicalFile,
} from '@/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '@/domain/regex';
import { ensureDir } from '@/node/fs-helpers';
import { type Locale, detectLocale } from '../shared/i18n';
import { safeCollect } from '../../shared';
import {
  buildLorebookEntryInfos,
  buildRegexScriptInfos,
  collectLorebookEntryInfosFromDir,
  collectLorebookTokenComponentsFromDir,
  collectLuaTokenComponents,
  collectNamedTextFileComponents,
  collectRegexScriptInfosFromDir,
  collectRegexTokenComponentsFromDir,
  collectSingleFileTokenComponent,
} from '../shared/cross-cutting';
import {
  collectHTMLCBS,
  collectLorebookCBS,
  collectRegexCBS,
  collectTSCBS,
  collectVariablesCBS,
  importLuaAnalysis,
  loadLuaArtifacts,
} from './collectors';
import { renderMarkdown } from './reporting';
import { renderHtml } from './reporting/htmlRenderer';
import {
  type CharxReportData,
  type CollectResult,
  type CorrelateResult,
  type ElementCBSData,
  type HtmlResult,
  type LorebookRegexCorrelation,
  type VariablesResult,
} from './types';
import { runCharxWiki } from './wiki/workflow';

const HELP_TEXT = `
  🐿️ RisuAI Character Card Analyzer

  Usage:  node analyze-charx.js <output-dir> [options]

  Options:
    --no-markdown     마크다운 리포트 생성 안 함
    --no-html         HTML 분석 시트 생성 안 함
    --wiki            HTML/마크다운과 함께 wiki 생성
    --wiki-only       HTML/마크다운 건너뛰고 wiki만 생성
    --wiki-root PATH  wiki 출력 루트 경로 (기본: <parent>/wiki)
    -h, --help        도움말

  Phases:
    1. COLLECT - 카드 데이터 수집
    2. CORRELATE - 상관관계 분석
    3. ANALYZE - 심층 분석
    4. REPORT - 리포트 생성

  Examples:
    node analyze-charx.js ./output
    node analyze-charx.js ./output --no-markdown
`;

/** 캐릭터 카드 분석 CLI 워크플로우. COLLECT → CORRELATE → ANALYZE → REPORT 4단계 파이프라인을 실행한다. */
export function runAnalyzeCharxWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const noMarkdown = argv.includes('--no-markdown');
  const noHtml = argv.includes('--no-html');
  const wiki = argv.includes('--wiki');
  const wikiOnly = argv.includes('--wiki-only');
  const wikiRootIdx = argv.indexOf('--wiki-root');
  const wikiRoot = wikiRootIdx >= 0 ? argv[wikiRootIdx + 1] : undefined;
  const locale = detectLocale(argv);
  const outputDir = argv.find((arg) => !arg.startsWith('-'));

  if (helpMode || !outputDir) {
    console.log(HELP_TEXT);
    return 0;
  }

  // Check for canonical workspace markers
  const hasCanonicalMarkers =
    fs.existsSync(path.join(outputDir, 'character')) ||
    fs.existsSync(path.join(outputDir, 'lorebooks')) ||
    fs.existsSync(path.join(outputDir, 'regex'));

  const charxJsonPath = resolveCharxJsonPath(outputDir);

  // Require either canonical markers or charx.json
  if (!hasCanonicalMarkers && !charxJsonPath) {
    console.error(`\n  ❌ Canonical charx workspace markers not found: ${outputDir}`);
    console.error(`  Expected one of:`);
    console.error(`    - character/ directory (canonical workspace)`);
    console.error(`    - lorebooks/ directory (canonical workspace)`);
    console.error(`    - regex/ directory (canonical workspace)`);
    console.error(`    - charx.json (legacy workspace)\n`);
    return 1;
  }

  try {
    runMain(outputDir, charxJsonPath, { noMarkdown, noHtml, wiki, wikiOnly, wikiRoot }, locale);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ analyze-charx 실행 실패: ${message}\n`);
    return 1;
  }
}

function runCollect(charx: unknown, resolvedOutDir: string, charxJsonPath: string | null): CollectResult {
  const lorebookCBS = safeCollect(
    () => collectLorebookCBS(charx, resolvedOutDir),
    'Lorebook CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const regexCBS = safeCollect(
    () => collectRegexCBS(charx, resolvedOutDir),
    'Regex CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const variables = safeCollect(
    () => collectVariablesCBS(charx, resolvedOutDir),
    'Variables 수집 실패',
    { variables: {}, cbsData: [] } as VariablesResult,
  );
  const html = safeCollect(() => collectHTMLCBS(charx, resolvedOutDir), 'HTML CBS 수집 실패', {
    cbsData: null,
    assetRefs: [],
  } as HtmlResult);
  const tsCBS = safeCollect(
    () => collectTSCBS(resolvedOutDir),
    'TS CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const luaArtifacts = safeCollect(
    () => loadLuaArtifacts(resolvedOutDir, charxJsonPath),
    'Lua 아티팩트 로드 실패',
    [] as LuaAnalysisArtifact[],
  );
  const luaCBS =
    luaArtifacts.length > 0
      ? luaArtifacts.flatMap((artifact) => artifact.elementCbs)
      : safeCollect(() => importLuaAnalysis(resolvedOutDir), 'Lua 분석 임포트 실패', [] as ElementCBSData[]);

  return { lorebookCBS, regexCBS, variables, html, tsCBS, luaCBS, luaArtifacts };
}

function runCorrelate(collected: CollectResult): CorrelateResult {
  const allCBSData = [
    ...collected.lorebookCBS,
    ...collected.regexCBS,
    ...collected.tsCBS,
    ...collected.luaCBS,
    ...(collected.html.cbsData ? [collected.html.cbsData] : []),
  ];
  const defaultVariables = collected.variables.variables || {};

  const unifiedGraph = safeCollect(
    () => buildUnifiedCBSGraph(allCBSData, defaultVariables),
    'Unified graph 빌드 실패',
    new Map(),
  );

  const lorebookRegexCorrelation = safeCollect(
    () =>
      buildLorebookRegexCorrelation(
        collected.lorebookCBS,
        collected.regexCBS,
      ) as LorebookRegexCorrelation,
    'LB-RX 상관관계 실패',
    {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    } as LorebookRegexCorrelation,
  );

  return { unifiedGraph, lorebookRegexCorrelation, defaultVariables };
}

function runMain(
  outputDir: string,
  charxJsonPath: string | null,
  options: { noMarkdown: boolean; noHtml: boolean; wiki: boolean; wikiOnly: boolean; wikiRoot?: string },
  locale: Locale,
): void {
  console.log('\n  🐿️ RisuAI Character Card Analyzer\n');

  const resolvedOutDir = path.resolve(outputDir);
  const analysisDir = path.join(resolvedOutDir, 'analysis');
  ensureDir(analysisDir);

  let charx: unknown;
  if (charxJsonPath && fs.existsSync(charxJsonPath)) {
    // Legacy mode: read from charx.json
    try {
      charx = JSON.parse(fs.readFileSync(charxJsonPath, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${path.basename(charxJsonPath)} 파싱 실패: ${message}`);
    }
  } else {
    // Canonical mode: build minimal charx structure for analysis
    charx = buildMinimalCharxFromCanonical(resolvedOutDir);
  }

  console.log('\n  ═══ Phase 1: COLLECT ═══');
  const collected = runCollect(charx, resolvedOutDir, charxJsonPath);
  console.log(
    `     ✅ Lorebook: ${collected.lorebookCBS.length}, Regex: ${collected.regexCBS.length}, TS: ${collected.tsCBS.length}, Lua: ${collected.luaCBS.length}`,
  );

  console.log('\n  ═══ Phase 2: CORRELATE ═══');
  const correlated = runCorrelate(collected);
  console.log(
    `     ✅ Unified graph: ${correlated.unifiedGraph.size} variables, LB↔RX shared: ${correlated.lorebookRegexCorrelation.summary.totalShared}`,
  );

  console.log('\n  ═══ Phase 3: ANALYZE ═══');
  const allCBSData = [
    ...collected.lorebookCBS,
    ...collected.regexCBS,
    ...collected.tsCBS,
    ...collected.luaCBS,
    ...(collected.html.cbsData ? [collected.html.cbsData] : []),
  ];
  const lorebookStructure = safeCollect(
    () => analyzeLorebookStructureFromCharx(charx),
    'Lorebook 구조 분석 실패',
    {
      folders: [],
      entries: [],
      stats: {
        totalEntries: 0,
        totalFolders: 0,
        activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
        enabledCount: 0,
        withCBS: 0,
      },
      keywords: { all: [], overlaps: {} },
    },
  );
  const tokenBudget = safeCollect(
    () => analyzeTokenBudget(buildCharxTokenComponents(resolvedOutDir, charx)),
    'Token budget 분석 실패',
    { components: [], byCategory: {}, totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 }, warnings: [] },
  );
  const variableFlow = safeCollect(
    () => analyzeVariableFlow(allCBSData, correlated.defaultVariables),
    'Variable flow 분석 실패',
    { variables: [], summary: { totalVariables: 0, withIssues: 0, byIssueType: {} } },
  );
  const deadCode = safeCollect(
    () =>
      detectDeadCode(variableFlow, {
        lorebookEntries: buildCharxLorebookInfos(resolvedOutDir, charx),
        regexScripts: buildCharxRegexInfos(resolvedOutDir, charx),
      }),
    'Dead code 분석 실패',
    { findings: [], summary: { totalFindings: 0, byType: {}, bySeverity: {} } },
  );
  const lorebookActivationChain = safeCollect(
    () => analyzeLorebookActivationChainsFromCharx(charx),
    'Lorebook activation chain 분석 실패',
    {
      entries: [],
      edges: [],
      summary: {
        totalEntries: 0,
        possibleEdges: 0,
        partialEdges: 0,
        blockedEdges: 0,
        recursiveScanningEnabled: true,
      },
    },
  );
  console.log(
      `     ✅ Lorebook: ${lorebookStructure.stats.totalEntries} entries, ${lorebookStructure.stats.totalFolders} folders`,
  );

  const allLuaApiNames = new Set<string>();
  for (const artifact of collected.luaArtifacts) {
    for (const fn of artifact.collected.functions) {
      if (fn.name && fn.name !== '<top-level>') {
        allLuaApiNames.add(fn.name);
      }
    }
  }

  // NOTE: lorebookStructure.entries filters out only folders (see
  // domain/lorebook/structure.ts), so we must apply the same filter here to
  // keep the positional index aligned. Previously this also filtered out
  // empty-content entries, which caused an index drift that mis-attributed
  // text mentions to the wrong lorebook entry. analyzeTextMentions already
  // skips empty content internally, so no extra filter is needed.
  const rawLorebookEntries = getAllLorebookEntries(charx) as Array<Record<string, unknown>>;
  const textMentionEntries = rawLorebookEntries
    .filter((e) => e.mode !== 'folder')
    .map((e, i) => {
      const name = typeof e.name === 'string' && e.name ? e.name
        : typeof e.comment === 'string' && e.comment ? e.comment
        : `entry-${i}`;
      const content = typeof e.content === 'string' ? e.content : '';
      const keys = Array.isArray(e.keys) ? (e.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [];
      return { id: lorebookStructure.entries[i]?.id ?? name, name, content, keys };
    });

  const textMentions = safeCollect(
    () => analyzeTextMentions(
      textMentionEntries,
      new Set(correlated.unifiedGraph.keys()),
      allLuaApiNames,
      textMentionEntries,
    ),
    'Text mention 분석 실패',
    [],
  );

  console.log('\n  ═══ Phase 4: REPORT ═══');
  const characterName = resolveCharxName(charx);
  const reportData: CharxReportData = {
    charx,
    characterName,
     ...correlated,
     lorebookStructure,
     lorebookActivationChain,
     htmlAnalysis: collected.html,
     tokenBudget,
    variableFlow,
    deadCode,
    textMentions,
    collected,
    luaArtifacts: collected.luaArtifacts,
  };

  if (!options.noMarkdown && !options.wikiOnly) {
    try {
      renderMarkdown(reportData, resolvedOutDir, locale);
      console.log(
        `     ✅ charx-analysis.md → ${path.relative('.', path.join(analysisDir, 'charx-analysis.md'))}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️ Markdown 리포트 생성 실패: ${message}`);
    }
  }

  if (!options.noHtml && !options.wikiOnly) {
    try {
      renderHtml(reportData, resolvedOutDir, locale);
      console.log(
        `     ✅ charx-analysis.html → ${path.relative('.', path.join(analysisDir, 'charx-analysis.html'))}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️ HTML 리포트 생성 실패: ${message}`);
    }
  }

  if (options.wiki || options.wikiOnly) {
    try {
      runCharxWiki(reportData, {
        extractDir: resolvedOutDir,
        wikiRoot: options.wikiRoot,
      });
      console.log(
        `     ✅ wiki → ${path.relative('.', path.join(path.dirname(resolvedOutDir), 'wiki'))}/`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️ wiki 생성 실패: ${message}`);
    }
  }

  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 분석 완료 → ${path.relative('.', analysisDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}

function resolveCharxJsonPath(outputDir: string): string | null {
  const primary = path.join(outputDir, 'charx.json');
  if (fs.existsSync(primary)) return primary;

  return null;
}

function resolveCharxName(charx: unknown): string {
  if (typeof charx !== 'object' || charx == null) return 'Unknown';
  const record = charx as { data?: { name?: unknown }; name?: unknown };
  if (typeof record.data?.name === 'string' && record.data.name.length > 0) return record.data.name;
  if (typeof record.name === 'string' && record.name.length > 0) return record.name;
  return 'Unknown';
}

/**
 * readCanonicalCharacterName 함수.
 * Canonical manifest에서 분석 대상 캐릭터 이름을 읽음.
 *
 * @param outputDir - 분석할 canonical character workspace 경로
 * @returns manifest에 기록된 캐릭터 이름 또는 null
 */
function readCanonicalCharacterName(outputDir: string): string | null {
  const manifestPath = path.join(outputDir, '.risuchar');
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name?: unknown };
    return typeof manifest.name === 'string' && manifest.name.length > 0 ? manifest.name : null;
  } catch {
    return null;
  }
}

/**
 * readLegacyCharacterName 함수.
 * Legacy metadata fallback에서 분석 대상 캐릭터 이름을 읽음.
 *
 * @param outputDir - 분석할 legacy character workspace 경로
 * @returns metadata에 기록된 캐릭터 이름 또는 null
 */
function readLegacyCharacterName(outputDir: string): string | null {
  const metadataPath = path.join(outputDir, 'character', 'metadata.json');
  if (!fs.existsSync(metadataPath)) return null;

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { name?: unknown };
    return typeof metadata.name === 'string' && metadata.name.length > 0 ? metadata.name : null;
  } catch {
    return null;
  }
}

/**
 * Build minimal charx structure from canonical artifacts for analysis.
 * This creates a skeleton charx object that allows existing analysis functions to work
 * without requiring the full charx.json file.
 */
function buildMinimalCharxFromCanonical(outputDir: string): unknown {
  const name = readCanonicalCharacterName(outputDir) ?? readLegacyCharacterName(outputDir) ?? 'Unknown';

  // Read lorebook entries from canonical .risulorebook files
  const lorebookEntries = collectLorebookEntriesFromCanonical(outputDir);

  // Read regex scripts from canonical .risuregex files
  const customScripts = collectRegexScriptsFromCanonical(outputDir);

  // Build minimal charx structure with populated lorebook and regex data
  return {
    spec: 'chara_card_v3',
    data: {
      name,
      character_book: { entries: lorebookEntries },
      extensions: {
        risuai: {
          customScripts,
        },
      },
    },
  };
}

/**
 * Collect lorebook entries from canonical .risulorebook files.
 * Converts canonical format to upstream charx format for analysis.
 */
function collectLorebookEntriesFromCanonical(outputDir: string): Array<Record<string, unknown>> {
  const lorebooksDir = path.join(outputDir, 'lorebooks');
  if (!fs.existsSync(lorebooksDir)) {
    return [];
  }

  const files: LorebookCanonicalFile[] = [];

  // Read all .risulorebook files recursively.
  // The current directory/file layout is the canonical source of folder identity,
  // so we intentionally ignore any stale frontmatter folder value here and let
  // assembleLorebookCollection rebuild upstream folder references from relative paths.
  const risuFiles = listRisuLorebookFilesRecursive(lorebooksDir);
  for (const filePath of risuFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content) continue;

    try {
      const parsed = parseLorebookContent(content);
      files.push({
        relativePath: path.relative(lorebooksDir, filePath).replace(/\\/g, '/'),
        content: {
          ...parsed,
          folder: undefined,
        },
      });
    } catch {
      // Ignore parse errors
    }
  }

  const orderPath = path.join(lorebooksDir, '_order.json');
  let declaredOrder: string[] | null = null;
  if (fs.existsSync(orderPath)) {
    try {
      declaredOrder = parseLorebookOrder(fs.readFileSync(orderPath, 'utf8'));
    } catch {
      declaredOrder = null;
    }
  }

  const assembled = assembleLorebookCollection(files, declaredOrder);
  return assembled.map((entry) => {
    const upstream: Record<string, unknown> = {
      name: entry.name,
      comment: entry.comment,
      mode: entry.mode,
      constant: entry.constant,
      selective: entry.selective,
      insertion_order: entry.insertion_order,
      case_sensitive: entry.case_sensitive,
      use_regex: entry.use_regex,
      keys: entry.keys,
      content: entry.content,
      enabled: true,
    };

    if (entry.secondary_keys !== undefined) {
      upstream.secondary_keys = entry.secondary_keys;
    }
    if (entry.folder !== undefined && entry.folder !== null) {
      upstream.folder = entry.folder;
    }

    return upstream;
  });
}

/**
 * Collect regex scripts from canonical .risuregex files.
 * Converts canonical format to upstream charx customScripts format for analysis.
 */
function collectRegexScriptsFromCanonical(outputDir: string): Array<Record<string, unknown>> {
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
      const name = path.basename(filePath, '.risuregex');

      // Convert canonical format to upstream charx format
      scripts.push({
        comment: parsed.comment || name,
        name,
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

function buildCharxTokenComponents(
  outputDir: string,
  charx: unknown,
): Array<{ category: string; name: string; text: string; alwaysActive: boolean }> {
  const fromExtracted = [
    ...collectNamedTextFileComponents(path.join(outputDir, 'character'), 'character', [
      'description.txt',
      'first_mes.txt',
      'system_prompt.txt',
      'replace_global_note.txt',
      'replace_global_note.risutext',
      'creator_notes.txt',
      'additional_text.txt',
    ]),
    ...collectLorebookTokenComponentsFromDir(path.join(outputDir, 'lorebooks'), 'lorebook'),
    ...collectRegexTokenComponentsFromDir(path.join(outputDir, 'regex'), 'regex'),
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
    ...collectLuaTokenComponents(outputDir, 'lua'),
    ...collectTstlTokenComponents(outputDir),
  ];

  return fromExtracted.length > 0 ? fromExtracted : buildFallbackCharxTokenComponents(charx);
}

function buildFallbackCharxTokenComponents(
  charx: unknown,
): Array<{ category: string; name: string; text: string; alwaysActive: boolean }> {
  if (typeof charx !== 'object' || charx == null) return [];
  const record = charx as { data?: Record<string, unknown> & { extensions?: { risuai?: Record<string, unknown> } } };
  const data = record.data ?? {};
  const risuai = data.extensions?.risuai ?? {};

  const textFields = [
    ['description', data.description],
    ['first_mes', data.first_mes],
    ['system_prompt', data.system_prompt],
    ['replace_global_note', data.replaceGlobalNote],
    ['creator_notes', data.creator_notes],
    ['additional_text', risuai.additionalText],
  ];

  return textFields.flatMap(([name, value]) =>
    typeof value === 'string' && value.length > 0
      ? [{ category: 'character', name: String(name), text: value, alwaysActive: true }]
      : [],
  );
}

function buildCharxLorebookInfos(outputDir: string, charx: unknown) {
  const fromDir = collectLorebookEntryInfosFromDir(path.join(outputDir, 'lorebooks'));
  return fromDir.length > 0 ? fromDir : buildLorebookEntryInfos(getAllLorebookEntries(charx));
}

function buildCharxRegexInfos(outputDir: string, charx: unknown) {
  const fromDir = collectRegexScriptInfosFromDir(path.join(outputDir, 'regex'));
  return fromDir.length > 0 ? fromDir : buildRegexScriptInfos(getCustomScripts(charx));
}

function collectTstlTokenComponents(
  outputDir: string,
): Array<{ category: string; name: string; text: string; alwaysActive: boolean }> {
  let tstlDir = path.join(outputDir, '..', 'tstl');
  if (!fs.existsSync(tstlDir)) {
    tstlDir = path.join(outputDir, 'tstl');
  }
  if (!fs.existsSync(tstlDir)) return [];

  return fs
    .readdirSync(tstlDir)
    .filter((fileName) => fileName.endsWith('.ts'))
    .map((fileName) => ({
      category: 'typescript',
      name: fileName,
      text: fs.readFileSync(path.join(tstlDir, fileName), 'utf-8'),
      alwaysActive: false,
    }));
}
