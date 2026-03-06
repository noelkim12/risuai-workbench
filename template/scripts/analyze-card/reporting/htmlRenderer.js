'use strict';

const fs = require('fs');
const path = require('path');
const { ELEMENT_TYPES, MAX_VARS_IN_REPORT } = require('../constants');

function renderHtml(data, outputDir) {
  const {
    cardName,
    unifiedGraph,
    lorebookRegexCorrelation,
    lorebookStructure,
    defaultVariables,
    htmlAnalysis,
    lorebookCBS,
    regexCBS,
    tsCBS,
    luaCBS
  } = data;

  const h = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Prepare chart data
  // 1. Element Distribution
  const elementCounts = {
    [ELEMENT_TYPES.LOREBOOK]: 0,
    [ELEMENT_TYPES.REGEX]: 0,
    [ELEMENT_TYPES.LUA]: 0,
    [ELEMENT_TYPES.HTML]: 0,
    [ELEMENT_TYPES.TYPESCRIPT]: 0
  };

  let isolatedCount = 0;
  let bridgedCount = 0;

  const unifiedVars = Array.from(unifiedGraph.values());
  
  for (const v of unifiedVars) {
    if (v.direction === 'isolated') isolatedCount++;
    if (v.direction === 'bridged') bridgedCount++;
    
    for (const type of Object.keys(v.sources)) {
      if (elementCounts[type] !== undefined) {
        elementCounts[type]++;
      }
    }
  }

  const elementChartData = {
    labels: Object.keys(elementCounts),
    datasets: [{
      data: Object.values(elementCounts),
      backgroundColor: ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#8b949e']
    }]
  };

  const typeChartData = {
    labels: ['Isolated', 'Bridged'],
    datasets: [{
      label: 'Variables',
      data: [isolatedCount, bridgedCount],
      backgroundColor: ['#8b949e', '#58a6ff']
    }]
  };

  const modes = lorebookStructure?.stats?.activationModes || { normal: 0, constant: 0, selective: 0 };
  const modeChartData = {
    labels: ['Normal', 'Constant', 'Selective'],
    datasets: [{
      label: 'Lorebook Entries',
      data: [modes.normal || 0, modes.constant || 0, modes.selective || 0],
      backgroundColor: ['#3fb950', '#d29922', '#58a6ff']
    }]
  };

  // Unified Variable Table
  const sortedVars = unifiedVars.sort((a, b) => b.elementCount - a.elementCount).slice(0, MAX_VARS_IN_REPORT);
  
  const varRows = sortedVars.length ? sortedVars.map(v => {
    const elements = Object.keys(v.sources).map(s => `<span class="badge badge-${s}">${h(s)}</span>`).join(' ');
    const writers = [];
    const readers = [];
    
    for (const [type, src] of Object.entries(v.sources)) {
      if (src.writers && src.writers.length) writers.push(`<b>${h(type)}</b>: ${src.writers.map(h).join(', ')}`);
      if (src.readers && src.readers.length) readers.push(`<b>${h(type)}</b>: ${src.readers.map(h).join(', ')}`);
    }
    
    return `
      <tr class="var-row" data-name="${h(v.varName).toLowerCase()}">
        <td><code>${h(v.varName)}</code></td>
        <td>${elements}</td>
        <td><span class="badge badge-${v.direction}">${h(v.direction)}</span></td>
        <td><code>${h(v.defaultValue)}</code></td>
        <td class="small-text">${writers.join('<br>')}</td>
        <td class="small-text">${readers.join('<br>')}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" class="muted">No variables found.</td></tr>';

  // Lorebook ↔ Regex Correlation
  const sharedVars = lorebookRegexCorrelation?.sharedVars || [];
  const sharedRows = sharedVars.length ? sharedVars.map(v => {
    return `
      <tr>
        <td><code>${h(v.varName)}</code></td>
        <td class="small-text">${v.lorebook.map(h).join(', ')}</td>
        <td class="small-text">${v.regex.map(h).join(', ')}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="3" class="muted">No shared variables found.</td></tr>';

  // Lorebook Structure
  const renderFolder = (folder) => {
    const children = folder.children ? folder.children.map(renderFolder).join('') : '';
    const entries = folder.entries ? folder.entries.map(e => `<li>📄 ${h(e.name)} ${e.enabled ? '' : '(disabled)'}</li>`).join('') : '';
    return `<li>📁 <b>${h(folder.name)}</b><ul>${children}${entries}</ul></li>`;
  };
  
  const foldersHtml = lorebookStructure?.folders?.length 
    ? `<ul>${lorebookStructure.folders.map(renderFolder).join('')}</ul>`
    : '<p class="muted">No folders found.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Card Analysis: ${h(cardName)}</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
      --yellow: #d29922;
      --red: #f85149;
    }
    body { 
      background: var(--bg); 
      color: var(--text); 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      margin: 0;
      padding: 20px;
      line-height: 1.5;
    }
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
    input[type="text"] { 
      background: var(--bg); 
      color: var(--text); 
      border: 1px solid var(--border); 
      padding: 8px 12px; 
      border-radius: 4px; 
      width: 100%; 
      box-sizing: border-box; 
      margin-bottom: 16px;
    }
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
    <h1>Card Analysis: ${h(cardName)}</h1>
    
    <div class="grid">
      <div class="card">
        <h3>Element Distribution</h3>
        <div class="chart-container">
          <canvas id="elementChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h3>Variable Types</h3>
        <div class="chart-container">
          <canvas id="typeChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h3>Lorebook Activation Modes</h3>
        <div class="chart-container">
          <canvas id="modeChart"></canvas>
        </div>
      </div>
    </div>

    <h2>Unified Variables</h2>
    <input type="text" id="varFilter" placeholder="Filter variables by name...">
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Elements</th>
            <th>Direction</th>
            <th>Default</th>
            <th>Writers</th>
            <th>Readers</th>
          </tr>
        </thead>
        <tbody id="varTableBody">
          ${varRows}
        </tbody>
      </table>
    </div>

    <details>
      <summary>Lorebook ↔ Regex Correlation</summary>
      <div>
        <p>Variables shared between Lorebook and Regex extensions.</p>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Lorebook Entries</th>
                <th>Regex Scripts</th>
              </tr>
            </thead>
            <tbody>
              ${sharedRows}
            </tbody>
          </table>
        </div>
      </div>
    </details>

    <details>
      <summary>Lorebook Structure</summary>
      <div>
        ${foldersHtml}
      </div>
    </details>

    <footer>
      Generated on ${new Date().toLocaleString()}
    </footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    // Chart Data
    const elementChartData = ${JSON.stringify(elementChartData).replace(/</g, '\\u003c')};
    const typeChartData = ${JSON.stringify(typeChartData).replace(/</g, '\\u003c')};
    const modeChartData = ${JSON.stringify(modeChartData).replace(/</g, '\\u003c')};

    // Initialize Charts
    Chart.defaults.color = '#8b949e';
    Chart.defaults.borderColor = '#30363d';

    new Chart(document.getElementById('elementChart'), {
      type: 'doughnut',
      data: elementChartData,
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    new Chart(document.getElementById('typeChart'), {
      type: 'bar',
      data: typeChartData,
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    new Chart(document.getElementById('modeChart'), {
      type: 'bar',
      data: modeChartData,
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Variable Filter
    document.getElementById('varFilter').addEventListener('input', function(e) {
      const term = e.target.value.toLowerCase();
      const rows = document.querySelectorAll('.var-row');
      rows.forEach(row => {
        const name = row.getAttribute('data-name');
        if (name.includes(term)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
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

module.exports = { renderHtml };
