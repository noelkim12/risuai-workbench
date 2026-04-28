/**
 * CBS fragment-local formatting provider.
 * 현재 contract는 routed fragment용 canonical serializer + safe no-op 경계이며,
 * range formatting도 선택 영역 자체가 아니라 owning fragment canonicalization만 허용한다.
 * pretty formatter나 option-aware layout engine은 아직 제공하지 않음.
 * @file packages/cbs-lsp/src/features/formatting.ts
 */

import {
  TextEdit,
  DocumentFormattingParams,
  type DocumentRangeFormattingParams,
} from 'vscode-languageserver/node';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  createHostFragmentKey,
  findOwningHostFragmentAnalysis,
  formatCbsDocument,
  fragmentAnalysisService,
  remapFragmentLocalPatchesToHost,
  type AgentMetadataAvailabilityContract,
  type FragmentDocumentAnalysis,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  validateHostFragmentPatchEdits,
} from '../../core';
import { offsetToPosition, positionToOffset } from '../../utils/position';

export type FormattingRequestResolver = (uri: string) => FragmentAnalysisRequest | null;

export interface FormattingProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: FormattingRequestResolver;
}

export const FORMATTING_PROVIDER_AVAILABILITY = ACTIVE_FEATURE_AVAILABILITY.formatting;

/**
 * createWholeFragmentRange 함수.
 * fragment 전체를 덮는 local range를 생성함.
 *
 * @param fragmentText - range를 만들 fragment 원문
 * @returns fragment 전문을 덮는 local range
 */
function createWholeFragmentRange(fragmentText: string) {
  return {
    start: { line: 0, character: 0 },
    end: offsetToPosition(fragmentText, fragmentText.length),
  };
}

/**
 * isTextChangingEdit 함수.
 * host edit가 실제 텍스트 변경을 만드는지 확인함.
 *
 * @param hostText - host 문서 원문
 * @param edit - 검증할 host edit
 * @returns 기존 slice와 newText가 다른지 여부
 */
function isTextChangingEdit(hostText: string, edit: TextEdit): boolean {
  const startOffset = positionToOffset(hostText, edit.range.start);
  const endOffset = positionToOffset(hostText, edit.range.end);
  return hostText.slice(startOffset, endOffset) !== edit.newText;
}

/**
 * collectValidatedFormattingEdits 함수.
 * 지정된 fragment 집합만 canonical formatting 대상으로 삼아 host-safe edit를 계산함.
 *
 * @param request - 현재 host 문서 분석 요청
 * @param analysisService - host patch validator에 재사용할 분석 서비스
 * @param resolveRequest - host URI를 request로 되돌리는 resolver
 * @param fragmentAnalyses - formatting 대상으로 허용된 fragment 분석 목록
 * @returns host-fragment safety contract를 통과한 TextEdit 목록
 */
function collectValidatedFormattingEdits(
  request: FragmentAnalysisRequest,
  analysisService: FragmentAnalysisService,
  resolveRequest: FormattingRequestResolver,
  fragmentAnalyses: readonly FragmentDocumentAnalysis[],
): TextEdit[] {
  const candidateEdits = fragmentAnalyses.flatMap((fragmentAnalysis) => {
    const formattedText = formatCbsDocument(fragmentAnalysis.document);
    if (formattedText === fragmentAnalysis.fragment.content) {
      return [];
    }

    const remapped = remapFragmentLocalPatchesToHost(request, fragmentAnalysis, [
      {
        range: createWholeFragmentRange(fragmentAnalysis.fragment.content),
        newText: formattedText,
      },
    ]);

    return remapped.ok ? remapped.edits : [];
  });

  if (candidateEdits.length === 0) {
    return [];
  }

  const validated = validateHostFragmentPatchEdits(
    analysisService,
    candidateEdits.map((edit) => ({
      uri: edit.uri,
      range: edit.range,
      newText: edit.newText,
    })),
    {
      resolveRequestForUri: resolveRequest,
      allowedFragmentKeysByUri: new Map([
        [request.uri, new Set(fragmentAnalyses.map((fragmentAnalysis) => createHostFragmentKey(fragmentAnalysis)))],
      ]),
    },
  );

  if (!validated.ok) {
    return [];
  }

  return validated.edits
    .map((edit) => ({
      range: edit.range,
      newText: edit.newText,
    }))
    .filter((edit) => isTextChangingEdit(request.text, edit));
}

/**
 * Formatting Provider.
 * 현재 문서의 CBS fragment만 canonical formatting text로 재직렬화하고,
 * 공용 host-fragment patch validator를 통과한 edit만 host 문서 edit로 승격함.
 * malformed fragment, unrouted artifact, unsupported host edit는 모두 safe no-op으로 유지함.
 */
export class FormattingProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: FormattingRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = FORMATTING_PROVIDER_AVAILABILITY;

  constructor(options: FormattingProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * routed CBS fragment를 canonical formatting text로 바꾼 host edit를 반환함.
   *
   * @param params - editor formatting request
   * @returns host-fragment safety contract를 통과한 TextEdit 목록
   */
  provide(params: DocumentFormattingParams): TextEdit[] {
    if (!params.textDocument?.uri) {
      return [];
    }

    const request = this.resolveRequest(params.textDocument.uri);
    if (!request) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request);
    if (!analysis || analysis.fragmentAnalyses.length === 0) {
      return [];
    }

    if (analysis.recovery.hasRecoveredFragments) {
      return [];
    }

    return collectValidatedFormattingEdits(
      request,
      this.analysisService,
      this.resolveRequest,
      analysis.fragmentAnalyses,
    );
  }

  /**
   * provideRange 함수.
   * 선택 range가 정확히 하나의 CBS fragment 안에 있을 때만 owning fragment canonical edit를 반환함.
   *
   * @param params - editor range formatting request
   * @returns host-fragment safety contract를 통과한 TextEdit 목록
   */
  provideRange(params: DocumentRangeFormattingParams): TextEdit[] {
    if (!params.textDocument?.uri) {
      return [];
    }

    const request = this.resolveRequest(params.textDocument.uri);
    if (!request) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request);
    if (!analysis || analysis.fragmentAnalyses.length === 0) {
      return [];
    }

    const owningFragment = findOwningHostFragmentAnalysis(
      request.text,
      analysis.fragmentAnalyses,
      params.range,
    );
    if (!owningFragment) {
      return [];
    }

    return collectValidatedFormattingEdits(
      request,
      this.analysisService,
      this.resolveRequest,
      [owningFragment],
    );
  }
}
