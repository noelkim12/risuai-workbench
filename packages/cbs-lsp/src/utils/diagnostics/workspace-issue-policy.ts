/**
 * Workspace variable-flow issues를 host diagnostics로 변환하는 정책 모음.
 * @file packages/cbs-lsp/src/utils/diagnostics/workspace-issue-policy.ts
 */

import { DiagnosticSeverity, type Diagnostic, type DiagnosticRelatedInformation } from 'vscode-languageserver';

import {
  createDiagnosticRuleExplanation,
  DiagnosticCode,
  getDiagnosticDefinition,
} from '../../analyzer/diagnostics';
import type {
  VariableFlowIssueMatch,
  VariableFlowService,
} from '../../services/variable-flow-service';

/**
 * compareRelatedInformationForWorkspaceIssue 함수.
 * workspace issue relatedInformation을 host range와 message 기준으로 안정적으로 정렬함.
 *
 * @param left - 비교할 왼쪽 related information
 * @param right - 비교할 오른쪽 related information
 * @returns 정렬 순서를 위한 비교값
 */
function compareRelatedInformationForWorkspaceIssue(
  left: DiagnosticRelatedInformation,
  right: DiagnosticRelatedInformation,
): number {
  return (
    comparePositions(left.location.range.start, right.location.range.start) ||
    comparePositions(left.location.range.end, right.location.range.end) ||
    left.message.localeCompare(right.message)
  );
}

/**
 * compareWorkspaceDiagnostics 함수.
 * workspace issue diagnostics를 range/severity/code/message 순으로 deterministic 정렬함.
 *
 * @param left - 비교할 왼쪽 diagnostic
 * @param right - 비교할 오른쪽 diagnostic
 * @returns 정렬 순서를 위한 비교값
 */
function compareWorkspaceDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const leftCode = typeof left.code === 'string' ? left.code : String(left.code ?? '');
  const rightCode = typeof right.code === 'string' ? right.code : String(right.code ?? '');

  return (
    compareNumbers(left.range.start.line, right.range.start.line) ||
    compareNumbers(left.range.start.character, right.range.start.character) ||
    compareNumbers(left.range.end.line, right.range.end.line) ||
    compareNumbers(left.range.end.character, right.range.end.character) ||
    compareNumbers(left.severity ?? 0, right.severity ?? 0) ||
    leftCode.localeCompare(rightCode) ||
    left.message.localeCompare(right.message)
  );
}

/**
 * comparePositions 함수.
 * LSP position 두 개를 line/character 기준으로 비교함.
 *
 * @param left - 비교할 왼쪽 position
 * @param right - 비교할 오른쪽 position
 * @returns 정렬 순서를 위한 비교값
 */
function comparePositions(
  left: Diagnostic['range']['start'],
  right: Diagnostic['range']['start'],
): number {
  return compareNumbers(left.line, right.line) || compareNumbers(left.character, right.character);
}

/**
 * compareNumbers 함수.
 * 숫자 오름차순 정렬에 쓸 기본 비교값을 계산함.
 *
 * @param left - 비교할 왼쪽 숫자
 * @param right - 비교할 오른쪽 숫자
 * @returns left-right 차이값
 */
function compareNumbers(left: number, right: number): number {
  return left - right;
}

/**
 * sortWorkspaceDiagnostics 함수.
 * workspace issue diagnostics 배열을 snapshot/test 친화적인 고정 순서로 정렬함.
 *
 * @param diagnostics - 정렬할 diagnostics 배열
 * @returns 복사 후 정렬된 diagnostics 배열
 */
function sortWorkspaceDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareWorkspaceDiagnostics);
}

/**
 * mapWorkspaceIssueToDiagnosticCode 함수.
 * variable-flow issue 타입을 공개 CBS diagnostic code로 대응시킴.
 *
 * @param issueType - workspace variable-flow issue 종류
 * @returns 대응되는 CBS diagnostic code, 없으면 null
 */
function mapWorkspaceIssueToDiagnosticCode(issueType: VariableFlowIssueMatch['issue']['type']): DiagnosticCode | null {
  switch (issueType) {
    case 'uninitialized-read':
      return DiagnosticCode.UndefinedVariable;
    case 'write-only':
      return DiagnosticCode.UnusedVariable;
    default:
      return null;
  }
}

/**
 * shouldAttachOccurrenceToWorkspaceIssue 함수.
 * workspace issue를 현재 occurrence 방향에 붙여야 하는지 결정함.
 *
 * @param issueType - workspace variable-flow issue 종류
 * @param direction - 현재 occurrence의 read/write 방향
 * @returns 이 occurrence에 diagnostic을 붙여야 하면 true
 */
function shouldAttachOccurrenceToWorkspaceIssue(
  issueType: VariableFlowIssueMatch['issue']['type'],
  direction: 'read' | 'write',
): boolean {
  if (issueType === 'uninitialized-read') {
    return direction === 'read';
  }

  if (issueType === 'write-only') {
    return direction === 'write';
  }

  return false;
}

