import type {
  VisualizationPanel,
  VisualizationSection,
  VisualizationSeverity,
} from './visualization-types';

export function buildMetricGrid(
  id: string,
  title: string,
  items: Array<{ label: string; value: string | number; severity?: VisualizationSeverity }>,
  section: VisualizationSection = 'overview',
): VisualizationPanel {
  return { kind: 'metric-grid', id, title, section, items };
}

export function buildFindingPanel(
  id: string,
  title: string,
  findings: Array<{ severity: VisualizationSeverity; message: string; sourceIds: string[] }>,
  section: VisualizationSection = 'risks',
): VisualizationPanel {
  return { kind: 'findings', id, title, section, findings };
}

export function buildTablePanel(
  id: string,
  title: string,
  columns: string[],
  rows: Array<{ cells: string[]; sourceIds?: string[] }>,
  section: VisualizationSection,
): VisualizationPanel {
  return { kind: 'table', id, title, section, columns, rows };
}
