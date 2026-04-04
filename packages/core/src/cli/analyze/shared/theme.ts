import type { VisualizationSeverity } from './visualization-types';

export const SEVERITY_COLORS: Record<VisualizationSeverity, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
};

export function severityClass(severity: VisualizationSeverity | undefined): string {
  return severity ? `severity-${severity}` : 'severity-neutral';
}
