export type VisualizationSeverity = 'info' | 'warning' | 'error';
export type VisualizationSection = 'overview' | 'flow' | 'risks' | 'sources';

export interface AnalysisVisualizationDoc {
  artifactType: 'charx' | 'module' | 'preset' | 'compose' | 'lua';
  artifactName: string;
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

export interface VisualizationSource {
  id: string;
  label: string;
  path?: string;
  elementType: string;
}

export type VisualizationPanel =
  | {
      kind: 'metric-grid';
      id: string;
      title: string;
      section?: VisualizationSection;
      items: Array<{
        label: string;
        value: string | number;
        severity?: VisualizationSeverity;
      }>;
    }
  | {
      kind: 'chart';
      id: string;
      title: string;
      section?: VisualizationSection;
      library: 'chartjs';
      config: Record<string, unknown>;
    }
  | {
      kind: 'diagram';
      id: string;
      title: string;
      section?: VisualizationSection;
      library: 'mermaid' | 'cytoscape' | 'text';
      payload: string | Record<string, unknown>;
    }
  | {
      kind: 'findings';
      id: string;
      title: string;
      section?: VisualizationSection;
      findings: Array<{
        severity: VisualizationSeverity;
        message: string;
        sourceIds: string[];
      }>;
    }
  | {
      kind: 'table';
      id: string;
      title: string;
      section?: VisualizationSection;
      columns: string[];
      rows: Array<{
        cells: string[];
        sourceIds?: string[];
      }>;
    };
