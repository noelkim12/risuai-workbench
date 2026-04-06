import fs from 'node:fs';
import path from 'node:path';
import {
  type AnalyzePhaseResult,
  type CollectedData,
  type LorebookCorrelation,
  type RegexCorrelation,
} from '@/domain/analyze/lua-analysis-types';
import { escapeHtml, mdRow } from '../../shared';
import { type Locale, t } from '../shared/i18n';

/** Lua 분석 리포터의 입력 데이터. 분석 Phase 결과와 상관관계 데이터를 포함한다. */
export interface LuaReportData {
  filePath: string;
  total: number;
  analyzePhase: AnalyzePhaseResult;
  collected: CollectedData;
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
}

function bar(size: number, total: number): string {
  const n = total > 0 ? Math.max(1, Math.round((size / total) * 30)) : 1;
  return '█'.repeat(n) + '░'.repeat(Math.max(0, 30 - n));
}

/** 콘솔 요약 출력 후 옵션에 따라 Markdown/HTML 리포트를 생성한다. */
export function runReporting(
  data: LuaReportData,
  options: { markdown: boolean; html: boolean },
  locale: Locale = 'ko',
): void {
  const { analyzePhase, collected, total, lorebookCorrelation, regexCorrelation } = data;

  printSections(analyzePhase, total, locale);
  printTopFunctions(collected, total, locale);
  printSummary(analyzePhase, collected, total, locale);
  printCorrelationSummary(lorebookCorrelation, regexCorrelation, locale);

  if (options.markdown) {
    renderMarkdown(data, locale);
  }

  if (options.html) {
    renderHtml(data, locale);
  }
}

function printSections(analyzePhase: AnalyzePhaseResult, total: number, locale: Locale): void {
  console.log('  ════════════════════════════════════════');
  console.log('  ' + t(locale, 'lua.console.sectionMap'));
  console.log('  ────────────────────────────────────────');

  if (!analyzePhase.sectionMapSections.length) {
    console.log('  ' + t(locale, 'lua.console.none'));
    return;
  }

  for (const section of analyzePhase.sectionMapSections) {
    const size = section.endLine - section.startLine + 1;
    console.log(
      `  ${String(section.startLine).padStart(5)}  ${bar(size, total)} ${section.title} (${size})`,
    );
  }
}

function printTopFunctions(collected: CollectedData, total: number, locale: Locale): void {
  const sorted = [...collected.functions].sort((a, b) => b.lineCount - a.lineCount).slice(0, 20);

  console.log('\n  ────────────────────────────────────────');
  console.log('  ' + t(locale, 'lua.console.topFunctions', sorted.length));
  console.log('  ────────────────────────────────────────');

  for (const fn of sorted) {
    const pct = total > 0 ? ((fn.lineCount / total) * 100).toFixed(1) : '0.0';
    const warn = fn.lineCount > 500 ? ' ⚠️  ' + t(locale, 'lua.console.splitRecommended') : fn.lineCount > 200 ? ' ⚡' : '';
    console.log(
      `  ${String(fn.lineCount).padStart(5)} (${pct}%)  ${fn.isLocal ? 'local ' : ''}${fn.displayName}${fn.isAsync ? ' async' : ''}  [${fn.startLine}~${fn.endLine}]${warn}`,
    );
  }
}

function printSummary(
  analyzePhase: AnalyzePhaseResult,
  collected: CollectedData,
  total: number,
  locale: Locale,
): void {
  console.log('\n  ────────────────────────────────────────');
  console.log('  📊 ' + t(locale, 'lua.console.summary'));
  console.log(
    `     ${total} lines / ${collected.functions.length} functions / ${collected.handlers.length} handlers / ${collected.apiCalls.length} API calls`,
  );
  console.log(
    `     ${t(locale, 'lua.console.fn500')}: ${collected.functions.filter((f) => f.lineCount > 500).length}`,
  );
  console.log(`     ${t(locale, 'lua.console.fn200')}: ${collected.functions.filter((f) => f.lineCount > 200).length}`);
  console.log(
    `     ${t(locale, 'lua.console.stateVars')}: ${analyzePhase.stateOwnership.length} / ${t(locale, 'lua.console.suggestedModules')}: ${analyzePhase.moduleGroups.length}`,
  );
  console.log('');
}

