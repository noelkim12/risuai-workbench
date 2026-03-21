import fs from 'node:fs';
import path from 'node:path';
import {
  type AnalyzePhaseResult,
  type CollectedData,
  type LorebookCorrelation,
  type RegexCorrelation,
} from './types';

function bar(size: number, total: number): string {
  const n = total > 0 ? Math.max(1, Math.round((size / total) * 30)) : 1;
  return '█'.repeat(n) + '░'.repeat(Math.max(0, 30 - n));
}

const mdRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;

export function runReporting(context: {
  filePath: string;
  markdownMode: boolean;
  htmlMode: boolean;
  total: number;
  lines: string[];
  analyzePhase: AnalyzePhaseResult;
  collected: CollectedData;
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
}): void {
  const {
    filePath,
    markdownMode,
    htmlMode,
    total,
    lines,
    analyzePhase,
    collected,
    lorebookCorrelation,
    regexCorrelation,
  } = context;

  printSections(analyzePhase, total);
  printTopFunctions(collected, total);
  printSummary(analyzePhase, collected, total);
  printCorrelationSummary(lorebookCorrelation, regexCorrelation);

  if (markdownMode) {
    renderMarkdown({
      filePath,
      total,
      lines,
      analyzePhase,
      collected,
      lorebookCorrelation,
      regexCorrelation,
    });
  }

  if (htmlMode) {
    renderHtml({
      filePath,
      total,
      analyzePhase,
      collected,
      lorebookCorrelation,
      regexCorrelation,
    });
  }
}

function printSections(analyzePhase: AnalyzePhaseResult, total: number): void {
  console.log('  ════════════════════════════════════════');
  console.log('  섹션 맵');
  console.log('  ────────────────────────────────────────');

  if (!analyzePhase.sectionMapSections.length) {
    console.log('  (없음)');
    return;
  }

  for (const section of analyzePhase.sectionMapSections) {
    const size = section.endLine - section.startLine + 1;
    console.log(
      `  ${String(section.startLine).padStart(5)}  ${bar(size, total)} ${section.title} (${size})`,
    );
  }
}

function printTopFunctions(collected: CollectedData, total: number): void {
  const sorted = [...collected.functions].sort((a, b) => b.lineCount - a.lineCount).slice(0, 20);

  console.log('\n  ────────────────────────────────────────');
  console.log(`  거대 함수 TOP ${sorted.length}`);
  console.log('  ────────────────────────────────────────');

  for (const fn of sorted) {
    const pct = total > 0 ? ((fn.lineCount / total) * 100).toFixed(1) : '0.0';
    const warn = fn.lineCount > 500 ? ' ⚠️  분할 권장' : fn.lineCount > 200 ? ' ⚡' : '';
    console.log(
      `  ${String(fn.lineCount).padStart(5)} (${pct}%)  ${fn.isLocal ? 'local ' : ''}${fn.displayName}${fn.isAsync ? ' async' : ''}  [${fn.startLine}~${fn.endLine}]${warn}`,
    );
  }
}

function printSummary(
  analyzePhase: AnalyzePhaseResult,
  collected: CollectedData,
  total: number,
): void {
  console.log('\n  ────────────────────────────────────────');
  console.log('  📊 요약');
  console.log(
    `     ${total} lines / ${collected.functions.length} functions / ${collected.handlers.length} handlers / ${collected.apiCalls.length} API calls`,
  );
  console.log(
    `     500줄+ 함수: ${collected.functions.filter((f) => f.lineCount > 500).length}개 (분할 권장)`,
  );
  console.log(`     200줄+ 함수: ${collected.functions.filter((f) => f.lineCount > 200).length}개`);
  console.log(
    `     상태 변수: ${analyzePhase.stateOwnership.length}개 / 제안 모듈: ${analyzePhase.moduleGroups.length}개`,
  );
  console.log('');
}

function printCorrelationSummary(
  lorebookCorrelation: LorebookCorrelation | null,
  regexCorrelation: RegexCorrelation | null,
): void {
  if (lorebookCorrelation) {
    console.log('  ════════════════════════════════════════');
    console.log('  📚 Lua↔Lorebook 상관관계');
    console.log('  ────────────────────────────────────────');
    console.log(
      `     Lorebook: ${lorebookCorrelation.totalEntries}개 엔트리 / ${lorebookCorrelation.totalFolders}개 폴더`,
    );
    console.log(
      `     Bridge 변수: ${lorebookCorrelation.bridgedVars.length}개 (Lua↔Lorebook 공유)`,
    );
    console.log(
      `     Lua 전용: ${lorebookCorrelation.luaOnlyVars.length}개 / Lorebook 전용: ${lorebookCorrelation.lorebookOnlyVars.length}개`,
    );
    console.log('');
  }

  if (regexCorrelation) {
    console.log('  ════════════════════════════════════════');
    console.log('  🔄 Lua↔Regex 상관관계');
    console.log('  ────────────────────────────────────────');
    console.log(
      `     Regex: ${regexCorrelation.totalScripts}개 스크립트 / ${regexCorrelation.activeScripts}개 활성`,
    );
    console.log(`     Bridge 변수: ${regexCorrelation.bridgedVars.length}개 (Lua↔Regex 공유)`);
    console.log(
      `     Lua 전용: ${regexCorrelation.luaOnlyVars.length}개 / Regex 전용: ${regexCorrelation.regexOnlyVars.length}개`,
    );
    console.log('');
  }
}

