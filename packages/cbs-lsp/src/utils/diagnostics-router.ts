/**
 * CBS fragment 진단을 host document diagnostics와 snapshot view로 변환하는 유틸 모음.
 * @file packages/cbs-lsp/src/utils/diagnostics-router.ts
 */

import type { CbsFragment, CbsFragmentMap, DiagnosticInfo } from 'risu-workbench-core';
import { DiagnosticSeverity, type Diagnostic, type DiagnosticRelatedInformation } from 'vscode-languageserver';

import {
  createDiagnosticRuleExplanation,
  DiagnosticCode,
  getDiagnosticDefinition,
} from '../analyzer/diagnostics';
import {
  createCbsAgentProtocolMarker,
  createLuaLsCompanionRuntime,
  createNormalizedRuntimeAvailabilitySnapshot,
  createFragmentOffsetMapper,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type NormalizedRuntimeAvailabilitySnapshot,
  type FragmentDocumentAnalysis,
  type FragmentOffsetMapper,
  type FragmentAnalysisVersion,
  type LuaLsCompanionRuntime,
  type RuntimeOperatorContractOptions,
} from '../core';
import type {
  VariableFlowIssueMatch,
  VariableFlowQueryResult,
  VariableFlowService,
} from '../services/variable-flow-service';
import { positionToOffset } from './position';
import type { FragmentAnalysisRequest } from '../core';
import { resolveVariablePosition } from '../features/local-first-contract';

export interface DiagnosticsFallbackTraceStats {
  attempts: number;
  hits: number;
  misses: number;
  durationMs: number;
  byCode: Record<string, number>;
}

interface DiagnosticFallbackMemo {
  readonly cache: Map<string, VariableFlowQueryResult | null>;
  readonly stats: DiagnosticsFallbackTraceStats;
}

/**
 * SEVERITY_MAP 상수.
 * analyzer severity 문자열을 LSP DiagnosticSeverity enum으로 정규화함.
 */
const SEVERITY_MAP: Record<'error' | 'warning' | 'info' | 'hint', DiagnosticSeverity> = {
  error: 1, // DiagnosticSeverity.Error
  warning: 2, // DiagnosticSeverity.Warning
  info: 3, // DiagnosticSeverity.Information
  hint: 4, // DiagnosticSeverity.Hint
};

export interface DiagnosticDocumentContext {
  uri?: string;
  version?: FragmentAnalysisVersion;
}

export interface NormalizedHostDiagnosticRelatedInformationSnapshot {
  message: string;
  range: DiagnosticRelatedInformation['location']['range'];
  uri: string;
}

export interface NormalizedHostDiagnosticSnapshot {
  code: string | null;
  data: Diagnostic['data'] | null;
  message: string;
  range: Diagnostic['range'];
  relatedInformation: NormalizedHostDiagnosticRelatedInformationSnapshot[];
  severity: DiagnosticSeverity | null;
  source: string | null;
}

export interface NormalizedHostDiagnosticsEnvelopeSnapshot {
  schema: string;
  schemaVersion: string;
  availability: NormalizedRuntimeAvailabilitySnapshot;
  diagnostics: NormalizedHostDiagnosticSnapshot[];
}

/**
 * mapDocumentToCbsFragments 함수.
 * 문서 텍스트를 fragment analysis service에 태워 CBS fragment map만 추출함.
 *
 * @param filePath - fragment 분석 대상으로 볼 문서 경로
 * @param content - fragment를 추출할 원문 텍스트
 * @param context - URI/version을 덮어쓸 선택적 문서 문맥
 * @returns CBS-bearing 문서면 fragment map, 아니면 null
 */
export function mapDocumentToCbsFragments(
  filePath: string,
  content: string,
  context: DiagnosticDocumentContext = {},
): CbsFragmentMap | null {
  return (
    fragmentAnalysisService.analyzeDocument({
      uri: context.uri ?? filePath,
      version: context.version ?? createSyntheticDocumentVersion(content),
      filePath,
      text: content,
    })?.fragmentMap ?? null
  );
}

