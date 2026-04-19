/**
 * Lorebook activation CodeLens provider.
 * @file packages/cbs-lsp/src/features/codelens.ts
 */

import type {
  CancellationToken,
  CodeLens,
  CodeLensParams,
  Command,
} from 'vscode-languageserver/node';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';
import type { ActivationChainQueryResult, ActivationChainService } from '../services';

export const ACTIVATION_CHAIN_CODELENS_COMMAND = 'cbs-lsp.codelens.activationSummary';

export type CodeLensRequestResolver = (params: CodeLensParams) => FragmentAnalysisRequest | null;

export type ActivationChainServiceResolver = (uri: string) => ActivationChainService | null;

export interface CodeLensProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveActivationChainService?: ActivationChainServiceResolver;
  resolveRequest?: CodeLensRequestResolver;
}

/**
 * createCodeLensCommand 함수.
 * informational CodeLens가 렌더링될 수 있도록 no-op command payload를 만듦.
 *
 * @param title - editor에 표시할 CodeLens 문구
 * @param uri - CodeLens가 붙는 lorebook 문서 URI
 * @param kind - summary/detail 중 어떤 lens인지 구분하는 식별자
 * @returns executeCommandProvider가 받는 안정적인 command payload
 */
function createCodeLensCommand(
  title: string,
  uri: string,
  kind: 'detail' | 'summary',
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

    const lenses: CodeLens[] = [
      {
        range,
        command: createCodeLensCommand(createSummaryTitle(query), params.textDocument.uri, 'summary'),
      },
    ];

    const detailTitle = createDetailTitle(query);
    if (detailTitle) {
      lenses.push({
        range,
        command: createCodeLensCommand(detailTitle, params.textDocument.uri, 'detail'),
      });
    }

    return lenses;
  }
}
