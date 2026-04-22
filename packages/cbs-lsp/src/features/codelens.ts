/**
 * Lorebook activation CodeLens provider.
 * @file packages/cbs-lsp/src/features/codelens.ts
 */

import type {
  CancellationToken,
  CodeLens,
  CodeLensParams,
  Command,
  Range as LspRange,
} from 'vscode-languageserver/node';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  createAgentMetadataExplanation,
  createCbsAgentProtocolMarker,
  createNormalizedRuntimeAvailabilitySnapshot,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataExplanationContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type NormalizedRuntimeAvailabilitySnapshot,
} from '../core';
import type { ActivationChainQueryResult, ActivationChainService } from '../services';
import { isRequestCancelled } from '../utils/request-cancellation';

export const ACTIVATION_CHAIN_CODELENS_COMMAND = 'cbs-lsp.codelens.activationSummary';

type ActivationCodeLensKind = 'detail' | 'summary';
type ActivationCodeLensCommandMode = 'no-op';
type ActivationCodeLensState = 'active';

const CODELENS_SNAPSHOT_PROVENANCE = Object.freeze(
  createAgentMetadataExplanation(
    'contextual-inference',
    'codelens:activation-summary',
    'CodeLens snapshots normalize lorebook activation summary/detail lenses into stable command, count, cycle, and refresh semantics without requiring title string parsing.',
  ),
);

const CODELENS_SUMMARY_STATUSES = Object.freeze(['possible'] as const);
const CODELENS_DETAIL_STATUSES = Object.freeze(['partial', 'blocked'] as const);
const CODELENS_REFRESH_TRIGGERS = Object.freeze(['document-sync', 'watched-files'] as const);

export type CodeLensRequestResolver = (params: CodeLensParams) => FragmentAnalysisRequest | null;

export type ActivationChainServiceResolver = (uri: string) => ActivationChainService | null;

export interface CodeLensProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveActivationChainService?: ActivationChainServiceResolver;
  resolveRequest?: CodeLensRequestResolver;
}

export interface ActivationCodeLensCountBucketSnapshot {
  blocked: number;
  partial: number;
  possible: number;
}

export interface ActivationCodeLensCountsSnapshot {
  incoming: ActivationCodeLensCountBucketSnapshot;
  outgoing: ActivationCodeLensCountBucketSnapshot;
}

export interface ActivationCodeLensCycleSnapshot {
  count: number;
  hasCycles: boolean;
}

export interface ActivationCodeLensCommandSnapshot {
  command: string | null;
  kind: ActivationCodeLensKind | null;
  mode: ActivationCodeLensCommandMode;
  uri: string | null;
}

export interface ActivationCodeLensSemanticsSnapshot {
  detailStatuses: readonly ('blocked' | 'partial')[];
  refreshTriggers: readonly ('document-sync' | 'watched-files')[];
  summaryStatuses: readonly ('possible')[];
}

export interface NormalizedCodeLensSnapshot {
  command: ActivationCodeLensCommandSnapshot;
  counts: ActivationCodeLensCountsSnapshot;
  cycle: ActivationCodeLensCycleSnapshot;
  lensKind: ActivationCodeLensKind;
  lensState: ActivationCodeLensState;
  range: LspRange;
  semantics: ActivationCodeLensSemanticsSnapshot;
  title: string | null;
}

export interface ActivationCodeLensAgentData {
  availability: AgentMetadataAvailabilityContract;
  lens: NormalizedCodeLensSnapshot;
  provenance: AgentMetadataExplanationContract;
  schema: string;
  schemaVersion: string;
}

export interface NormalizedCodeLensesEnvelopeSnapshot {
  availability: NormalizedRuntimeAvailabilitySnapshot;
  codeLenses: NormalizedCodeLensSnapshot[];
  provenance: AgentMetadataExplanationContract;
  schema: string;
  schemaVersion: string;
}

/**
 * createCodeLensCommand 함수.
 * informational CodeLens가 server-owned no-op command로 렌더링되도록 payload를 만듦.
 *
 * @param title - editor에 표시할 CodeLens 문구
 * @param uri - CodeLens가 붙는 lorebook 문서 URI
 * @param kind - summary/detail 중 어떤 lens인지 구분하는 식별자
 * @returns executeCommandProvider가 소유하는 안정적인 no-op command payload
 */