function printCorrelationSummary(
  lorebookCorrelation: LorebookCorrelation | null,
  regexCorrelation: RegexCorrelation | null,
  locale: Locale,
): void {
  if (lorebookCorrelation) {
    console.log('  ════════════════════════════════════════');
    console.log('  📚 ' + t(locale, 'lua.console.lbCorrelation'));
    console.log('  ────────────────────────────────────────');
    console.log(
      `     Lorebook: ${t(locale, 'lua.console.entries', lorebookCorrelation.totalEntries)} / ${t(locale, 'lua.console.folders', lorebookCorrelation.totalFolders)}`,
    );
    console.log(
      `     ${t(locale, 'lua.console.bridgeVars', lorebookCorrelation.bridgedVars.length)}`,
    );
    console.log(
      `     ${t(locale, 'lua.console.luaOnly', lorebookCorrelation.luaOnlyVars.length)} / ${t(locale, 'lua.console.lbOnly', lorebookCorrelation.lorebookOnlyVars.length)}`,
    );
    console.log('');
  }

  if (regexCorrelation) {
    console.log('  ════════════════════════════════════════');
    console.log('  🔄 ' + t(locale, 'lua.console.rxCorrelation'));
    console.log('  ────────────────────────────────────────');
    console.log(
      `     Regex: ${t(locale, 'lua.console.scripts', regexCorrelation.totalScripts)} / ${t(locale, 'lua.console.active', regexCorrelation.activeScripts)}`,
    );
    console.log(`     ${t(locale, 'lua.console.bridgeVarsRx', regexCorrelation.bridgedVars.length)}`);
    console.log(
      `     ${t(locale, 'lua.console.luaOnly', regexCorrelation.luaOnlyVars.length)} / ${t(locale, 'lua.console.rxOnly', regexCorrelation.regexOnlyVars.length)}`,
    );
    console.log('');
  }
}

