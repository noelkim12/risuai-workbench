/**
 * Whitespace trimming and brace escaping helpers for CBS block evaluators.
 * Pure functions with no state dependency.
 * @file packages/core/src/domain/cbs/simulator/blocks/whitespace.ts
 */

/**
 * trimLines 함수.
 * upstream legacy block whitespace trimming을 적용함.
 *
 * @param value - trimming할 문자열
 * @returns whitespace가 정리된 문자열
 */
export function trimLines(value: string): string {
  if (!value.includes('\n')) return value.trimEnd();
  return value.split('\n').map((line) => line.trimStart()).join('\n').trim();
}

/**
 * mapTrimLinesOffset 함수.
 * trimLines() 적용 전 문자열 offset을 적용 후 문자열 offset으로 변환합니다.
 *
 * @param value - trimLines() 적용 전 문자열
 * @param offset - value 기준 UTF-16 offset
 * @returns trimLines(value) 기준 UTF-16 offset
 */
export function mapTrimLinesOffset(value: string, offset: number): number {
  const clampedOffset = Math.max(0, Math.min(value.length, offset));
  if (!value.includes('\n')) {
    return Math.min(clampedOffset, value.trimEnd().length);
  }

  const retained = createTrimLinesRetainedCharacters(value);
  return retained.reduce((count, originalIndex) => count + (originalIndex < clampedOffset ? 1 : 0), 0);
}

/**
 * createTrimLinesRetainedCharacters 함수.
 * trimLines() 결과에 남는 원본 문자 index 목록을 만듭니다.
 *
 * @param value - trimLines() 적용 전 문자열
 * @returns trimLines(value)에 남는 원본 문자 index 배열
 */
function createTrimLinesRetainedCharacters(value: string): number[] {
  const retained: Array<{ originalIndex: number; value: string }> = [];
  let lineStart = 0;

  for (const line of value.split('\n')) {
    const trimStartLength = line.length - line.trimStart().length;
    for (let index = trimStartLength; index < line.length; index += 1) {
      retained.push({ originalIndex: lineStart + index, value: line[index] });
    }
    lineStart += line.length;
    if (lineStart < value.length && value[lineStart] === '\n') {
      retained.push({ originalIndex: lineStart, value: '\n' });
      lineStart += 1;
    }
  }

  while (retained.length > 0 && retained[0].value.trim() === '') retained.shift();
  while (retained.length > 0 && retained[retained.length - 1].value.trim() === '') retained.pop();
  return retained.map((entry) => entry.originalIndex);
}

/**
 * trimBlankEdgeLines 함수.
 * #when 기본 mode의 edge blank line만 제거함.
 *
 * @param value - trimming할 문자열
 * @returns 앞뒤 빈 줄이 제거된 문자열
 */
export function trimBlankEdgeLines(value: string): string {
  const lines = value.split('\n');
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.join('\n');
}

/**
 * trimOuterWhitespace 함수.
 * pure block end matcher의 p1.trim()에 해당함.
 *
 * @param value - trimming할 문자열
 * @returns 양끝 whitespace가 제거된 문자열
 */
export function trimOuterWhitespace(value: string): string {
  return value.trim();
}
