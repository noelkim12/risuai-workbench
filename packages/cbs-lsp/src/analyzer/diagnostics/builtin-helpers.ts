/**
 * diagnostics builtin/AST 공용 헬퍼 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/builtin-helpers.ts
 */

import {
  CbsLspTextHelper,
} from '../../helpers/text-helper';
import {
  isDocOnlyBuiltin,
  type CBSBuiltinFunction,
  type CBSNode,
  type Range,
} from 'risu-workbench-core';

/**
 * normalizeBuiltinLookupKey 함수.
 * builtin 이름 비교용으로 공백/구분자 차이를 제거한 lookup key를 생성함.
 *
 * @param value - 정규화할 builtin 이름
 * @returns 비교 가능한 소문자 lookup key
 */
export function normalizeBuiltinLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * formatExpectedArgumentCount 함수.
 * builtin argument metadata를 editor-facing 개수 설명 문자열로 변환함.
 *
 * @param arguments_ - builtin argument metadata 목록
 * @returns 사람이 읽을 수 있는 기대 인자 개수 설명
 */
export function formatExpectedArgumentCount(
  arguments_: readonly CBSBuiltinFunction['arguments'][number][],
): string {
  const requiredCount = arguments_.filter((argument) => argument.required).length;
  const allowsVariadic = arguments_.some((argument) => argument.variadic);

  if (allowsVariadic) {
    return requiredCount <= 1 ? 'at least 1 argument' : `at least ${requiredCount} arguments`;
  }

  if (requiredCount === arguments_.length) {
    return requiredCount === 1 ? '1 argument' : `${requiredCount} arguments`;
  }

  return `between ${requiredCount} and ${arguments_.length} arguments`;
}

/**
 * formatBuiltinDiagnosticTarget 함수.
 * builtin metadata를 diagnostic message에 들어갈 human-readable 대상 설명으로 변환함.
 *
 * @param builtin - 설명할 CBS builtin metadata
 * @returns 문서용/실행 가능 builtin을 구분한 대상 설명 문자열
 */
export function formatBuiltinDiagnosticTarget(builtin: CBSBuiltinFunction): string {
  if (isDocOnlyBuiltin(builtin)) {
    return builtin.isBlock
      ? `Documentation-only CBS block syntax ${JSON.stringify(builtin.name)}`
      : `Documentation-only CBS syntax entry ${JSON.stringify(builtin.name)}`;
  }

  return builtin.isBlock
    ? `Callable CBS block builtin ${JSON.stringify(builtin.name)}`
    : `Callable CBS builtin ${JSON.stringify(builtin.name)}`;
}

/**
 * hasMeaningfulNodes 함수.
 * comment/whitespace만 남은 node 배열인지 검사해 구조 진단의 빈 본문 판정을 돕음.
 *
 * @param nodes - 검사할 CBS node 배열
 * @param sourceText - plain text trim 판정에 쓸 선택적 원문
 * @returns 의미 있는 콘텐츠가 하나라도 있으면 true
 */
export function hasMeaningfulNodes(
  nodes: readonly CBSNode[] | undefined,
  sourceText?: string,
): boolean {
  if (!nodes || nodes.length === 0) {
    return false;
  }

  return nodes.some((node) => {
    if (node.type === 'Comment') {
      return false;
    }

    if (node.type === 'PlainText') {
      if (sourceText) {
        return sliceRange(sourceText, node.range).trim().length > 0;
      }

      return node.value.trim().length > 0;
    }

    return true;
  });
}

/**
 * findShorterAlias 함수.
 * 현재 사용한 builtin 이름보다 더 짧은 canonical alias가 있으면 가장 짧은 후보를 반환함.
 *
 * @param usedName - 현재 문서에서 사용한 이름
 * @param builtin - alias metadata를 가진 builtin
 * @returns 더 짧은 alias 이름 또는 null
 */
export function findShorterAlias(
  usedName: string,
  builtin: CBSBuiltinFunction,
): string | null {
  const normalizedUsedName = normalizeBuiltinLookupKey(usedName);
  const candidates = [builtin.name, ...builtin.aliases]
    .filter((candidate) => normalizeBuiltinLookupKey(candidate) !== normalizedUsedName)
    .filter((candidate) => candidate.length < usedName.length)
    .sort((left, right) => left.length - right.length);

  return candidates[0] ?? null;
}

/**
 * sliceRange 함수.
 * sourceText에서 LSP range가 가리키는 부분 문자열을 잘라냄.
 *
 * @param sourceText - 원문 텍스트
 * @param range - 잘라낼 범위
 * @returns 해당 range의 부분 문자열
 */
export function sliceRange(sourceText: string, range: Range): string {
  return CbsLspTextHelper.extractRangeText(sourceText, range);
}
