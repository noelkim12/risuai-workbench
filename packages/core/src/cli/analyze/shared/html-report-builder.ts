/**
 * Analyze HTML 리포트 최종 조립·파일 작성 오케스트레이터.
 * charx / module / preset / compose 각 renderer에서 반복되는
 * renderHtmlReportShell → mkdirSync → writeFileSync 블록을 한 곳으로 모은다.
 * @file packages/core/src/cli/analyze/shared/html-report-builder.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Locale } from './i18n';
import { renderHtmlReportShell } from './html-report-shell';
import type { AnalysisVisualizationDoc } from './visualization-types';

/**
 * buildAnalysisHtmlReport 설정.
 * renderer별로 이미 조립된 AnalysisVisualizationDoc, locale, reportBaseName,
 * 그리고 파일을 작성할 analysisDir을 전달받는다.
 *
 * @param doc - renderer에서 이미 sections / panels / sources / summary 를 채운 visualization 문서
 * @param locale - 리포트 언어
 * @param reportBaseName - HTML 파일명 베이스 (예: 'charx-analysis', 'module-analysis')
 * @param analysisDir - 파일이 작성될 디렉토리 절대경로.
 *   charx/module/preset은 `path.join(outputDir, 'analysis')`로 계산해서 전달,
 *   compose는 호출부에서 이미 계산된 analysisDir을 그대로 전달.
 */
export interface BuildAnalysisHtmlReportConfig {
  doc: AnalysisVisualizationDoc;
  locale: Locale;
  reportBaseName: string;
  analysisDir: string;
}

/**
 * buildAnalysisHtmlReport. 공통 HTML 리포트 빌드·파일 작성 파이프라인.
 *
 * renderHtmlReportShell()로 HTML + clientJs + data assets을 생성한 뒤,
 * analysisDir에 `${reportBaseName}.html`, `report.js`, 그리고 data asset 파일들을 작성한다.
 *
 * @param config - 빌드 설정 (doc, locale, reportBaseName, analysisDir)
 */
export function buildAnalysisHtmlReport(config: BuildAnalysisHtmlReportConfig): void {
  const { doc, locale, reportBaseName, analysisDir } = config;

  fs.mkdirSync(analysisDir, { recursive: true });

  const { html, clientJs, assets } = renderHtmlReportShell(doc, { locale, reportBaseName });

  fs.writeFileSync(path.join(analysisDir, `${reportBaseName}.html`), html, 'utf-8');
  fs.writeFileSync(path.join(analysisDir, 'report.js'), clientJs, 'utf-8');
  for (const asset of assets) {
    fs.writeFileSync(path.join(analysisDir, asset.fileName), asset.contents, 'utf-8');
  }
}
