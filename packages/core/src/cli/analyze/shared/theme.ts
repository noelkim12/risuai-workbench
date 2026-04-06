import type { VisualizationSeverity } from './visualization-types';

/** severity별 핵심 색상 맵 */
export const SEVERITY_COLORS: Record<VisualizationSeverity, string> = {
  info: '#60a5fa',
  warning: '#f0a030',
  error: '#f06060',
};

/**
 * severity 대응 CSS class 반환
 * @param severity - severity 값
 * @returns severity class 이름
 */
export function severityClass(severity: VisualizationSeverity | undefined): string {
  return severity ? `severity-${severity}` : 'severity-neutral';
}

/**
 * severity 뱃지 HTML 생성
 * @param severity - severity 값
 * @returns 뱃지 HTML 문자열
 */
const BADGE_VARIANT: Record<VisualizationSeverity, string> = {
  info: 'bg-accent-info/[0.14] text-blue-300 border border-accent-info/20',
  warning: 'bg-amber-400/[0.14] text-amber-300 border border-amber-400/20',
  error: 'bg-red-400/[0.14] text-red-300 border border-red-400/20',
};

export function severityBadge(severity: VisualizationSeverity): string {
  const variant = BADGE_VARIANT[severity] ?? 'bg-slate-500/[0.14] text-slate-300';
  return `<span class="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-wider ${variant}">${severityIcon(severity)} ${severity}</span>`;
}

/**
 * severity 아이콘 텍스트 반환
 * @param severity - severity 값
 * @returns 아이콘 텍스트
 */
export function severityIcon(severity: VisualizationSeverity): string {
  switch (severity) {
    case 'error':
      return '▲';
    case 'warning':
      return '■';
    case 'info':
      return '●';
  }
}
