/**
 * Minimal deterministic diff builder for regex replacement previews.
 * @file packages/core/src/simulator/regex/replacement-diff.ts
 */
import type { RegexReplacementDiffChunkDto, RegexReplacementDiffOperation } from './types';

/**
 * createSimpleReplacementDiff 함수.
 * Common prefix/suffix만 이용해 deterministic equal/delete/insert chunks를 만듦.
 *
 * @param before - replacement 적용 전 원문
 * @param after - replacement 적용 후 결과
 * @returns 직렬화 가능한 minimal diff chunks
 */
export function createSimpleReplacementDiff(before: string, after: string): RegexReplacementDiffChunkDto[] {
  if (before === after) {
    return [createChunk('equal', before)];
  }

  const prefixLength = countCommonPrefix(before, after);
  const suffixLength = countCommonSuffix(before, after, prefixLength);
  const chunks: RegexReplacementDiffChunkDto[] = [];
  const prefix = before.slice(0, prefixLength);
  const beforeMiddle = before.slice(prefixLength, before.length - suffixLength);
  const afterMiddle = after.slice(prefixLength, after.length - suffixLength);
  const suffix = before.slice(before.length - suffixLength);

  pushChunk(chunks, 'equal', prefix);
  pushChunk(chunks, 'delete', beforeMiddle);
  pushChunk(chunks, 'insert', afterMiddle);
  pushChunk(chunks, 'equal', suffix);

  return chunks;
}

/**
 * countCommonPrefix 함수.
 * 두 문자열의 동일 prefix 길이를 계산함.
 *
 * @param before - 비교할 첫 번째 문자열
 * @param after - 비교할 두 번째 문자열
 * @returns 동일 prefix 길이
 */
function countCommonPrefix(before: string, after: string): number {
  const maxLength = Math.min(before.length, after.length);
  let index = 0;

  while (index < maxLength && before[index] === after[index]) {
    index += 1;
  }

  return index;
}

/**
 * countCommonSuffix 함수.
 * prefix 영역을 침범하지 않는 동일 suffix 길이를 계산함.
 *
 * @param before - 비교할 첫 번째 문자열
 * @param after - 비교할 두 번째 문자열
 * @param prefixLength - 이미 동일한 prefix 길이
 * @returns 동일 suffix 길이
 */
function countCommonSuffix(before: string, after: string, prefixLength: number): number {
  let suffixLength = 0;
  const maxLength = Math.min(before.length, after.length) - prefixLength;

  while (
    suffixLength < maxLength &&
    before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  return suffixLength;
}

/**
 * pushChunk 함수.
 * 빈 chunk는 생략하고 필요한 diff chunk만 추가함.
 *
 * @param chunks - 누적 중인 diff chunk 목록
 * @param operation - 추가할 chunk operation
 * @param text - chunk text
 */
function pushChunk(chunks: RegexReplacementDiffChunkDto[], operation: RegexReplacementDiffOperation, text: string): void {
  if (text.length === 0) {
    return;
  }

  chunks.push(createChunk(operation, text));
}

/**
 * createChunk 함수.
 * operation과 kind를 같은 값으로 고정한 DTO를 만듦.
 *
 * @param operation - diff operation 값
 * @param text - chunk text
 * @returns diff chunk DTO
 */
function createChunk(operation: RegexReplacementDiffOperation, text: string): RegexReplacementDiffChunkDto {
  return {
    operation,
    kind: operation,
    text,
  };
}
