/**
 * Fragment-local diagnostics를 host document diagnostics로 승격하는 정책 모음.
 * @file packages/cbs-lsp/src/utils/diagnostics/fragment-diagnostic-policy.ts
 */

import type { CbsFragment, DiagnosticInfo } from 'risu-workbench-core';
import { DiagnosticSeverity, type Diagnostic, type DiagnosticRelatedInformation } from 'vscode-languageserver';

import {
  createFragmentOffsetMapper,
  type FragmentDocumentAnalysis,
  type FragmentOffsetMapper,
} from '../../core';

const SEVERITY_MAP: Record<'error' | 'warning' | 'info' | 'hint', DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/**
 * createDiagnosticForFragment 함수.
 * fragment offset 범위를 host document Diagnostic으로 승격함.
 *
 * @param documentContent - host range 계산에 쓸 전체 문서 텍스트
 * @param fragment - 진단 범위가 속한 CBS fragment
 * @param message - 사용자에게 보여줄 진단 메시지
 * @param severity - LSP severity로 바꿀 진단 심각도 문자열
 * @param code - 붙일 diagnostic code
 * @param startOffset - fragment content 내부 시작 offset
 * @param endOffset - fragment content 내부 끝 offset
 * @returns host document 좌표 기준 LSP Diagnostic
 */
export function createDiagnosticForFragment(
  documentContent: string,
  fragment: CbsFragment,
  message: string,
  severity: 'error' | 'warning' | 'info' | 'hint' = 'error',
  code?: string,
  startOffset: number = 0,
  endOffset: number = fragment.content.length,
): Diagnostic {
  const mapper = createFragmentOffsetMapper(fragment);
  const range =
    mapper.toHostRangeFromOffsets(documentContent, startOffset, endOffset) ??
    mapper.toHostRangeFromOffsets(documentContent, 0, 0)!;

  return {
    message,
    severity: SEVERITY_MAP[severity],
    code,
    range,
    source: 'risu-cbs',
  };
}

/**
 * createDiagnosticForFragmentRange 함수.
 * analyzer DiagnosticInfo 한 건을 host range와 relatedInformation이 붙은 LSP Diagnostic으로 바꿈.
 *
 * @param documentContent - host range rebasing 기준이 되는 전체 문서 텍스트
 * @param documentUri - 결과 diagnostic이 가리킬 host document URI
 * @param fragment - analyzer 진단이 속한 CBS fragment
 * @param mapper - fragment↔host offset 매핑기
 * @param diagnostic - host diagnostic으로 승격할 analyzer 진단
 * @returns host document 기준 LSP Diagnostic 한 건
 */
export function createDiagnosticForFragmentRange(
  documentContent: string,
  documentUri: string,
  fragment: CbsFragment,
  mapper: FragmentOffsetMapper,
  diagnostic: DiagnosticInfo,
): Diagnostic {
  const range = mapper.toHostRange(documentContent, diagnostic.range);
  const relatedInformation = mapRelatedInformation(
    documentContent,
    documentUri,
    mapper,
    diagnostic.relatedInformation,
  );

  if (range) {
    return {
      data: diagnostic.data,
      message: diagnostic.message,
      severity: SEVERITY_MAP[diagnostic.severity],
      code: diagnostic.code,
      relatedInformation,
      range,
      source: 'risu-cbs',
    };
  }

  return {
    ...createDiagnosticForFragment(
      documentContent,
      fragment,
      diagnostic.message,
      diagnostic.severity,
      diagnostic.code,
    ),
    data: diagnostic.data,
    relatedInformation,
  };
}

/**
 * mapFragmentDiagnosticsToHost 함수.
 * fragment analysis 결과의 diagnostics 배열을 host document diagnostics 배열로 변환함.
 *
 * @param documentContent - host range rebasing 기준이 되는 전체 문서 텍스트
 * @param documentUri - 결과 diagnostics가 속할 host document URI
 * @param fragmentAnalysis - fragment 단위 analyzer 결과
 * @returns host document에 바로 publish할 Diagnostic 배열
 */
export function mapFragmentDiagnosticsToHost(
  documentContent: string,
  documentUri: string,
  fragmentAnalysis: FragmentDocumentAnalysis,
): Diagnostic[] {
  return fragmentAnalysis.diagnostics.map((diagnostic) =>
    createDiagnosticForFragmentRange(
      documentContent,
      documentUri,
      fragmentAnalysis.fragment,
      fragmentAnalysis.mapper,
      diagnostic,
    ),
  );
}

/**
 * mapRelatedInformation 함수.
 * fragment-local relatedInformation을 host document URI/range 기준 정보로 다시 매핑함.
 *
 * @param documentContent - host range rebasing 기준이 되는 전체 문서 텍스트
 * @param documentUri - relatedInformation이 가리킬 host document URI
 * @param mapper - fragment↔host offset 매핑기
 * @param relatedInformation - analyzer가 낸 fragment-local related information 목록
 * @returns host document 기준 relatedInformation 배열, 없으면 undefined
 */
function mapRelatedInformation(
  documentContent: string,
  documentUri: string,
  mapper: FragmentOffsetMapper,
  relatedInformation: DiagnosticInfo['relatedInformation'],
): DiagnosticRelatedInformation[] | undefined {
  if (!relatedInformation || relatedInformation.length === 0) {
    return undefined;
  }

  const mapped = relatedInformation
    .map((entry) => {
      const range = mapper.toHostRange(documentContent, entry.range);
      if (!range) {
        return null;
      }

      return {
        message: entry.message,
        location: {
          uri: documentUri,
          range,
        },
      } satisfies DiagnosticRelatedInformation;
    })
    .filter((entry): entry is DiagnosticRelatedInformation => entry !== null)
    .sort(compareRelatedInformationForHost);

  return mapped.length > 0 ? mapped : undefined;
}

/**
 * compareRelatedInformationForHost 함수.
 * relatedInformation 목록을 host range와 message 기준으로 안정적으로 정렬함.
 *
 * @param left - 비교할 왼쪽 related information
 * @param right - 비교할 오른쪽 related information
 * @returns 정렬 순서를 위한 비교값
 */
function compareRelatedInformationForHost(
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
