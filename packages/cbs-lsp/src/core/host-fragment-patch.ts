/**
 * Host 문서에 반영할 CBS fragment patch 안전 계약.
 * @file packages/cbs-lsp/src/core/host-fragment-patch.ts
 */

import type { Range } from 'risu-workbench-core';

import { positionToOffset, offsetToPosition } from '../utils/position';
import type {
  FragmentAnalysisRequest,
  FragmentAnalysisService,
  FragmentDocumentAnalysis,
} from './fragment-analysis-service';

/**
 * createHostFragmentKey 함수.
 * fragment 하나를 host patch allowance key로 직렬화함.
 *
 * @param fragmentAnalysis - key를 만들 fragment 분석 결과
 * @returns section/index/start/end를 담은 stable key
 */
export function createHostFragmentKey(fragmentAnalysis: FragmentDocumentAnalysis): string {
  const { fragment, fragmentIndex } = fragmentAnalysis;
  return `${fragment.section}:${fragmentIndex}:${fragment.start}-${fragment.end}`;
}

export interface FragmentLocalPatchEdit {
  range: Range;
  newText: string;
}

export interface HostFragmentPatchEdit {
  uri: string;
  range: Range;
  newText: string;
  fragmentIndex: number;
  section: string;
}

export type HostFragmentPatchProblemCode =
  | 'malformed-fragment'
  | 'outside-fragment'
  | 'disallowed-fragment'
  | 'overlapping-edits'
  | 'unresolved-uri';

export interface HostFragmentPatchProblem {
  code: HostFragmentPatchProblemCode;
  uri: string;
  message: string;
  fragmentIndex?: number;
  section?: string;
}

export interface HostFragmentPatchValidationResult {
  ok: boolean;
  edits: readonly HostFragmentPatchEdit[];
  problems: readonly HostFragmentPatchProblem[];
}

export interface ValidateHostFragmentPatchOptions {
  resolveRequestForUri?: (uri: string) => FragmentAnalysisRequest | null;
  allowedFragmentKeysByUri?: ReadonlyMap<string, ReadonlySet<string>>;
}

interface ValidatedPatchEdit extends HostFragmentPatchEdit {
  requestText: string;
}

function positionsEqual(left: Range['start'], right: Range['start']): boolean {
  return left.line === right.line && left.character === right.character;
}

/**
 * isExactRangeWithinText 함수.
 * range가 text 좌표계 안에 그대로 존재하는지 round-trip으로 검증함.
 *
 * @param text - range가 속해야 하는 원문
 * @param range - 검증할 range
 * @returns 좌표 손실 없이 text 안에 존재하는지 여부
 */
function isExactRangeWithinText(text: string, range: Range): boolean {
  const startOffset = positionToOffset(text, range.start);
  const endOffset = positionToOffset(text, range.end);

  if (endOffset < startOffset) {
    return false;
  }

  return (
    positionsEqual(offsetToPosition(text, startOffset), range.start) &&
    positionsEqual(offsetToPosition(text, endOffset), range.end)
  );
}

/**
 * comparePatchEdits 함수.
 * host patch edit를 URI 우선, range 보조 기준으로 stable 정렬함.
 *
 * @param left - 비교할 왼쪽 edit
 * @param right - 비교할 오른쪽 edit
 * @returns 정렬용 비교값
 */
function comparePatchEdits(left: HostFragmentPatchEdit, right: HostFragmentPatchEdit): number {
  const uriComparison = left.uri.localeCompare(right.uri);
  if (uriComparison !== 0) {
    return uriComparison;
  }

  if (left.range.start.line !== right.range.start.line) {
    return left.range.start.line - right.range.start.line;
  }

  if (left.range.start.character !== right.range.start.character) {
    return left.range.start.character - right.range.start.character;
  }

  if (left.range.end.line !== right.range.end.line) {
    return left.range.end.line - right.range.end.line;
  }

  return left.range.end.character - right.range.end.character;
}

/**
 * findOwningFragmentAnalysis 함수.
 * host range를 완전히 감싸는 fragment 분석 결과를 찾음.
 *
 * @param requestText - host 문서 전문
 * @param fragmentAnalyses - URI에 속한 fragment 분석 목록
 * @param range - host document 기준 edit range
 * @returns edit를 소유하는 fragment 분석 결과
 */
