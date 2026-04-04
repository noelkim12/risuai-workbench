import { escapeHtml } from '../../shared';
import { severityClass } from './theme';
import type {
  AnalysisVisualizationDoc,
  VisualizationPanel,
  VisualizationSection,
} from './visualization-types';

const SECTIONS: Array<{ id: VisualizationSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'flow', label: 'Flow' },
  { id: 'risks', label: 'Risks' },
  { id: 'sources', label: 'Sources' },
];

/** 시각화 문서를 self-contained HTML 리포트로 렌더링한다. */
export function renderHtmlReportShell(doc: AnalysisVisualizationDoc): string {
  const sectionHtml = SECTIONS.map((section) => renderSection(doc, section.id, section.label)).join('');
  const highlightStrip = doc.summary.highlights
    .map(
      (highlight) =>
        `<div class="highlight ${severityClass(highlight.severity)}"><strong>${escapeHtml(highlight.title)}</strong><span>${escapeHtml(highlight.message)}</span></div>`,
    )
    .join('');
  const actions = doc.summary.nextActions.length
    ? `<ul class="next-actions">${doc.summary.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>`
    : '<p class="muted">No follow-up actions.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.artifactName)} — ${escapeHtml(doc.artifactType)} analysis</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #111827;
      --surface-2: #1f2937;
      --border: #334155;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent-info: #3b82f6;
      --accent-warning: #f59e0b;
      --accent-error: #ef4444;
      --accent-neutral: #64748b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .app { max-width: 1240px; margin: 0 auto; padding: 24px; }
    .hero { display: flex; justify-content: space-between; gap: 24px; align-items: start; margin-bottom: 24px; }
    .hero h1 { margin: 0 0 8px; font-size: 2rem; }
    .hero p { margin: 0; color: var(--muted); }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0 20px; }
    .metric-card, .panel, .section-card, .source-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
    .metric-card { padding: 14px 16px; }
    .metric-label { display: block; color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; }
    .metric-value { font-size: 1.5rem; font-weight: 700; }
    .highlight-strip { display: grid; gap: 10px; margin-bottom: 18px; }
    .highlight { display: flex; gap: 12px; align-items: start; padding: 12px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); }
    .highlight strong { min-width: 110px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .tab-button { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 8px 14px; cursor: pointer; }
    .tab-button.active { background: var(--surface-2); }
    .section-card { display: none; padding: 18px; margin-bottom: 16px; }
    .section-card.active { display: block; }
    .section-card h2 { margin-top: 0; }
    .panel { padding: 16px; margin-bottom: 16px; }
    .panel h3 { margin: 0 0 12px; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-size: 0.85rem; }
    code, pre { font-family: ui-monospace, SFMono-Regular, monospace; }
    code { background: rgba(148, 163, 184, 0.15); padding: 2px 6px; border-radius: 6px; }
    pre { white-space: pre-wrap; background: var(--surface-2); padding: 12px; border-radius: 10px; border: 1px solid var(--border); }
    .finding-list { display: grid; gap: 10px; }
    .finding { padding: 12px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); }
    .finding .source-links { margin-top: 8px; color: var(--muted); font-size: 0.85rem; }
    .next-actions { margin: 0; padding-left: 20px; }
    .muted { color: var(--muted); }
    .severity-info { border-left: 4px solid var(--accent-info); }
    .severity-warning { border-left: 4px solid var(--accent-warning); }
    .severity-error { border-left: 4px solid var(--accent-error); }
    .severity-neutral { border-left: 4px solid var(--accent-neutral); }
  </style>
</head>
<body>
  <div class="app">
    <div class="hero">
      <div>
        <h1>${escapeHtml(doc.artifactName)}</h1>
        <p>${escapeHtml(doc.artifactType)} artifact analysis report</p>
      </div>
      <div class="source-card panel">
        <h3>Next Actions</h3>
        ${actions}
      </div>
    </div>

    <div class="summary-grid">
      ${doc.summary.totals
        .map(
          (item) => `<div class="metric-card ${severityClass(item.severity)}"><span class="metric-label">${escapeHtml(item.label)}</span><div class="metric-value">${escapeHtml(String(item.value))}</div></div>`,
        )
        .join('')}
    </div>

    <div class="highlight-strip">${highlightStrip || '<div class="highlight severity-neutral"><strong>Highlights</strong><span>No major findings.</span></div>'}</div>

    <div class="tabs">${SECTIONS.map((section, index) => `<button class="tab-button${index === 0 ? ' active' : ''}" data-section="${section.id}">${section.label}</button>`).join('')}</div>
    ${sectionHtml}
  </div>
  <script>
    const buttons = document.querySelectorAll('.tab-button');
    const sections = document.querySelectorAll('.section-card');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.getAttribute('data-section');
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        sections.forEach((card) => card.classList.toggle('active', card.getAttribute('data-section') === section));
      });
    });
  </script>