function renderMarkdown(params: {
  filePath: string;
  total: number;
  lines: string[];
  analyzePhase: AnalyzePhaseResult;
  collected: CollectedData;
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
}): void {
  const { filePath, total, analyzePhase, collected, lorebookCorrelation, regexCorrelation } =
    params;
  const filename = path.basename(filePath);
  const out: string[] = [];

  out.push(`# ${filename} — Modularization Blueprint`);
  out.push('');
  out.push('## Source Info');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push(mdRow(['File', filename]));
  out.push(mdRow(['Total Lines', String(total)]));
  out.push(mdRow(['Functions (total)', String(collected.functions.length)]));
  out.push(mdRow(['Event Handlers', String(collected.handlers.length)]));
  out.push(mdRow(['State Variables', String(analyzePhase.stateOwnership.length)]));
  out.push(mdRow(['Suggested Modules', String(analyzePhase.moduleGroups.length)]));
  out.push('');

  out.push('## State Variable Ownership');
  out.push('| Variable | Owner Module | Read By | Written By | Cross-Module |');
  out.push('|----------|-------------|---------|------------|--------------|');
  for (const state of analyzePhase.stateOwnership) {
    out.push(
      mdRow([
        state.key,
        state.ownerModule,
        state.readBy.join(', ') || '-',
        state.writers.join(', ') || '-',
        state.crossModule ? 'Yes' : 'No',
      ]),
    );
  }
  if (analyzePhase.stateOwnership.length === 0) {
    out.push(mdRow(['-', '-', '-', '-', '-']));
  }
  out.push('');

  if (lorebookCorrelation) {
    out.push('## Lua↔Lorebook Correlation');
    out.push('| Metric | Value |');
    out.push('|--------|-------|');
    out.push(mdRow(['Bridged Vars', String(lorebookCorrelation.bridgedVars.length)]));
    out.push(mdRow(['Lua Only Vars', String(lorebookCorrelation.luaOnlyVars.length)]));
    out.push(mdRow(['Lorebook Only Vars', String(lorebookCorrelation.lorebookOnlyVars.length)]));
    out.push('');
  }

  if (regexCorrelation) {
    out.push('## Lua↔Regex Correlation');
    out.push('| Metric | Value |');
    out.push('|--------|-------|');
    out.push(mdRow(['Bridged Vars', String(regexCorrelation.bridgedVars.length)]));
    out.push(mdRow(['Lua Only Vars', String(regexCorrelation.luaOnlyVars.length)]));
    out.push(mdRow(['Regex Only Vars', String(regexCorrelation.regexOnlyVars.length)]));
    out.push('');
  }

  const mdPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.analysis.md`,
  );
  fs.writeFileSync(mdPath, `${out.join('\n')}\n`, 'utf-8');
  console.log(`  ✅ Markdown exported to ${mdPath}`);
}

function renderHtml(params: {
  filePath: string;
  total: number;
  analyzePhase: AnalyzePhaseResult;
  collected: CollectedData;
  lorebookCorrelation: LorebookCorrelation | null;
  regexCorrelation: RegexCorrelation | null;
}): void {
  const { filePath, total, analyzePhase, collected, lorebookCorrelation, regexCorrelation } =
    params;

  const html = `<!doctype html>
<html lang="en">
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
    <div class="card"><b>Total Lines</b><div>${total}</div></div>
    <div class="card"><b>Functions</b><div>${collected.functions.length}</div></div>
    <div class="card"><b>Handlers</b><div>${collected.handlers.length}</div></div>
    <div class="card"><b>API Calls</b><div>${collected.apiCalls.length}</div></div>
    <div class="card"><b>State Vars</b><div>${analyzePhase.stateOwnership.length}</div></div>
  </div>
  <h2>State Variables</h2>
  <table>
    <thead><tr><th>Variable</th><th>Owner</th><th>Reads</th><th>Writes</th></tr></thead>
    <tbody>
      ${
        analyzePhase.stateOwnership
          .map(
            (state) =>
              `<tr><td>${escapeHtml(state.key)}</td><td>${escapeHtml(state.ownerModule)}</td><td>${state.readBy.length}</td><td>${state.writers.length}</td></tr>`,
          )
          .join('') || '<tr><td colspan="4">No state variables</td></tr>'
      }
    </tbody>
  </table>
  <h2>Correlation</h2>
  <div class="grid">
    <div class="card"><b>Lua↔Lorebook Bridged</b><div>${lorebookCorrelation?.bridgedVars.length || 0}</div></div>
    <div class="card"><b>Lua↔Regex Bridged</b><div>${regexCorrelation?.bridgedVars.length || 0}</div></div>
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

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
