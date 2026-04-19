import type {
  AnalysisVisualizationDoc,
  ChartPanel,
  DiagramPanel,
  FindingsPanel,
  MetricGridPanel,
  Severity,
  TablePanel,
  VisualizationSection,
} from './visualization-types';

/**
 * 빈 visualization doc skeleton 생성
 * @param artifactType - analyzer artifact 타입
 * @param artifactName - analyzer artifact 이름
 * @returns 비어 있는 visualization 문서
 */
export function createVisualizationDoc(
  artifactType: AnalysisVisualizationDoc['artifactType'],
  artifactName: string,
): AnalysisVisualizationDoc {
  return {
    artifactType,
    artifactName,
    summary: {
      totals: [],
      highlights: [],
      nextActions: [],
    },
    panels: [],
    sources: [],
  };
}

/**
 * metric-grid 패널 생성
 * @param id - 패널 ID
 * @param title - 패널 제목
 * @param items - metric 항목 목록
 * @param section - 배치할 섹션
 * @returns metric-grid 패널
 */
export function buildMetricGrid(
  id: string,
  title: string,
  items: Array<{ label: string; value: string | number; severity?: Severity }>,
  section: VisualizationSection = 'overview',
): MetricGridPanel {
  return { kind: 'metric-grid', id, title, section, items };
}

/**
 * findings 패널 생성
 * @param id - 패널 ID
 * @param title - 패널 제목
 * @param findings - finding 목록
 * @param section - 배치할 섹션
 * @returns findings 패널
 */
export function buildFindingsPanel(
  id: string,
  title: string,
  findings: Array<{ severity: Severity; message: string; sourceIds: string[] }>,
  section: VisualizationSection = 'risks',
): FindingsPanel {
  return { kind: 'findings', id, title, section, findings };
}

/** 기존 consumer 호환용 findings helper alias */
export const buildFindingPanel = buildFindingsPanel;

/**
 * table 패널 생성
 * @param id - 패널 ID
 * @param title - 패널 제목
 * @param columns - 컬럼 레이블 목록
 * @param rows - 테이블 행 목록
 * @param section - 배치할 섹션
 * @param filterPlaceholder - 필터 입력 placeholder
 * @returns table 패널
 */
export function buildTablePanel(
  id: string,
  title: string,
  columns: string[],
  rows: TablePanel['rows'],
  section: VisualizationSection,
  filterPlaceholder?: string,
): TablePanel {
  return { kind: 'table', id, title, section, columns, rows, filterPlaceholder };
}

/**
 * chart 패널 생성
 * @param id - 패널 ID
 * @param title - 패널 제목
 * @param config - Chart.js 호환 config
 * @param section - 배치할 섹션
 * @param height - 차트 영역 높이
 * @returns chart 패널
 */
export function buildChartPanel(
  id: string,
  title: string,
  config: Record<string, unknown>,
  section: VisualizationSection = 'overview',
  height?: number,
): ChartPanel {
  return { kind: 'chart', id, title, section, library: 'chartjs', config, height };
}

/**
 * diagram 패널 생성
 * @param id - 패널 ID
 * @param title - 패널 제목
 * @param library - 다이어그램 렌더링 라이브러리 타입
 * @param payload - 다이어그램 payload
 * @param section - 배치할 섹션
 * @param height - 다이어그램 영역 높이
 * @returns diagram 패널
 */
export function buildDiagramPanel(
  id: string,
  title: string,
  library: DiagramPanel['library'],
  payload: DiagramPanel['payload'],
  section: VisualizationSection = 'flow',
  height?: number,
): DiagramPanel {
  return { kind: 'diagram', id, title, section, library, payload, height };
}