function renderMarkdown(data: LuaReportData, locale: Locale): void {
  const { filePath, total, analyzePhase, collected, lorebookCorrelation, regexCorrelation } =
    data;
  const filename = path.basename(filePath);
  const out: string[] = [];

  out.push('# ' + t(locale, 'md.lua.title', filename));
  out.push('');
  out.push('## ' + t(locale, 'md.lua.sourceInfo'));
  out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
  out.push('|--------|-------|');
  out.push(mdRow([t(locale, 'md.lua.file'), filename]));
  out.push(mdRow([t(locale, 'md.lua.totalLines'), String(total)]));
  out.push(mdRow([t(locale, 'md.lua.functionsTotal'), String(collected.functions.length)]));
  out.push(mdRow([t(locale, 'md.lua.eventHandlers'), String(collected.handlers.length)]));
  out.push(mdRow([t(locale, 'md.lua.stateVariables'), String(analyzePhase.stateOwnership.length)]));
  out.push(mdRow([t(locale, 'md.lua.suggestedModules'), String(analyzePhase.moduleGroups.length)]));
  out.push('');

  out.push('## ' + t(locale, 'md.lua.stateOwnership'));
  out.push(`| ${t(locale, 'common.table.variable')} | ${t(locale, 'md.lua.ownerModule')} | ${t(locale, 'md.lua.readBy')} | ${t(locale, 'md.lua.writtenBy')} | ${t(locale, 'md.lua.crossModule')} |`);
  out.push('|----------|-------------|---------|------------|--------------|');
  for (const state of analyzePhase.stateOwnership) {
    out.push(
      mdRow([
        state.key,
        state.ownerModule,
        state.readBy.join(', ') || '-',
        state.writers.join(', ') || '-',
        state.crossModule ? t(locale, 'common.label.yes') : t(locale, 'common.label.no'),
      ]),
    );
  }
  if (analyzePhase.stateOwnership.length === 0) {
    out.push(mdRow(['-', '-', '-', '-', '-']));
  }
  out.push('');

  if (lorebookCorrelation) {
    out.push('## ' + t(locale, 'md.lua.lbCorrelation'));
    out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
    out.push('|--------|-------|');
    out.push(mdRow([t(locale, 'md.lua.bridgedVars'), String(lorebookCorrelation.bridgedVars.length)]));
    out.push(mdRow([t(locale, 'md.lua.luaOnlyVars'), String(lorebookCorrelation.luaOnlyVars.length)]));
    out.push(mdRow([t(locale, 'md.lua.lbOnlyVars'), String(lorebookCorrelation.lorebookOnlyVars.length)]));
    out.push('');
  }

  if (regexCorrelation) {
    out.push('## ' + t(locale, 'md.lua.rxCorrelation'));
    out.push(`| ${t(locale, 'common.table.metric')} | ${t(locale, 'common.table.value')} |`);
    out.push('|--------|-------|');
    out.push(mdRow([t(locale, 'md.lua.bridgedVars'), String(regexCorrelation.bridgedVars.length)]));
    out.push(mdRow([t(locale, 'md.lua.luaOnlyVars'), String(regexCorrelation.luaOnlyVars.length)]));
    out.push(mdRow([t(locale, 'md.lua.rxOnlyVars'), String(regexCorrelation.regexOnlyVars.length)]));
    out.push('');
  }

  const mdPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.analysis.md`,
  );
  fs.writeFileSync(mdPath, `${out.join('\n')}\n`, 'utf-8');
  console.log(`  ✅ Markdown exported to ${mdPath}`);
}

function renderHtml(data: LuaReportData, locale: Locale): void {
  const { filePath, total, analyzePhase, collected, lorebookCorrelation, regexCorrelation } =
    data;

  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lua Analysis</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 20px; line-height: 1.5; }
    h1, h2 { margin: 0 0 12px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(path.basename(filePath))}</h1>
  <div class="grid">
    <div class="card"><b>${t(locale, 'lua.html.totalLines')}</b><div>${total}</div></div>
    <div class="card"><b>${t(locale, 'lua.html.functions')}</b><div>${collected.functions.length}</div></div>
    <div class="card"><b>${t(locale, 'lua.html.handlers')}</b><div>${collected.handlers.length}</div></div>
    <div class="card"><b>${t(locale, 'lua.html.apiCalls')}</b><div>${collected.apiCalls.length}</div></div>
    <div class="card"><b>${t(locale, 'lua.html.stateVarsCard')}</b><div>${analyzePhase.stateOwnership.length}</div></div>
  </div>
  <h2>${t(locale, 'lua.html.stateVars')}</h2>
  <table>
    <thead><tr><th>${t(locale, 'common.table.variable')}</th><th>${t(locale, 'lua.html.owner')}</th><th>${t(locale, 'lua.html.reads')}</th><th>${t(locale, 'lua.html.writes')}</th></tr></thead>
    <tbody>
      ${
        analyzePhase.stateOwnership
          .map(
            (state) =>
              `<tr><td>${escapeHtml(state.key)}</td><td>${escapeHtml(state.ownerModule)}</td><td>${state.readBy.length}</td><td>${state.writers.length}</td></tr>`,
          )
          .join('') || `<tr><td colspan="4">${t(locale, 'lua.html.noStateVars')}</td></tr>`
      }
    </tbody>
  </table>
  <h2>${t(locale, 'lua.html.correlation')}</h2>
  <div class="grid">
    <div class="card"><b>${t(locale, 'lua.html.lbBridged')}</b><div>${lorebookCorrelation?.bridgedVars.length || 0}</div></div>
    <div class="card"><b>${t(locale, 'lua.html.rxBridged')}</b><div>${regexCorrelation?.bridgedVars.length || 0}</div></div>
  </div>
</body>
</html>`;

  const htmlPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.analysis.html`,
  );
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`  ✅ HTML exported to ${htmlPath}`);
}