/**
 * createDiagnosticForFragment 함수.
 * fragment 내부 offset 범위를 host document Diagnostic으로 승격함.
 *
 * @param documentContent - host range 계산에 쓸 전체 문서 텍스트
 * @param fragment - 진단 범위가 속한 CBS fragment
 * @param message - 사용자에게 보여줄 진단 메시지
 * @param severity - LSP severity로 바꿀 진단 심각도 문자열
 * @param code - 붙일 diagnostic code
 * @param startOffset - fragment content 내부 시작 offset
 * @param endOffset - fragment content 내부 끝 offset(exclusive)
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
function createDiagnosticForFragmentRange(
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
function mapFragmentDiagnosticsToHost(
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
 * compareDiagnosticsForHost 함수.
 * host diagnostics를 range/severity/code/message 순으로 deterministic 정렬함.
 *
 * @param left - 비교할 왼쪽 diagnostic
 * @param right - 비교할 오른쪽 diagnostic
 * @returns 정렬 순서를 위한 비교값
 */
function compareDiagnosticsForHost(left: Diagnostic, right: Diagnostic): number {
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
 * sortHostDiagnostics 함수.
 * host diagnostics 배열을 snapshot/test 친화적인 고정 순서로 정렬함.
 *
 * @param diagnostics - 정렬할 diagnostics 배열
 * @returns 복사 후 정렬된 diagnostics 배열
 */
function sortHostDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareDiagnosticsForHost);
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
    .sort(compareRelatedInformationForHost);

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

  return sortHostDiagnostics(diagnostics);
}

/**
 * normalizeHostDiagnosticForSnapshot 함수.
 * LSP Diagnostic 한 건을 deterministic snapshot 비교용 평탄 구조로 바꿈.
 *
 * @param diagnostic - snapshot view로 정규화할 host diagnostic
 * @returns stable field shape를 가진 normalized diagnostic
 */
export function normalizeHostDiagnosticForSnapshot(
  diagnostic: Diagnostic,
): NormalizedHostDiagnosticSnapshot {
  return {
    code: diagnostic.code === undefined ? null : String(diagnostic.code),
    data: diagnostic.data ?? null,
    message: diagnostic.message,
    range: diagnostic.range,
    relatedInformation: [...(diagnostic.relatedInformation ?? [])]
      .sort(compareRelatedInformationForHost)
      .map((entry) => ({
        message: entry.message,
        range: entry.location.range,
        uri: entry.location.uri,
      })),
    severity: diagnostic.severity ?? null,
    source: diagnostic.source ?? null,
  };
}

/**
 * normalizeHostDiagnosticsForSnapshot 함수.
 * host diagnostics 배열 전체를 정렬 후 normalized snapshot 배열로 바꿈.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns deterministic ordering이 적용된 normalized diagnostics 배열
 */
export function normalizeHostDiagnosticsForSnapshot(
  diagnostics: readonly Diagnostic[],
): NormalizedHostDiagnosticSnapshot[] {
  return sortHostDiagnostics(diagnostics).map(normalizeHostDiagnosticForSnapshot);
}

/**
 * normalizeHostDiagnosticsEnvelopeForSnapshot 함수.
 * host diagnostics normalized view에 공통 runtime availability contract를 함께 붙임.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns diagnostics와 availability snapshot을 함께 담은 deterministic JSON view
 */
export function normalizeHostDiagnosticsEnvelopeForSnapshot(
  diagnostics: readonly Diagnostic[],
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
  operatorOptions: RuntimeOperatorContractOptions = {},
): NormalizedHostDiagnosticsEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(lualsRuntime, operatorOptions),
    diagnostics: normalizeHostDiagnosticsForSnapshot(diagnostics),
  };
}