function findOwningFragmentAnalysis(
  requestText: string,
  fragmentAnalyses: readonly FragmentDocumentAnalysis[],
  range: Range,
): FragmentDocumentAnalysis | null {
  if (!isExactRangeWithinText(requestText, range)) {
    return null;
  }

  const startOffset = positionToOffset(requestText, range.start);
  const endOffset = positionToOffset(requestText, range.end);

  return (
    fragmentAnalyses.find((fragmentAnalysis) => {
      const mapper = fragmentAnalysis.mapper;
      return mapper.containsHostOffset(startOffset) && mapper.containsHostOffset(endOffset);
    }) ?? null
  );
}

/**
 * createMalformedFragmentProblem 함수.
 * recovery가 있는 fragment를 patch 대상에서 차단하는 문제 정보를 생성함.
 *
 * @param uri - 대상 문서 URI
 * @param fragmentAnalysis - 차단된 fragment 분석 결과
 * @returns malformed-fragment 문제 정보
 */
function createMalformedFragmentProblem(
  uri: string,
  fragmentAnalysis: FragmentDocumentAnalysis,
): HostFragmentPatchProblem {
  return {
    code: 'malformed-fragment',
    uri,
    fragmentIndex: fragmentAnalysis.fragmentIndex,
    section: fragmentAnalysis.fragment.section,
    message:
      'Malformed CBS fragment patches are disabled; host edits must no-op until the fragment recovers.',
  };
}

/**
 * isRecoverySafeFragmentInsertion 함수.
 * syntax recovery가 있는 fragment에서도 허용 가능한 close-tag insertion 형태인지 확인함.
 *
 * @param fragmentAnalysis - 대상 fragment 분석 결과
 * @param edit - fragment-local edit
 * @returns fragment 끝 zero-width insertion이면 true
 */
function isRecoverySafeFragmentInsertion(
  fragmentAnalysis: FragmentDocumentAnalysis,
  edit: FragmentLocalPatchEdit,
): boolean {
  const startOffset = positionToOffset(fragmentAnalysis.fragment.content, edit.range.start);
  const endOffset = positionToOffset(fragmentAnalysis.fragment.content, edit.range.end);

  return startOffset === fragmentAnalysis.fragment.content.length && endOffset === startOffset;
}

/**
 * isRecoverySafeHostInsertion 함수.
 * syntax recovery가 있는 fragment의 host edit가 fragment 끝 insertion인지 확인함.
 *
 * @param requestText - host document 전문
 * @param fragmentAnalysis - 대상 fragment 분석 결과
 * @param range - host document 기준 edit range
 * @returns fragment 끝 zero-width insertion이면 true
 */
function isRecoverySafeHostInsertion(
  requestText: string,
  fragmentAnalysis: FragmentDocumentAnalysis,
  range: Range,
): boolean {
  const localRange = fragmentAnalysis.mapper.toLocalRange(requestText, range);
  if (!localRange) {
    return false;
  }

  return isRecoverySafeFragmentInsertion(fragmentAnalysis, {
    range: localRange,
    newText: '',
  });
}

/**
 * remapFragmentLocalPatchesToHost 함수.
 * fragment-local edit를 host document edit로 remap하면서 안전 경계를 먼저 검증함.
 *
 * @param request - host 문서 분석 요청
 * @param fragmentAnalysis - patch를 만들 fragment 분석 결과
 * @param edits - fragment-local edit 목록
 * @returns host patch edit 또는 안전성 문제 목록
 */
export function remapFragmentLocalPatchesToHost(
  request: FragmentAnalysisRequest,
  fragmentAnalysis: FragmentDocumentAnalysis,
  edits: readonly FragmentLocalPatchEdit[],
): HostFragmentPatchValidationResult {
  if (
    fragmentAnalysis.recovery.hasSyntaxRecovery &&
    !edits.every((edit) => isRecoverySafeFragmentInsertion(fragmentAnalysis, edit))
  ) {
    return {
      ok: false,
      edits: [],
      problems: [createMalformedFragmentProblem(request.uri, fragmentAnalysis)],
    };
  }

  const remappedEdits: HostFragmentPatchEdit[] = [];
  const problems: HostFragmentPatchProblem[] = [];

  for (const edit of edits) {
    if (!isExactRangeWithinText(fragmentAnalysis.fragment.content, edit.range)) {
      problems.push({
        code: 'outside-fragment',
        uri: request.uri,
        fragmentIndex: fragmentAnalysis.fragmentIndex,
        section: fragmentAnalysis.fragment.section,
        message: 'Fragment-local patch range must stay inside the owning CBS fragment.',
      });
      continue;
    }

    const hostRange = fragmentAnalysis.mapper.toHostRange(request.text, edit.range);
    if (!hostRange || !isExactRangeWithinText(request.text, hostRange)) {
      problems.push({
        code: 'outside-fragment',
        uri: request.uri,
        fragmentIndex: fragmentAnalysis.fragmentIndex,
        section: fragmentAnalysis.fragment.section,
        message: 'Host patch range must stay inside the owning CBS fragment.',
      });
      continue;
    }

    remappedEdits.push({
      uri: request.uri,
      range: hostRange,
      newText: edit.newText,
      fragmentIndex: fragmentAnalysis.fragmentIndex,
      section: fragmentAnalysis.fragment.section,
    });
  }

  if (problems.length > 0) {
    return {
      ok: false,
      edits: [],
      problems,
    };
  }

  return {
    ok: true,
    edits: remappedEdits.sort(comparePatchEdits),
    problems: [],
  };
}

