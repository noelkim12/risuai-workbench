#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./shared/extract-helpers');

// Collectors
const {
  collectLorebookCBS,
  collectRegexCBS,
  collectVariablesCBS,
  collectHTMLCBS,
  collectTSCBS,
  importLuaAnalysis
} = require('./analyze-card/collectors');

// Correlators
const {
  buildUnifiedCBSGraph,
  buildLorebookRegexCorrelation
} = require('./analyze-card/correlators');

// Analyzer
const { analyzeLorebookStructure } = require('./analyze-card/lorebook-analyzer');

// Reporters
const { renderMarkdown } = require('./analyze-card/reporting');
const { renderHtml } = require('./analyze-card/reporting/htmlRenderer');

const argv = process.argv.slice(2);
const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
const noMarkdown = argv.includes('--no-markdown');
const noHtml = argv.includes('--no-html');
const outputDir = argv.find((a) => !a.startsWith('-'));

if (helpMode || !outputDir) {
  console.log(`
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
`);
  process.exit(0);
}

const cardJsonPath = path.join(outputDir, 'card.json');

if (!fs.existsSync(cardJsonPath)) {
  console.error(`\n  ❌ card.json을 찾을 수 없습니다: ${cardJsonPath}\n`);
  process.exit(1);
}

async function main() {
  console.log(`\n  🐿️ RisuAI Character Card Analyzer\n`);

  const resolvedOutDir = path.resolve(outputDir);
  const analysisDir = path.join(resolvedOutDir, 'analysis');
  ensureDir(analysisDir);

  // ── Phase 1: COLLECT ──
  console.log('\n  ═══ Phase 1: COLLECT ═══');
  let card, lorebookCBS, regexCBS, variablesResult, htmlResult, tsCBS, luaCBS;

  try {
    card = JSON.parse(fs.readFileSync(cardJsonPath, 'utf8'));
  } catch (e) {
    console.error(`  ❌ card.json 파싱 실패: ${e.message}`);
    process.exit(1);
  }

  try { lorebookCBS = collectLorebookCBS(card); } catch (e) { console.warn(`  ⚠️ Lorebook CBS 수집 실패: ${e.message}`); lorebookCBS = []; }
  try { regexCBS = collectRegexCBS(card); } catch (e) { console.warn(`  ⚠️ Regex CBS 수집 실패: ${e.message}`); regexCBS = []; }
  try { variablesResult = collectVariablesCBS(card); } catch (e) { console.warn(`  ⚠️ Variables 수집 실패: ${e.message}`); variablesResult = { variables: {}, cbsData: [] }; }
  try { htmlResult = collectHTMLCBS(card); } catch (e) { console.warn(`  ⚠️ HTML CBS 수집 실패: ${e.message}`); htmlResult = { cbsData: null, assetRefs: [] }; }
  try { tsCBS = collectTSCBS(resolvedOutDir); } catch (e) { console.warn(`  ⚠️ TS CBS 수집 실패: ${e.message}`); tsCBS = []; }
  try { luaCBS = importLuaAnalysis(resolvedOutDir); } catch (e) { console.warn(`  ⚠️ Lua 분석 임포트 실패: ${e.message}`); luaCBS = []; }

  const defaultVariables = variablesResult.variables || {};
  console.log(`     ✅ Lorebook: ${lorebookCBS.length}, Regex: ${regexCBS.length}, TS: ${tsCBS.length}, Lua: ${luaCBS.length}`);

  // ── Phase 2: CORRELATE ──
  console.log('\n  ═══ Phase 2: CORRELATE ═══');
  let unifiedGraph, lorebookRegexCorrelation;

  // Build allCollected — include htmlResult.cbsData if present
  const allCollected = [
    ...lorebookCBS,
    ...regexCBS,
    ...tsCBS,
    ...luaCBS,
    ...(htmlResult.cbsData ? [htmlResult.cbsData] : [])
  ];

  try { unifiedGraph = buildUnifiedCBSGraph(allCollected, defaultVariables); } catch (e) { console.warn(`  ⚠️ Unified graph 빌드 실패: ${e.message}`); unifiedGraph = new Map(); }
  try { lorebookRegexCorrelation = buildLorebookRegexCorrelation(lorebookCBS, regexCBS); } catch (e) { console.warn(`  ⚠️ LB-RX 상관관계 실패: ${e.message}`); lorebookRegexCorrelation = { sharedVars: [], lorebookOnlyVars: [], regexOnlyVars: [], summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 } }; }

  console.log(`     ✅ Unified graph: ${unifiedGraph.size} variables, LB↔RX shared: ${lorebookRegexCorrelation.summary.totalShared}`);

  // ── Phase 3: ANALYZE ──
  console.log('\n  ═══ Phase 3: ANALYZE ═══');
  let lorebookStructure;

  try { lorebookStructure = analyzeLorebookStructure(card); } catch (e) { console.warn(`  ⚠️ Lorebook 구조 분석 실패: ${e.message}`); lorebookStructure = { folders: [], entries: [], stats: { totalEntries: 0, totalFolders: 0, activationModes: { normal: 0, constant: 0, selective: 0 }, enabledCount: 0, disabledCount: 0, withCBS: 0, withoutCBS: 0 }, keywords: new Map() }; }

  console.log(`     ✅ Lorebook: ${lorebookStructure.stats.totalEntries} entries, ${lorebookStructure.stats.totalFolders} folders`);

  // ── Phase 4: REPORT ──
  console.log('\n  ═══ Phase 4: REPORT ═══');

  const reportData = {
    card,
    cardName: card.data?.name || card.name || 'Unknown',
    unifiedGraph,
    lorebookRegexCorrelation,
    lorebookStructure,
    defaultVariables,
    htmlAnalysis: htmlResult,
    lorebookCBS,
    regexCBS,
    tsCBS,
    luaCBS
  };

  if (!noMarkdown) {
    try {
      renderMarkdown(reportData, resolvedOutDir);
      console.log(`     ✅ card-analysis.md → ${path.relative('.', path.join(analysisDir, 'card-analysis.md'))}`);
    } catch (e) {
      console.warn(`  ⚠️ Markdown 리포트 생성 실패: ${e.message}`);
    }
  }

  if (!noHtml) {
    try {
      renderHtml(reportData, resolvedOutDir);
      console.log(`     ✅ card-analysis.html → ${path.relative('.', path.join(analysisDir, 'card-analysis.html'))}`);
    } catch (e) {
      console.warn(`  ⚠️ HTML 리포트 생성 실패: ${e.message}`);
    }
  }

  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 분석 완료 → ${path.relative('.', analysisDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}

main();
