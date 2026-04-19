/**
 * CBS fragment-local formatting provider.
 * @file packages/cbs-lsp/src/features/formatting.ts
 */

import { TextEdit, DocumentFormattingParams } from 'vscode-languageserver/node';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  createHostFragmentKey,
  formatCbsDocument,
  fragmentAnalysisService,
  remapFragmentLocalPatchesToHost,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  validateHostFragmentPatchEdits,
} from '../core';
import { offsetToPosition, positionToOffset } from '../utils/position';

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
 * Formatting Provider.
 * 현재 문서의 CBS fragment만 canonical formatting text로 재직렬화하고,
 * 공용 host-fragment patch validator를 통과한 edit만 host 문서 edit로 승격함.
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

    const candidateEdits = analysis.fragmentAnalyses.flatMap((fragmentAnalysis) => {
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
      this.analysisService,
      candidateEdits.map((edit) => ({
        uri: edit.uri,
        range: edit.range,
        newText: edit.newText,
      })),
      {
        resolveRequestForUri: this.resolveRequest,
        allowedFragmentKeysByUri: new Map([
          [
            request.uri,
            new Set(analysis.fragmentAnalyses.map((fragmentAnalysis) => createHostFragmentKey(fragmentAnalysis))),
          ],
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
}