function createCodeLensCommand(
  title: string,
  uri: string,
  kind: ActivationCodeLensKind,
): Command {
  return {
    title,
    command: ACTIVATION_CHAIN_CODELENS_COMMAND,
    arguments: [{ kind, uri }],
  };
}

/**
 * createSummaryTitle 함수.
 * 실제 활성화 가능한 possible edge만 메인 incoming/outgoing 숫자에 반영함.
 *
 * @param query - 현재 lorebook activation query result
 * @returns README goal wording과 같은 메인 CodeLens 문구
 */
function createSummaryTitle(query: ActivationChainQueryResult): string {
  return `${query.possibleIncoming.length}개 엔트리에 의해 활성화됨 | ${query.possibleOutgoing.length}개 엔트리를 활성화`;
}

/**
 * createDetailTitle 함수.
 * partial/blocked edge와 cycle 감지를 보조 CodeLens로 노출해 메인 숫자에서 제외된 정책을 드러냄.
 *
 * @param query - 현재 lorebook activation query result
 * @returns 추가 상태가 없으면 null, 있으면 보조 CodeLens 문구
 */
function createDetailTitle(query: ActivationChainQueryResult): string | null {
  const segments: string[] = [];

  if (query.partialIncoming.length > 0 || query.partialOutgoing.length > 0) {
    segments.push(
      `부분 매치: 들어옴 ${query.partialIncoming.length} / 나감 ${query.partialOutgoing.length}`,
    );
  }

  if (query.blockedIncoming.length > 0 || query.blockedOutgoing.length > 0) {
    segments.push(`차단: 들어옴 ${query.blockedIncoming.length} / 나감 ${query.blockedOutgoing.length}`);
  }

  if (query.cycle.hasCycles) {
    segments.push('순환 감지');
  }

  return segments.length > 0 ? segments.join(' | ') : null;
}

/**
 * createCodeLensCountsSnapshot 함수.
 * activation query의 incoming/outgoing status count를 stable snapshot shape로 정규화함.
 *
 * @param query - 현재 lorebook activation query result
 * @returns possible/partial/blocked count를 모두 포함한 정규화된 count snapshot
 */
function createCodeLensCountsSnapshot(
  query: ActivationChainQueryResult,
): ActivationCodeLensCountsSnapshot {
  return {
    incoming: {
      blocked: query.blockedIncoming.length,
      partial: query.partialIncoming.length,
      possible: query.possibleIncoming.length,
    },
    outgoing: {
      blocked: query.blockedOutgoing.length,
      partial: query.partialOutgoing.length,
      possible: query.possibleOutgoing.length,
    },
  };
}

/**
 * createNormalizedCodeLensSnapshot 함수.
 * 개별 CodeLens의 제목/명령/count/cycle 의미를 agent-friendly stable snapshot으로 고정함.
 *
 * @param range - CodeLens가 표시될 host range
 * @param title - editor title 문자열
 * @param uri - lorebook 문서 URI
 * @param kind - summary/detail lens kind
 * @param query - 현재 lorebook activation query result
 * @returns deterministic field names를 가진 normalized CodeLens snapshot
 */
function createNormalizedCodeLensSnapshot(
  range: LspRange,
  title: string,
  uri: string,
  kind: ActivationCodeLensKind,
  query: ActivationChainQueryResult,
): NormalizedCodeLensSnapshot {
  return {
    command: {
      command: ACTIVATION_CHAIN_CODELENS_COMMAND,
      kind,
      mode: 'no-op',
      uri,
    },
    counts: createCodeLensCountsSnapshot(query),
    cycle: {
      count: query.cycle.cycleCount,
      hasCycles: query.cycle.hasCycles,
    },
    lensKind: kind,
    lensState: 'active',
    range,
    semantics: {
      detailStatuses: CODELENS_DETAIL_STATUSES,
      refreshTriggers: CODELENS_REFRESH_TRIGGERS,
      summaryStatuses: CODELENS_SUMMARY_STATUSES,
    },
    title,
  };
}

/**
 * createCodeLensAgentData 함수.
 * 실제 CodeLens payload에 machine-readable availability/provenance/count semantics를 실어줌.
 *
 * @param range - CodeLens가 표시될 host range
 * @param title - editor title 문자열
 * @param uri - lorebook 문서 URI
 * @param kind - summary/detail lens kind
 * @param query - 현재 lorebook activation query result
 * @returns CodeLens.data에 실을 agent-facing metadata envelope
 */