/**
 * routeDiagnosticsForDocument 함수.
 * 문서 전체를 분석해서 host document에 publish할 CBS diagnostics 배열을 만듦.
 *
 * @param filePath - diagnostics를 계산할 문서 경로
 * @param content - analyzer에 넘길 현재 문서 텍스트
 * @param options - 기존 호출부와의 호환을 유지하는 예약 옵션 슬롯
 * @param context - URI/version을 덮어쓸 선택적 문서 문맥
 * @returns non-CBS면 빈 배열, 아니면 host range 기준 Diagnostic 배열
 */
export function routeDiagnosticsForDocument(
  filePath: string,
  content: string,
  _options: Record<string, boolean> = {},
  context: DiagnosticDocumentContext = {},
): Diagnostic[] {
  const analysis = fragmentAnalysisService.analyzeDocument({
    uri: context.uri ?? filePath,
    version: context.version ?? createSyntheticDocumentVersion(content),
    filePath,
    text: content,
  });

  if (!analysis || analysis.fragmentAnalyses.length === 0) {
    return [];
  }

  const documentUri = context.uri ?? filePath;
  return sortHostDiagnostics(
    analysis.fragmentAnalyses
    .flatMap((fragmentAnalysis) => mapFragmentDiagnosticsToHost(content, documentUri, fragmentAnalysis))
  );
}

export { sortHostDiagnostics };

/**
 * shouldKeepLocalSymbolDiagnostic 함수.
 * workspace readers/writers가 있으면 local-only 변수 진단을 억제할지 판단함.
 *
 * @param diagnostic - 현재 문서에서 계산된 local diagnostic
 * @param request - diagnostic이 속한 fragment analysis request
 * @param variableFlowService - cross-file variable 관계를 조회할 Layer 3 서비스
 * @returns local diagnostic를 그대로 유지해야 하면 true
 */
export function shouldKeepLocalSymbolDiagnostic(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
  variableFlowService: VariableFlowService,
  fallbackMemo?: DiagnosticFallbackMemo,
): boolean {
  if (
    diagnostic.code !== DiagnosticCode.UndefinedVariable &&
    diagnostic.code !== DiagnosticCode.UnusedVariable
  ) {
    return true;
  }

  const variableQuery =
    variableFlowService.queryAt(
      request.uri,
      positionToOffset(request.text, diagnostic.range.start),
    ) ?? resolveDiagnosticVariableQuery(diagnostic, request, variableFlowService, fallbackMemo);

  if (!variableQuery) {
    return true;
  }

  if (diagnostic.code === DiagnosticCode.UndefinedVariable) {
    return variableQuery.writers.length === 0 && variableQuery.defaultValue === null;
  }

  return variableQuery.readers.length === 0;
}

/**
 * resolveDiagnosticVariableQuery 함수.
 * Graph occurrence가 없는 `.risulua` CBS macro 인자 진단을 이름 기반 workspace query로 보강함.
 *
 * @param diagnostic - local symbol diagnostic 한 건
 * @param request - 진단이 발생한 host document 분석 요청
 * @param variableFlowService - workspace 변수 흐름 조회 서비스
 * @returns workspace variable query 결과 또는 null
 */
function resolveDiagnosticVariableQuery(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
  variableFlowService: VariableFlowService,
  fallbackMemo?: DiagnosticFallbackMemo,
): VariableFlowQueryResult | null {
  if (!shouldAttemptDiagnosticVariableFallback(diagnostic, request)) {
    return null;
  }

  const code = String(diagnostic.code ?? 'unknown');
  const cacheKey = [
    request.uri,
    request.version,
    code,
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    diagnostic.range.end.line,
    diagnostic.range.end.character,
  ].join(':');

  if (fallbackMemo?.cache.has(cacheKey)) {
    return fallbackMemo.cache.get(cacheKey) ?? null;
  }

  const startedAt = performance.now();
  if (fallbackMemo) {
    fallbackMemo.stats.attempts += 1;
    fallbackMemo.stats.byCode[code] = (fallbackMemo.stats.byCode[code] ?? 0) + 1;
  }

  const lookup = fragmentAnalysisService.locatePosition(request, diagnostic.range.start);
  if (!lookup) {
    recordDiagnosticFallbackResult(fallbackMemo, cacheKey, null, startedAt);
    return null;
  }

  const variablePosition = resolveVariablePosition(lookup);
  if (!variablePosition || variablePosition.kind !== 'chat') {
    recordDiagnosticFallbackResult(fallbackMemo, cacheKey, null, startedAt);
    return null;
  }

  const result = variableFlowService.queryVariable(variablePosition.variableName);
  recordDiagnosticFallbackResult(fallbackMemo, cacheKey, result, startedAt);
  return result;
}

