/**
 * Hover provider에서 쓰는 workspace variable markdown formatter 모음.
 * @file packages/cbs-lsp/src/features/hover/hover-variable-formatting.ts
 */

import type { DefaultVariableDefinitionLocation, VariableFlowQueryResult } from '../../services';
import { CbsLspTextHelper } from '../../helpers/text-helper';

export type HoverWorkspaceVariableKind = 'chat' | 'global' | 'loop' | 'temp';

export interface AppendWorkspaceVariableSummaryOptions {
  lines: string[];
  variableName: string;
  kind: HoverWorkspaceVariableKind;
  currentUri: string;
  workspaceVariableQuery: VariableFlowQueryResult | null;
}

type WorkspaceOccurrence = VariableFlowQueryResult['occurrences'][number];

interface WorkspaceCommandLinkTarget {
  uri: string;
  range: WorkspaceOccurrence['hostRange'];
}

/**
 * appendWorkspaceVariableSummary 함수.
 * Chat variable hover markdown에 workspace writer/reader/default/issue 요약을 추가함.
 *
 * @param options - 현재 variable hover와 workspace query 요약 입력값
 */
export function appendWorkspaceVariableSummary(
  options: AppendWorkspaceVariableSummaryOptions,
): void {
  const { lines, variableName, kind, currentUri, workspaceVariableQuery } = options;

  if (kind !== 'chat' || workspaceVariableQuery?.variableName !== variableName) {
    return;
  }

  const externalWriters = workspaceVariableQuery.writers.filter(
    (occurrence) => occurrence.uri !== currentUri,
  );
  const externalReaders = workspaceVariableQuery.readers.filter(
    (occurrence) => occurrence.uri !== currentUri,
  );
  const representativeWriters = pickRepresentativeOccurrences(workspaceVariableQuery.writers);

  lines.push(`- Workspace writers: ${workspaceVariableQuery.writers.length}`);
  lines.push(`- Workspace readers: ${workspaceVariableQuery.readers.length}`);

  if (workspaceVariableQuery.defaultValue) {
    lines.push(`- Default value: ${workspaceVariableQuery.defaultValue}`);
  }

  if (workspaceVariableQuery.defaultDefinitions.length > 0) {
    lines.push('- Default definitions:');
    for (const definition of workspaceVariableQuery.defaultDefinitions) {
      lines.push(`  - ${formatDefaultDefinitionSummary(definition)}`);
    }
  }

  if (representativeWriters.length > 0) {
    lines.push('- Representative writers:');
    for (const writer of representativeWriters) {
      lines.push(`  - ${formatWorkspaceOccurrenceSummary(writer)}`);
    }
  }

  if (externalWriters.length > 0) {
    lines.push('- External writers:');
    for (const writer of externalWriters) {
      lines.push(`  - ${formatWorkspaceOccurrenceSummary(writer)}`);
    }
  }

  if (externalReaders.length > 0) {
    lines.push('- External readers:');
    for (const reader of externalReaders) {
      lines.push(`  - ${formatWorkspaceOccurrenceSummary(reader)}`);
    }
  }

  if (workspaceVariableQuery.issues.length > 0) {
    lines.push('- Workspace issues:');
    for (const issue of workspaceVariableQuery.issues) {
      lines.push(`  - ${formatWorkspaceIssueSummary(issue)}`);
    }
  }
}

/**
 * formatWorkspaceOccurrenceSummary 함수.
 * 변수의 발생 지점 정보를 상대 경로와 위치를 포함한 문자열 요약으로 변환함.
 *
 * @param occurrence - 변수 flow 결과의 개별 발생 항목
 * @returns 포맷팅된 발생 지점 요약 문자열
 */
export function formatWorkspaceOccurrenceSummary(occurrence: WorkspaceOccurrence): string {
  const codeQuote = String.fromCharCode(96);
  const locationLabel = `${occurrence.relativePath} (${CbsLspTextHelper.formatRangeStart(occurrence.hostRange)})`;
  return `${formatWorkspaceOccurrenceLink(occurrence, locationLabel)} — ${codeQuote}${occurrence.sourceName}${codeQuote}`;
}

/**
 * formatWorkspaceOccurrenceLink 함수.
 * 발생 위치로 이동하는 command markdown link를 생성함.
 *
 * @param occurrence - 링크 target으로 쓸 workspace occurrence
 * @param label - markdown link에 표시할 위치 label
 * @returns command URI markdown link 문자열
 */