function createCodeLensAgentData(
  range: LspRange,
  title: string,
  uri: string,
  kind: ActivationCodeLensKind,
  query: ActivationChainQueryResult,
): ActivationCodeLensAgentData {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: ACTIVE_FEATURE_AVAILABILITY.codelens,
    lens: createNormalizedCodeLensSnapshot(range, title, uri, kind, query),
    provenance: CODELENS_SNAPSHOT_PROVENANCE,
  };
}

/**
 * isActivationCodeLensAgentData 함수.
 * CodeLens.data가 CodeLens agent snapshot contract를 따르는지 판별함.
 *
 * @param value - 판별할 임의 payload
 * @returns CodeLens agent metadata contract이면 true
 */
function isActivationCodeLensAgentData(value: unknown): value is ActivationCodeLensAgentData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ActivationCodeLensAgentData>;
  return (
    candidate.schema === createCbsAgentProtocolMarker().schema &&
    candidate.schemaVersion === createCbsAgentProtocolMarker().schemaVersion &&
    candidate.lens !== undefined &&
    candidate.availability !== undefined &&
    candidate.provenance !== undefined
  );
}

/**
 * normalizeCodeLensForSnapshot 함수.
 * CodeLens 한 건을 deterministic snapshot shape로 정규화함.
 *
 * @param lens - 정규화할 CodeLens
 * @returns count/command/cycle semantics를 포함한 normalized snapshot
 */
export function normalizeCodeLensForSnapshot(lens: CodeLens): NormalizedCodeLensSnapshot {
  const data = isActivationCodeLensAgentData(lens.data) ? lens.data : null;

  return {
    command: {
      command: lens.command?.command ?? null,
      kind: data?.lens.command.kind ?? null,
      mode: data?.lens.command.mode ?? 'no-op',
      uri: data?.lens.command.uri ?? null,
    },
    counts: data?.lens.counts ?? {
      incoming: { blocked: 0, partial: 0, possible: 0 },
      outgoing: { blocked: 0, partial: 0, possible: 0 },
    },
    cycle: data?.lens.cycle ?? {
      count: 0,
      hasCycles: false,
    },
    lensKind: data?.lens.lensKind ?? 'summary',
    lensState: data?.lens.lensState ?? 'active',
    range: lens.range,
    semantics: data?.lens.semantics ?? {
      detailStatuses: CODELENS_DETAIL_STATUSES,
      refreshTriggers: CODELENS_REFRESH_TRIGGERS,
      summaryStatuses: CODELENS_SUMMARY_STATUSES,
    },
    title: lens.command?.title ?? null,
  };
}

/**
 * normalizeCodeLensesForSnapshot 함수.
 * CodeLens 배열을 deterministic ordering의 normalized snapshot 목록으로 변환함.
 *
 * @param lenses - 정규화할 CodeLens 목록
 * @returns stable ordering을 가진 normalized CodeLens snapshot 배열
 */
export function normalizeCodeLensesForSnapshot(
  lenses: readonly CodeLens[],
): NormalizedCodeLensSnapshot[] {
  return [...lenses].map(normalizeCodeLensForSnapshot).sort(compareNormalizedCodeLenses);
}

/**
 * normalizeCodeLensesEnvelopeForSnapshot 함수.
 * CodeLens snapshot에 공통 schema/version + availability/provenance envelope를 붙임.
 *
 * @param lenses - 정규화할 CodeLens 목록
 * @returns availability/provenance를 포함한 CodeLens snapshot envelope
 */
export function normalizeCodeLensesEnvelopeForSnapshot(
  lenses: readonly CodeLens[],
): NormalizedCodeLensesEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(),
    codeLenses: normalizeCodeLensesForSnapshot(lenses),
    provenance: CODELENS_SNAPSHOT_PROVENANCE,
  };
}

/**
 * compareNormalizedCodeLenses 함수.
 * normalized CodeLens snapshot 배열의 deterministic ordering을 비교함.
 *
 * @param left - 왼쪽 snapshot
 * @param right - 오른쪽 snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedCodeLenses(
  left: NormalizedCodeLensSnapshot,
  right: NormalizedCodeLensSnapshot,
): number {
  return (
    compareStrings(left.lensKind, right.lensKind) ||
    compareStrings(left.title, right.title) ||
    compareStrings(left.command.command, right.command.command) ||
    compareStrings(left.command.uri, right.command.uri) ||
    compareRanges(left.range, right.range)
  );
}

/**
 * compareRanges 함수.
 * CodeLens range 두 개를 stable ordering 기준으로 비교함.
 *
 * @param left - 왼쪽 range
 * @param right - 오른쪽 range
 * @returns 정렬 비교값
 */
