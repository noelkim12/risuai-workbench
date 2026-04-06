/** analyzer 공통 severity 등급 */
export type VisualizationSeverity = 'info' | 'warning' | 'error';

/** HTML report / webview 공용 상위 섹션 구분 — 기본 4탭 + 아티팩트별 커스텀 */
export type VisualizationSection = 'overview' | 'flow' | 'risks' | 'sources' | (string & {});

/** 아티팩트별 커스텀 탭 정의 */
export interface SectionDefinition {
  id: string;
  labelKey: string;
  descriptionKey: string;
}

/** plan / helper 문맥용 severity alias */
export type Severity = VisualizationSeverity;

/** source-linked evidence 항목 */
export interface VisualizationSource {
  id: string;
  label: string;
  path?: string;
  elementType: string;
}

/** 시각화 패널 공통 베이스 */
export interface VisualizationPanelBase {
  id: string;
  title: string;
  section?: VisualizationSection;
  description?: string;
}

/** metric card grid 패널 */
export interface MetricGridPanel extends VisualizationPanelBase {
  kind: 'metric-grid';
  items: Array<{
    label: string;
    value: string | number;
    severity?: VisualizationSeverity;
  }>;
}

/** Chart.js config 기반 정량 차트 패널 */
export interface ChartPanel extends VisualizationPanelBase {
  kind: 'chart';
  library: 'chartjs';
  config: Record<string, unknown>;
  height?: number;
}

/** Mermaid / Cytoscape / Text / Force-graph payload 패널 */
export interface DiagramPanel extends VisualizationPanelBase {
  kind: 'diagram';
  library: 'mermaid' | 'cytoscape' | 'text' | 'force-graph';
  payload: string | Record<string, unknown>;
  height?: number;
}

/** severity-tagged finding 목록 패널 */
export interface FindingsPanel extends VisualizationPanelBase {
  kind: 'findings';
  findings: Array<{
    severity: VisualizationSeverity;
    message: string;
    sourceIds: string[];
  }>;
}

/** source-linked 상세 근거 표 패널 */
export interface TablePanel extends VisualizationPanelBase {
  kind: 'table';
  columns: string[];
  rows: Array<{
    cells: string[];
    sourceIds?: string[];
    severity?: VisualizationSeverity;
    searchText?: string;
  }>;
  filterPlaceholder?: string;
}

/** analyzer 시각화 중간 표현 패널 union */
export type VisualizationPanel =
  | MetricGridPanel
  | ChartPanel
  | DiagramPanel
  | FindingsPanel
  | TablePanel;

/** HTML report / webview 공용 분석 시각화 문서 계약 */
export interface AnalysisVisualizationDoc {
  artifactType: 'charx' | 'module' | 'preset' | 'compose' | 'lua';
  artifactName: string;
  /** 아티팩트별 커스텀 섹션 탭 정의 — 미지정 시 기본 4섹션 사용 */
  sections?: SectionDefinition[];
  summary: {
    score?: number | null;
    totals: Array<{
      label: string;
      value: number | string;
      severity?: VisualizationSeverity;
    }>;
    highlights: Array<{
      title: string;
      message: string;
      severity: VisualizationSeverity;
    }>;
    nextActions: string[];
  };
  panels: VisualizationPanel[];
  sources: VisualizationSource[];
}

/** HTML 리포트 출력물 계약 */
export interface HtmlReportOutput {
  html: string;
  clientJs: string;
}