/**
 * mapWorkspaceIssueSeverity 함수.
 * variable-flow issue severity를 LSP severity enum으로 변환함.
 *
 * @param severity - workspace issue severity 문자열
 * @returns 대응되는 LSP DiagnosticSeverity 값
 */
function mapWorkspaceIssueSeverity(
  severity: VariableFlowIssueMatch['issue']['severity'],
): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Hint;
  }
}

/**
 * createWorkspaceIssueRelatedInformation 함수.
 * 같은 workspace issue의 다른 occurrence들을 relatedInformation 목록으로 묶음.
 *
 * @param currentOccurrenceId - 현재 diagnostic이 대표하는 occurrence ID
 * @param issueMatch - related occurrence가 포함된 workspace issue 매치 결과
 * @returns 현재 occurrence를 제외한 relatedInformation 배열, 없으면 undefined
 */
function createWorkspaceIssueRelatedInformation(
  currentOccurrenceId: string,
  issueMatch: VariableFlowIssueMatch,
): DiagnosticRelatedInformation[] | undefined {
  const relatedInformation = issueMatch.occurrences
    .filter((occurrence) => occurrence.occurrenceId !== currentOccurrenceId)
    .map((occurrence) => ({
      message: `Workspace ${occurrence.direction} via ${occurrence.sourceName} in ${occurrence.relativePath}`,
      location: {
        uri: occurrence.uri,
        range: occurrence.hostRange,
      },
    }))
    .sort(compareRelatedInformationForWorkspaceIssue);

  return relatedInformation.length > 0 ? relatedInformation : undefined;
}

/**
 * createWorkspaceIssueMachineData 함수.
 * workspace variable-flow issue를 diagnostic.data의 machine-readable metadata로 정규화함.
 *
 * @param code - issue에 대응되는 diagnostic code
 * @param severity - workspace issue severity 문자열
 * @param issueType - workspace issue 종류
 * @returns diagnostic.data에 실을 rule/workspaceIssue 메타데이터
 */
function createWorkspaceIssueMachineData(
  code: DiagnosticCode,
  severity: VariableFlowIssueMatch['issue']['severity'],
  issueType: VariableFlowIssueMatch['issue']['type'],
): Diagnostic['data'] | undefined {
  const definition = getDiagnosticDefinition(code);
  if (!definition) {
    return undefined;
  }

  return {
    rule: {
      ...definition,
      severity,
      explanation: createDiagnosticRuleExplanation(definition.owner, definition.category),
    },
    workspaceIssue: {
      kind: issueType,
      source: 'variable-flow-service',
    },
  };
}

/**
 * createWorkspaceVariableDiagnosticsForUri 함수.
 * 한 URI에 속한 variable-flow 이슈를 host diagnostics 배열로 변환함.
 *
 * @param uri - workspace issue를 진단으로 만들 대상 문서 URI
 * @param variableFlowService - cross-file variable occurrence와 issue를 조회할 서비스
 * @returns 현재 URI에 attach 가능한 workspace variable diagnostics 배열
 */
export function createWorkspaceVariableDiagnosticsForUri(
  uri: string,
  variableFlowService: VariableFlowService,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const variableNames = [...new Set(variableFlowService.getGraph().getOccurrencesByUri(uri).map((occ) => occ.variableName))]
    .sort((left, right) => left.localeCompare(right));

  for (const variableName of variableNames) {
    for (const issueMatch of variableFlowService.getIssues(variableName)) {
      const code = mapWorkspaceIssueToDiagnosticCode(issueMatch.issue.type);
      if (!code) {
        continue;
      }

      const localOccurrences = issueMatch.occurrences.filter(
        (occurrence) =>
          occurrence.uri === uri &&
          shouldAttachOccurrenceToWorkspaceIssue(issueMatch.issue.type, occurrence.direction),
      );

      for (const occurrence of localOccurrences) {
        const diagnosticKey = [
          code,
          issueMatch.issue.type,
          occurrence.occurrenceId,
          issueMatch.issue.message,
        ].join(':');
        if (seen.has(diagnosticKey)) {
          continue;
        }
        seen.add(diagnosticKey);

        diagnostics.push({
          code,
          data: createWorkspaceIssueMachineData(code, issueMatch.issue.severity, issueMatch.issue.type),
          message: issueMatch.issue.message,
          range: occurrence.hostRange,
          relatedInformation: createWorkspaceIssueRelatedInformation(
            occurrence.occurrenceId,
            issueMatch,
          ),
          severity: mapWorkspaceIssueSeverity(issueMatch.issue.severity),
          source: 'risu-cbs',
        });
      }
    }
  }

  return sortWorkspaceDiagnostics(diagnostics);
}