function compareRanges(left: LspRange | null, right: LspRange | null): number {
  return comparePositions(left?.start ?? null, right?.start ?? null) || comparePositions(left?.end ?? null, right?.end ?? null);
}

/**
 * comparePositions 함수.
 * LSP position 두 개를 stable ordering 기준으로 비교함.
 *
 * @param left - 왼쪽 position
 * @param right - 오른쪽 position
 * @returns 정렬 비교값
 */
function comparePositions(
  left: LspRange['start'] | null,
  right: LspRange['start'] | null,
): number {
  return compareNumbers(left?.line ?? null, right?.line ?? null) || compareNumbers(left?.character ?? null, right?.character ?? null);
}

/**
 * compareNumbers 함수.
 * nullable number 둘의 stable ordering을 비교함.
 *
 * @param left - 왼쪽 number
 * @param right - 오른쪽 number
 * @returns 정렬 비교값
 */
function compareNumbers(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left - right;
}

/**
 * compareStrings 함수.
 * nullable string 둘의 stable ordering을 비교함.
 *
 * @param left - 왼쪽 문자열
 * @param right - 오른쪽 문자열
 * @returns 정렬 비교값
 */
function compareStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left.localeCompare(right);
}

/**
 * resolveCodeLensRange 함수.
 * canonical lorebook의 `@@@ CONTENT` fragment 시작 줄에 CodeLens를 배치함.
 *
 * @param request - 현재 문서 분석 요청
 * @param analysisService - fragment 분석 캐시/매퍼 서비스
 * @param cancellationToken - 요청 취소 여부
 * @returns CONTENT fragment 시작 위치의 single-line range 또는 null
 */
function resolveCodeLensRange(
  request: FragmentAnalysisRequest,
  analysisService: FragmentAnalysisService,
  cancellationToken?: CancellationToken,
): CodeLens['range'] | null {
  const analysis = analysisService.analyzeDocument(request, cancellationToken);
  const contentFragment = analysis?.fragmentsBySection.get('CONTENT')?.[0];

  if (!contentFragment) {
    return null;
  }

  return contentFragment.mapper.toHostRangeFromOffsets(request.text, 0, 0);
}

/**
 * CodeLensProvider 클래스.
 * lorebook 문서에서 ActivationChainService 요약을 editor CodeLens로 노출함.
 */
export class CodeLensProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveActivationChainService: ActivationChainServiceResolver;

  private readonly resolveRequest: CodeLensRequestResolver;

  constructor(options: CodeLensProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveActivationChainService = options.resolveActivationChainService ?? (() => null);
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * 현재 lorebook 문서의 activation incoming/outgoing 요약을 CodeLens 목록으로 계산함.
   *
   * @param params - LSP CodeLens request params
   * @param cancellationToken - 요청 취소 여부
   * @returns summary CodeLens와 optional detail CodeLens 목록
   */
  provide(params: CodeLensParams, cancellationToken?: CancellationToken): CodeLens[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    const activationChainService = this.resolveActivationChainService(params.textDocument.uri);
    if (!request || !activationChainService) {
      return [];
    }

    const range = resolveCodeLensRange(request, this.analysisService, cancellationToken);
    const query = range ? activationChainService.queryByUri(params.textDocument.uri) : null;
    if (!range || !query) {
      return [];
    }

    const summaryTitle = createSummaryTitle(query);
    const lenses: CodeLens[] = [
      {
        data: createCodeLensAgentData(
          range,
          summaryTitle,
          params.textDocument.uri,
          'summary',
          query,
        ),
        range,
        command: createCodeLensCommand(summaryTitle, params.textDocument.uri, 'summary'),
      },
    ];

    const detailTitle = createDetailTitle(query);
    if (detailTitle) {
      lenses.push({
        data: createCodeLensAgentData(range, detailTitle, params.textDocument.uri, 'detail', query),
        range,
        command: createCodeLensCommand(detailTitle, params.textDocument.uri, 'detail'),
      });
    }

    return lenses;
  }
}
