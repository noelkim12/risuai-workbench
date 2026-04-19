import type { ForceGraphPayload, HtmlReportAsset, MermaidDiagramPayload } from './visualization-types';

/** sidecar JS에 직렬화할 table row 항목 — cells/sourceLabelsHtml는 이미 escape된 trusted HTML */
export interface ReportDataTableRow {
  cells: string[];
  severity?: string;
  searchText?: string;
  sourceLabelsHtml?: string;
}

/** sidecar JS에 직렬화할 table panel payload */
export interface ReportDataTablePayload {
  hasSourceColumn: boolean;
  rows: ReportDataTableRow[];
}

/** sidecar JS에 직렬화할 report data bundle 패널 payload 항목 */
export type ReportDataPanelPayload =
  | { kind: 'chart'; payload: string | Record<string, unknown> }
  | { kind: 'diagram'; payload: string | MermaidDiagramPayload | ForceGraphPayload | Record<string, unknown> }
  | { kind: 'table'; payload: ReportDataTablePayload };

/** sidecar JS에 직렬화할 analyzer report data bundle */
export interface ReportDataBundle {
  version: 1;
  reportBaseName: string;
  i18n: Record<string, string>;
  panels: Record<string, ReportDataPanelPayload>;
}

/** report sidecar asset을 생성한다. */
export function buildReportDataAsset(input: {
  reportBaseName: string;
  i18n: Record<string, string>;
  panels: Record<string, ReportDataPanelPayload>;
}): HtmlReportAsset {
  const bundle: ReportDataBundle = {
    version: 1,
    reportBaseName: input.reportBaseName,
    i18n: input.i18n,
    panels: input.panels,
  };

  return {
    kind: 'data-js',
    fileName: `${input.reportBaseName}.data.js`,
    contents: `window.__RISU_REPORT_DATA__ = ${serializeBundle(bundle)};\n`,
  };
}

function serializeBundle(value: ReportDataBundle): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script/gi, '<\\/script');
}