/**
 * validateHostFragmentPatchEdits 함수.
 * URI별 host patch edit가 CBS fragment 안에만 머무는지와 overlap 금지를 공통 검증함.
 *
 * @param analysisService - URI별 fragment 분석을 재사용할 서비스
 * @param edits - host document 기준 patch edit 목록
 * @param options - URI 해석과 허용 fragment 범위
 * @returns 검증 통과 여부와 정렬된 edit 목록
 */
export function validateHostFragmentPatchEdits(
  analysisService: FragmentAnalysisService,
  edits: readonly Omit<HostFragmentPatchEdit, 'fragmentIndex' | 'section'>[],
  options: ValidateHostFragmentPatchOptions = {},
): HostFragmentPatchValidationResult {
  const resolveRequestForUri = options.resolveRequestForUri ?? (() => null);
  const allowedFragmentKeysByUri = options.allowedFragmentKeysByUri ?? new Map();
  const problems: HostFragmentPatchProblem[] = [];
  const validatedEdits: ValidatedPatchEdit[] = [];

  for (const edit of edits) {
    const request = resolveRequestForUri(edit.uri);
    if (!request) {
      problems.push({
        code: 'unresolved-uri',
        uri: edit.uri,
        message: 'Cannot validate host patch safety because the target document is unavailable.',
      });
      continue;
    }

    const analysis = analysisService.analyzeDocument(request);
    if (!analysis) {
      problems.push({
        code: 'unresolved-uri',
        uri: edit.uri,
        message: 'Cannot validate host patch safety because the target document has no CBS fragment analysis.',
      });
      continue;
    }

    const owningFragment = findOwningFragmentAnalysis(request.text, analysis.fragmentAnalyses, edit.range);
    if (!owningFragment) {
      problems.push({
        code: 'outside-fragment',
        uri: edit.uri,
        message: 'Host patch range must be fully contained by exactly one CBS fragment.',
      });
      continue;
    }

    if (
      owningFragment.recovery.hasSyntaxRecovery &&
      !isRecoverySafeHostInsertion(request.text, owningFragment, edit.range)
    ) {
      problems.push(createMalformedFragmentProblem(edit.uri, owningFragment));
      continue;
    }

    const allowedKeys = allowedFragmentKeysByUri.get(edit.uri) ?? null;
    const fragmentKey = createHostFragmentKey(owningFragment);
    if (allowedKeys && !allowedKeys.has(fragmentKey)) {
      problems.push({
        code: 'disallowed-fragment',
        uri: edit.uri,
        fragmentIndex: owningFragment.fragmentIndex,
        section: owningFragment.fragment.section,
        message:
          'Host patch range belongs to a CBS fragment that is outside the allowed edit window for this request.',
      });
      continue;
    }

    validatedEdits.push({
      ...edit,
      fragmentIndex: owningFragment.fragmentIndex,
      section: owningFragment.fragment.section,
      requestText: request.text,
    });
  }

  const orderedEdits = [...validatedEdits].sort(comparePatchEdits);

  for (let index = 1; index < orderedEdits.length; index += 1) {
    const previous = orderedEdits[index - 1];
    const current = orderedEdits[index];
    if (previous.uri !== current.uri) {
      continue;
    }

    const previousEndOffset = positionToOffset(previous.requestText, previous.range.end);
    const currentStartOffset = positionToOffset(current.requestText, current.range.start);
    if (currentStartOffset < previousEndOffset) {
      problems.push({
        code: 'overlapping-edits',
        uri: current.uri,
        message: 'Host patch ranges for a single URI must be non-overlapping and deterministic.',
      });
    }
  }

  if (problems.length > 0) {
    return {
      ok: false,
      edits: [],
      problems,
    };
  }

  return {
    ok: true,
    edits: orderedEdits.map(({ requestText: _requestText, ...edit }) => edit),
    problems: [],
  };
}
