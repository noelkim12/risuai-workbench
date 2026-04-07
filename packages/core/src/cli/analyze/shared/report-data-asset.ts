import type { HtmlReportAsset } from './visualization-types';

/** sidecar JS에 직렬화할 report data bundle 패널 payload 항목 */
export interface ReportDataPanelPayload {
  kind: 'chart' | 'diagram';
  payload: string | Record<string, unknown>;
}

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
