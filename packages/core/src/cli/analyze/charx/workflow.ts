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

const HELP_TEXT = `
  🐿️ RisuAI Character Card Analyzer

  Usage:  node analyze-charx.js <output-dir> [options]

  Options:
    --no-markdown     마크다운 리포트 생성 안 함
    --no-html         HTML 분석 시트 생성 안 함
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
  const locale = detectLocale(argv);
  const outputDir = argv.find((arg) => !arg.startsWith('-'));

  if (helpMode || !outputDir) {
    console.log(HELP_TEXT);
    return 0;
  }

  const charxJsonPath = resolveCharxJsonPath(outputDir);
  if (!charxJsonPath) {
    console.error(`\n  ❌ charx.json을 찾을 수 없습니다: ${path.join(outputDir, 'charx.json')}\n`);
    return 1;
  }

  try {
    runMain(outputDir, charxJsonPath, { noMarkdown, noHtml }, locale);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ analyze-charx 실행 실패: ${message}\n`);
    return 1;
  }
}

function runCollect(charx: unknown, resolvedOutDir: string, charxJsonPath: string): CollectResult {
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
  charxJsonPath: string,
  options: { noMarkdown: boolean; noHtml: boolean },
  locale: Locale,
): void {
  console.log('\n  🐿️ RisuAI Character Card Analyzer\n');

  const resolvedOutDir = path.resolve(outputDir);
  const analysisDir = path.join(resolvedOutDir, 'analysis');
  ensureDir(analysisDir);

  let charx: unknown;
  try {
    charx = JSON.parse(fs.readFileSync(charxJsonPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(charxJsonPath)} 파싱 실패: ${message}`);
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
        activationModes: { normal: 0, constant: 0, selective: 0 },
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

  const rawLorebookEntries = getAllLorebookEntries(charx) as Array<Record<string, unknown>>;
  const textMentionEntries = rawLorebookEntries
    .filter((e) => e.mode !== 'folder' && typeof e.content === 'string' && (e.content as string).length > 0)
    .map((e, i) => {
      const name = typeof e.name === 'string' && e.name ? e.name
        : typeof e.comment === 'string' && e.comment ? e.comment
        : `entry-${i}`;
      return { id: lorebookStructure.entries[i]?.id ?? name, name, content: e.content as string };
    });

  const textMentions = safeCollect(
    () => analyzeTextMentions(
      textMentionEntries,
      new Set(correlated.unifiedGraph.keys()),
      allLuaApiNames,
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

  if (!options.noMarkdown) {
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

  if (!options.noHtml) {
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

function buildCharxTokenComponents(
  outputDir: string,
  charx: unknown,
): Array<{ category: string; name: string; text: string; alwaysActive: boolean }> {
  const fromExtracted = [
    ...collectNamedTextFileComponents(path.join(outputDir, 'character'), 'character', [
      'description.txt',
      'first_mes.txt',
      'system_prompt.txt',
      'post_history_instructions.txt',
      'creator_notes.txt',
      'additional_text.txt',
    ]),
    ...collectLorebookTokenComponentsFromDir(path.join(outputDir, 'lorebooks'), 'lorebook'),
    ...collectRegexTokenComponentsFromDir(path.join(outputDir, 'regex'), 'regex'),
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
    ['post_history_instructions', data.post_history_instructions],
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