export function formatWorkspaceOccurrenceLink(
  occurrence: WorkspaceOccurrence,
  label: string,
): string {
  return formatWorkspaceLocationLink(
    { uri: occurrence.uri, range: occurrence.hostRange },
    label,
  );
}

/**
 * formatDefaultDefinitionSummary 함수.
 * `.risuvar` default variable key 정의 위치를 command link 요약으로 변환함.
 *
 * @param definition - `.risuvar` key 정의 위치와 값 정보
 * @returns 포맷팅된 default definition 요약 문자열
 */
export function formatDefaultDefinitionSummary(
  definition: DefaultVariableDefinitionLocation,
): string {
  const codeQuote = String.fromCharCode(96);
  const locationLabel = `${definition.relativePath} (${CbsLspTextHelper.formatRangeStart(definition.range)})`;
  return `${formatWorkspaceLocationLink(
    { uri: definition.uri, range: definition.range },
    locationLabel,
  )} — ${codeQuote}${definition.variableName}${codeQuote}`;
}

/**
 * formatWorkspaceLocationLink 함수.
 * workspace 위치 정보로 이동하는 command markdown link를 생성함.
 *
 * @param target - command 인수로 직렬화할 URI와 range
 * @param label - markdown link에 표시할 위치 label
 * @returns command URI markdown link 문자열
 */
export function formatWorkspaceLocationLink(
  target: WorkspaceCommandLinkTarget,
  label: string,
): string {
  return `[${escapeMarkdownLinkLabel(label)}](${formatWorkspaceLocationMarkdownLinkTarget(target)})`;
}

/**
 * escapeMarkdownLinkLabel 함수.
 * Markdown link label 안의 escape 대상 문자를 보호함.
 *
 * @param label - markdown link label 원문
 * @returns escape 처리된 label
 */
export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/[\\\[\]]/gu, (character) => `\\${character}`);
}

/**
 * formatFileMarkdownLinkTarget 함수.
 * occurrence open command URI를 markdown link target 문자열로 변환함.
 *
 * @param occurrence - command 인수로 직렬화할 workspace occurrence
 * @returns markdown link target command URI
 */
export function formatFileMarkdownLinkTarget(occurrence: WorkspaceOccurrence): string {
  return formatWorkspaceLocationMarkdownLinkTarget({
    uri: occurrence.uri,
    range: occurrence.hostRange,
  });
}

/**
 * formatWorkspaceLocationMarkdownLinkTarget 함수.
 * workspace 위치를 open command URI markdown target으로 변환함.
 *
 * @param target - command 인수로 직렬화할 URI와 range
 * @returns markdown link target command URI
 */
export function formatWorkspaceLocationMarkdownLinkTarget(
  target: WorkspaceCommandLinkTarget,
): string {
  const args = encodeURIComponent(
    JSON.stringify([
      {
        range: target.range,
        uri: target.uri,
      },
    ]),
  );
  return `command:risuWorkbench.cbs.openOccurrence?${args}`;
}

/**
 * pickRepresentativeOccurrences 함수.
 * 변수 사용처 목록에서 정렬 기준에 따라 대표 항목들을 추출함.
 *
 * @param occurrences - 변수 flow 결과에서 얻은 발생 지점 배열
 * @param limit - 추출할 최대 개수
 * @returns 정렬 및 제한된 발생 지점 배열
 */
export function pickRepresentativeOccurrences<T extends WorkspaceOccurrence>(
  occurrences: readonly T[],
  limit: number = 3,
): readonly T[] {
  return [...occurrences]
    .sort(
      (left, right) =>
        left.relativePath.localeCompare(right.relativePath) ||
        left.hostStartOffset - right.hostStartOffset ||
        left.sourceName.localeCompare(right.sourceName),
    )
    .slice(0, limit);
}

/**
 * formatWorkspaceIssueSummary 함수.
 * 워크스페이스 변수 분석에서 발견된 이슈를 유형, 심각도, 위치 정보와 함께 요약함.
 *
 * @param issueMatch - 이슈 정보와 관련 발생 지점 매칭 데이터
 * @returns 포맷팅된 이슈 요약 문자열
 */
export function formatWorkspaceIssueSummary(
  issueMatch: VariableFlowQueryResult['issues'][number],
): string {
  const representativeOccurrence = pickRepresentativeOccurrences(issueMatch.occurrences, 1)[0] ?? null;
  const locationSuffix = representativeOccurrence
    ? ` — ${formatWorkspaceOccurrenceSummary(representativeOccurrence)}`
    : '';

  return `${issueMatch.issue.type} [${issueMatch.issue.severity}]: ${issueMatch.issue.message}${locationSuffix}`;
}
