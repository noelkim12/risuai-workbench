import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeLorebookStructureFromCard,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
} from '@/domain';
import { ensureDir } from '@/node/fs-helpers';
import { safeCollect } from '../../shared';
import {
  collectHTMLCBS,
  collectLorebookCBS,
  collectRegexCBS,
  collectTSCBS,
  collectVariablesCBS,
  importLuaAnalysis,
} from './collectors';
import { renderMarkdown } from './reporting';
import { renderHtml } from './reporting/htmlRenderer';
import {
  type ElementCBSData,
  type HtmlResult,
  type LorebookRegexCorrelation,
  type VariablesResult,
} from './types';

const HELP_TEXT = `
  🐿️ RisuAI Character Card Analyzer

  Usage:  node analyze-card.js <output-dir> [options]

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
    node analyze-card.js ./output
    node analyze-card.js ./output --no-markdown
`;

export function runAnalyzeCardWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const noMarkdown = argv.includes('--no-markdown');
  const noHtml = argv.includes('--no-html');
  const outputDir = argv.find((arg) => !arg.startsWith('-'));

  if (helpMode || !outputDir) {
    console.log(HELP_TEXT);
    return 0;
  }

  const cardJsonPath = path.join(outputDir, 'card.json');
  if (!fs.existsSync(cardJsonPath)) {
    console.error(`\n  ❌ card.json을 찾을 수 없습니다: ${cardJsonPath}\n`);
    return 1;
  }

  try {
    runMain(outputDir, cardJsonPath, { noMarkdown, noHtml });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ analyze-card 실행 실패: ${message}\n`);
    return 1;
  }
}

function runMain(
  outputDir: string,
  cardJsonPath: string,
  options: { noMarkdown: boolean; noHtml: boolean },
): void {
  console.log('\n  🐿️ RisuAI Character Card Analyzer\n');

  const resolvedOutDir = path.resolve(outputDir);
  const analysisDir = path.join(resolvedOutDir, 'analysis');
  ensureDir(analysisDir);

  console.log('\n  ═══ Phase 1: COLLECT ═══');

  let card: unknown;
  try {
    card = JSON.parse(fs.readFileSync(cardJsonPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`card.json 파싱 실패: ${message}`);
  }

  const lorebookCBS = safeCollect(
    () => collectLorebookCBS(card, resolvedOutDir),
    'Lorebook CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const regexCBS = safeCollect(
    () => collectRegexCBS(card, resolvedOutDir),
    'Regex CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const variablesResult = safeCollect(
    () => collectVariablesCBS(card, resolvedOutDir),
    'Variables 수집 실패',
    { variables: {}, cbsData: [] } as VariablesResult,
  );
  const htmlResult = safeCollect(() => collectHTMLCBS(card, resolvedOutDir), 'HTML CBS 수집 실패', {
    cbsData: null,
    assetRefs: [],
  } as HtmlResult);
  const tsCBS = safeCollect(
    () => collectTSCBS(resolvedOutDir),
    'TS CBS 수집 실패',
    [] as ElementCBSData[],
  );
  const luaCBS = safeCollect(
    () => importLuaAnalysis(resolvedOutDir),
    'Lua 분석 임포트 실패',
    [] as ElementCBSData[],
  );

  const defaultVariables = variablesResult.variables || {};
  console.log(
    `     ✅ Lorebook: ${lorebookCBS.length}, Regex: ${regexCBS.length}, TS: ${tsCBS.length}, Lua: ${luaCBS.length}`,
  );

  console.log('\n  ═══ Phase 2: CORRELATE ═══');

  const allCollected = [
    ...lorebookCBS,
    ...regexCBS,
    ...tsCBS,
    ...luaCBS,
    ...(htmlResult.cbsData ? [htmlResult.cbsData] : []),
  ];

  const unifiedGraph = safeCollect(
    () => buildUnifiedCBSGraph(allCollected, defaultVariables),
    'Unified graph 빌드 실패',
    new Map(),
  );

  const lorebookRegexCorrelation = safeCollect(
    () => buildLorebookRegexCorrelation(lorebookCBS, regexCBS) as LorebookRegexCorrelation,
    'LB-RX 상관관계 실패',
    {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    } as LorebookRegexCorrelation,
  );

  console.log(
    `     ✅ Unified graph: ${unifiedGraph.size} variables, LB↔RX shared: ${lorebookRegexCorrelation.summary.totalShared}`,
  );

  console.log('\n  ═══ Phase 3: ANALYZE ═══');
  const lorebookStructure = safeCollect(
    () => analyzeLorebookStructureFromCard(card),
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

  console.log(
    `     ✅ Lorebook: ${lorebookStructure.stats.totalEntries} entries, ${lorebookStructure.stats.totalFolders} folders`,
  );

  console.log('\n  ═══ Phase 4: REPORT ═══');

  const cardName = resolveCardName(card);
  const reportData = {
    card,
    cardName,
    unifiedGraph,
    lorebookRegexCorrelation,
    lorebookStructure,
    defaultVariables,
    htmlAnalysis: htmlResult,
    lorebookCBS,
    regexCBS,
    tsCBS,
    luaCBS,
  };

  if (!options.noMarkdown) {
    try {
      renderMarkdown(reportData, resolvedOutDir);
      console.log(
        `     ✅ card-analysis.md → ${path.relative('.', path.join(analysisDir, 'card-analysis.md'))}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️ Markdown 리포트 생성 실패: ${message}`);
    }
  }

  if (!options.noHtml) {
    try {
      renderHtml(reportData, resolvedOutDir);
      console.log(
        `     ✅ card-analysis.html → ${path.relative('.', path.join(analysisDir, 'card-analysis.html'))}`,
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

function resolveCardName(card: unknown): string {
  if (typeof card !== 'object' || card == null) return 'Unknown';
  const record = card as { data?: { name?: unknown }; name?: unknown };
  if (typeof record.data?.name === 'string' && record.data.name.length > 0) return record.data.name;
  if (typeof record.name === 'string' && record.name.length > 0) return record.name;
  return 'Unknown';
}