/**
 * shouldAttemptDiagnosticVariableFallback 함수.
 * `.risulua` CBS chat variable argument 진단에만 이름 기반 fallback을 허용함.
 *
 * @param diagnostic - fallback 후보 local diagnostic
 * @param request - 진단이 발생한 host document 분석 요청
 * @returns fallback을 시도해도 되는 조건이면 true
 */
function shouldAttemptDiagnosticVariableFallback(
  diagnostic: Diagnostic,
  request: FragmentAnalysisRequest,
): boolean {
  if (
    diagnostic.code !== DiagnosticCode.UndefinedVariable &&
    diagnostic.code !== DiagnosticCode.UnusedVariable
  ) {
    return false;
  }

  return request.filePath.toLowerCase().endsWith('.risulua');
}

/**
 * recordDiagnosticFallbackResult 함수.
 * diagnostics publish 한 번의 fallback cache와 tracing stats를 갱신함.
 *
 * @param fallbackMemo - publish-scope fallback memoization 상태
 * @param cacheKey - URI/version/range/code 기반 fallback key
 * @param result - fallback query 결과
 * @param startedAt - fallback 시작 시각
 */
function recordDiagnosticFallbackResult(
  fallbackMemo: DiagnosticFallbackMemo | undefined,
  cacheKey: string,
  result: VariableFlowQueryResult | null,
  startedAt: number,
): void {
  if (!fallbackMemo) {
    return;
  }

  fallbackMemo.cache.set(cacheKey, result);
  fallbackMemo.stats.durationMs += performance.now() - startedAt;
  if (result) {
    fallbackMemo.stats.hits += 1;
  } else {
    fallbackMemo.stats.misses += 1;
  }
}

export interface AssembleDiagnosticsOptions {
  localDiagnostics: Diagnostic[];
  workspaceVariableFlowService: VariableFlowService | null;
  request: FragmentAnalysisRequest;
  fallbackTraceStats?: DiagnosticsFallbackTraceStats;
}

/**
 * assembleDiagnosticsForRequest 함수.
 * local diagnostics와 workspace-level diagnostics를 병합해 정렬된 최종 diagnostics 배열을 만듦.
 * 이 함수는 순수/순수-유사한 diagnostics 조립 로직만 담당하며, server orchestration이나 transport와는 분리됨.
 *
 * @param options - 조립에 필요한 local diagnostics, workspace service, request 정보
 * @returns 필터링 및 병합, 정렬이 완료된 diagnostics 배열
 */
export function assembleDiagnosticsForRequest(
  options: AssembleDiagnosticsOptions,
): Diagnostic[] {
  const { localDiagnostics, workspaceVariableFlowService, request } = options;
  const fallbackMemo = options.fallbackTraceStats
    ? {
        cache: new Map<string, VariableFlowQueryResult | null>(),
        stats: options.fallbackTraceStats,
      }
    : undefined;

  const filteredLocalDiagnostics = workspaceVariableFlowService
    ? localDiagnostics.filter((diagnostic) =>
        shouldKeepLocalSymbolDiagnostic(diagnostic, request, workspaceVariableFlowService, fallbackMemo),
      )
    : localDiagnostics;

  const workspaceDiagnostics = workspaceVariableFlowService
    ? createWorkspaceVariableDiagnosticsForUri(request.uri, workspaceVariableFlowService)
    : [];

  return sortHostDiagnostics([...filteredLocalDiagnostics, ...workspaceDiagnostics]);
}
