import fs from 'node:fs';
import path from 'node:path';
import { ELEMENT_TYPES, MAX_VARS_IN_REPORT } from '@/domain';
import { escapeHtml } from '../../shared';
import { type LorebookRegexCorrelation, type UnifiedVarEntry } from '../types';

interface HtmlReportData {
  cardName: string;
  unifiedGraph: Map<string, UnifiedVarEntry>;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookStructure: {
    folders?: Array<{
      name?: string;
      children?: unknown[];
      entries?: Array<{ name: string; enabled?: boolean }>;
    }>;
    stats?: {
      activationModes?: { normal?: number; constant?: number; selective?: number };
    };
  };
}

export function renderHtml(data: HtmlReportData, outputDir: string): void {
  const elementCounts: Record<string, number> = {
    [ELEMENT_TYPES.LOREBOOK]: 0,
    [ELEMENT_TYPES.REGEX]: 0,
    [ELEMENT_TYPES.LUA]: 0,
    [ELEMENT_TYPES.HTML]: 0,
    [ELEMENT_TYPES.TYPESCRIPT]: 0,
  };

  let isolatedCount = 0;
  let bridgedCount = 0;
  const unifiedVars = Array.from(data.unifiedGraph.values());

  for (const entry of unifiedVars) {
    if (entry.direction === 'isolated') isolatedCount += 1;
    if (entry.direction === 'bridged') bridgedCount += 1;

    for (const type of Object.keys(entry.sources)) {
      if (elementCounts[type] !== undefined) {
        elementCounts[type] += 1;
      }
    }
  }

  const elementChartData = {
    labels: Object.keys(elementCounts),
    datasets: [
      {
        data: Object.values(elementCounts),
        backgroundColor: ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#8b949e'],
      },
    ],
  };
  const typeChartData = {
    labels: ['Isolated', 'Bridged'],
    datasets: [
      {
        label: 'Variables',
        data: [isolatedCount, bridgedCount],
        backgroundColor: ['#8b949e', '#58a6ff'],
      },
    ],
  };

  const modes = data.lorebookStructure?.stats?.activationModes || {
    normal: 0,
    constant: 0,
    selective: 0,
  };
  const modeChartData = {
    labels: ['Normal', 'Constant', 'Selective'],
    datasets: [
      {
        label: 'Lorebook Entries',
        data: [modes.normal || 0, modes.constant || 0, modes.selective || 0],
        backgroundColor: ['#3fb950', '#d29922', '#58a6ff'],
      },
    ],
  };

  const sortedVars = unifiedVars
    .sort((a, b) => b.elementCount - a.elementCount)
    .slice(0, MAX_VARS_IN_REPORT);
  const varRows = sortedVars.length
    ? sortedVars
        .map((entry) => {
          const elements = Object.keys(entry.sources)
            .map((source) => `<span class="badge badge-${source}">${escapeHtml(source)}</span>`)
            .join(' ');
          const writers: string[] = [];
          const readers: string[] = [];

          for (const [type, src] of Object.entries(entry.sources)) {
            if (src.writers.length > 0)
              writers.push(`<b>${escapeHtml(type)}</b>: ${src.writers.map(escapeHtml).join(', ')}`);
            if (src.readers.length > 0)
              readers.push(`<b>${escapeHtml(type)}</b>: ${src.readers.map(escapeHtml).join(', ')}`);
          }

          return `
      <tr class="var-row" data-name="${escapeHtml(entry.varName).toLowerCase()}">
        <td><code>${escapeHtml(entry.varName)}</code></td>
        <td>${elements}</td>
        <td><span class="badge badge-${entry.direction}">${escapeHtml(entry.direction)}</span></td>
        <td><code>${escapeHtml(entry.defaultValue)}</code></td>
        <td class="small-text">${writers.join('<br>')}</td>
        <td class="small-text">${readers.join('<br>')}</td>
      </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="muted">No variables found.</td></tr>';

  const sharedVars = data.lorebookRegexCorrelation?.sharedVars || [];
  const sharedRows = sharedVars.length
    ? sharedVars
        .map(
          (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.varName)}</code></td>
        <td class="small-text">${entry.lorebookEntries.map(escapeHtml).join(', ')}</td>
        <td class="small-text">${entry.regexScripts.map(escapeHtml).join(', ')}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="muted">No shared variables found.</td></tr>';

  const renderFolder = (folder: {
    name?: string;
    children?: unknown[];
    entries?: Array<{ name: string; enabled?: boolean }>;
  }): string => {
    const children = Array.isArray(folder.children)
      ? folder.children
          .filter(
            (
              child,
            ): child is {
              name?: string;
              children?: unknown[];
              entries?: Array<{ name: string; enabled?: boolean }>;
            } => typeof child === 'object' && child !== null,
          )
          .map((child) => renderFolder(child))
          .join('')
      : '';
    const entries = Array.isArray(folder.entries)
      ? folder.entries
          .map(
            (entry) =>
              `<li>📄 ${escapeHtml(entry.name)} ${entry.enabled === false ? '(disabled)' : ''}</li>`,
          )
          .join('')
      : '';
    return `<li>📁 <b>${escapeHtml(folder.name || 'unnamed')}</b><ul>${children}${entries}</ul></li>`;
  };

  const foldersHtml =
    Array.isArray(data.lorebookStructure?.folders) && data.lorebookStructure.folders.length > 0
      ? `<ul>${data.lorebookStructure.folders.map(renderFolder).join('')}</ul>`
      : '<p class="muted">No folders found.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Card Analysis: ${escapeHtml(data.cardName)}</title>
  <style>
    :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; --yellow: #d29922; --red: #f85149; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1, h2, h3 { color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: var(--surface); font-weight: 600; }
    code { background: rgba(110,118,129,0.4); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .muted { color: var(--muted); }
    .small-text { font-size: 0.85em; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 12px; font-size: 0.75em; font-weight: 600; text-transform: uppercase; }
    .badge-lorebook { background: rgba(88, 166, 255, 0.2); color: var(--accent); }
    .badge-regex { background: rgba(63, 185, 80, 0.2); color: var(--green); }
    .badge-lua { background: rgba(210, 153, 34, 0.2); color: var(--yellow); }
    .badge-html { background: rgba(248, 81, 73, 0.2); color: var(--red); }
    .badge-typescript { background: rgba(139, 148, 158, 0.2); color: var(--muted); }
    .badge-isolated { background: rgba(139, 148, 158, 0.2); color: var(--muted); }
    .badge-bridged { background: rgba(88, 166, 255, 0.2); color: var(--accent); }
    input[type="text"] { background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 8px 12px; border-radius: 4px; width: 100%; box-sizing: border-box; margin-bottom: 16px; }
    details { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 16px; }
    summary { padding: 12px 16px; cursor: pointer; font-weight: 600; }
    details > div { padding: 16px; border-top: 1px solid var(--border); }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.9em; }
    .chart-container { position: relative; height: 250px; width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Card Analysis: ${escapeHtml(data.cardName)}</h1>
    <div class="grid">
      <div class="card"><h3>Element Distribution</h3><div class="chart-container"><canvas id="elementChart"></canvas></div></div>
      <div class="card"><h3>Variable Types</h3><div class="chart-container"><canvas id="typeChart"></canvas></div></div>
      <div class="card"><h3>Lorebook Activation Modes</h3><div class="chart-container"><canvas id="modeChart"></canvas></div></div>
    </div>
    <h2>Unified Variables</h2>
    <input type="text" id="varFilter" placeholder="Filter variables by name...">
    <div style="overflow-x: auto;"><table><thead><tr><th>Variable</th><th>Elements</th><th>Direction</th><th>Default</th><th>Writers</th><th>Readers</th></tr></thead><tbody id="varTableBody">${varRows}</tbody></table></div>
    <details><summary>Lorebook ↔ Regex Correlation</summary><div><p>Variables shared between Lorebook and Regex extensions.</p><div style="overflow-x: auto;"><table><thead><tr><th>Variable</th><th>Lorebook Entries</th><th>Regex Scripts</th></tr></thead><tbody>${sharedRows}</tbody></table></div></div></details>
    <details><summary>Lorebook Structure</summary><div>${foldersHtml}</div></details>
    <footer>Generated on ${new Date().toLocaleString()}</footer>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const elementChartData = ${JSON.stringify(elementChartData).replace(/</g, '\\u003c')};
    const typeChartData = ${JSON.stringify(typeChartData).replace(/</g, '\\u003c')};
    const modeChartData = ${JSON.stringify(modeChartData).replace(/</g, '\\u003c')};
    Chart.defaults.color = '#8b949e';
    Chart.defaults.borderColor = '#30363d';
    new Chart(document.getElementById('elementChart'), { type: 'doughnut', data: elementChartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
    new Chart(document.getElementById('typeChart'), { type: 'bar', data: typeChartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    new Chart(document.getElementById('modeChart'), { type: 'bar', data: modeChartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    document.getElementById('varFilter').addEventListener('input', function(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const term = target.value.toLowerCase();
      const rows = document.querySelectorAll('.var-row');
      rows.forEach((row) => {
        const name = row.getAttribute('data-name') || '';
        row.style.display = name.includes(term) ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;

  const outPath = path.join(outputDir, 'analysis');
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }
  fs.writeFileSync(path.join(outPath, 'card-analysis.html'), html, 'utf8');
}