</body>
</html>`;
}

function renderSection(doc: AnalysisVisualizationDoc, section: VisualizationSection, label: string): string {
  const panels = doc.panels.filter((panel) => resolveSection(panel) === section);
  const content = panels.length
    ? panels.map((panel) => renderPanel(doc, panel)).join('')
    : '<p class="muted">No content available.</p>';
  return `<section class="section-card${section === 'overview' ? ' active' : ''}" data-section="${section}"><h2>${label}</h2>${content}${section === 'sources' ? renderSources(doc) : ''}</section>`;
}

function renderPanel(doc: AnalysisVisualizationDoc, panel: VisualizationPanel): string {
  if (panel.kind === 'metric-grid') {
    return `<div class="panel" data-panel-kind="metric-grid"><h3>${escapeHtml(panel.title)}</h3><div class="metric-grid">${panel.items
      .map(
        (item) => `<div class="metric-card ${severityClass(item.severity)}"><span class="metric-label">${escapeHtml(item.label)}</span><div class="metric-value">${escapeHtml(String(item.value))}</div></div>`,
      )
      .join('')}</div></div>`;
  }

  if (panel.kind === 'findings') {
    return `<div class="panel" data-panel-kind="findings"><h3>${escapeHtml(panel.title)}</h3><div class="finding-list">${panel.findings
      .map((finding) => `<div class="finding ${severityClass(finding.severity)}"><div>${escapeHtml(finding.message)}</div><div class="source-links">${renderSourceLabels(doc, finding.sourceIds)}</div></div>`)
      .join('')}</div></div>`;
  }

  if (panel.kind === 'table') {
    return `<div class="panel" data-panel-kind="table"><h3>${escapeHtml(panel.title)}</h3><div class="table-wrap"><table><thead><tr>${panel.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${panel.rows
      .map((row) => `<tr>${row.cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div></div>`;
  }

  if (panel.kind === 'diagram') {
    const payload = typeof panel.payload === 'string' ? panel.payload : JSON.stringify(panel.payload, null, 2);
    return `<div class="panel" data-panel-kind="diagram"><h3>${escapeHtml(panel.title)}</h3><pre>${escapeHtml(payload)}</pre></div>`;
  }

  return `<div class="panel" data-panel-kind="chart"><h3>${escapeHtml(panel.title)}</h3><pre>${escapeHtml(JSON.stringify(panel.config, null, 2))}</pre></div>`;
}

function renderSources(doc: AnalysisVisualizationDoc): string {
  if (doc.sources.length === 0) {
    return '<div class="panel" data-panel-kind="sources"><h3>Sources</h3><p class="muted">No sources recorded.</p></div>';
  }

  return `<div class="panel" data-panel-kind="sources"><h3>Sources</h3><div class="table-wrap"><table><thead><tr><th>ID</th><th>Label</th><th>Element Type</th><th>Path</th></tr></thead><tbody>${doc.sources
    .map(
      (source) => `<tr><td><code>${escapeHtml(source.id)}</code></td><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.elementType)}</td><td>${escapeHtml(source.path || '—')}</td></tr>`,
    )
    .join('')}</tbody></table></div></div>`;
}

function resolveSection(panel: VisualizationPanel): VisualizationSection {
  if (panel.section) return panel.section;
  if (panel.kind === 'diagram') return 'flow';
  if (panel.kind === 'findings') return 'risks';
  if (panel.kind === 'table') return 'sources';
  return 'overview';
}

function renderSourceLabels(doc: AnalysisVisualizationDoc, sourceIds: string[]): string {
  const labels = sourceIds
    .map((sourceId) => doc.sources.find((source) => source.id === sourceId)?.label || sourceId)
    .map((label) => escapeHtml(label));
  return labels.length > 0 ? `Sources: ${labels.join(', ')}` : 'Sources: —';
}
