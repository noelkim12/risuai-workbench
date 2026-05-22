/**
 * Main Editor 문서의 YAML frontmatter delimiter와 field range를 파싱하는 유틸.
 * @file packages/core/src/domain/editor/shared/frontmatter/parse-frontmatter.ts
 */

import type { EditorDocumentWarning } from '../diagnostics/editor-warning';
import type { EditorFrontmatterBlock, EditorFrontmatterField } from './types';

/**
 * parseEditorFrontmatter 함수.
 * 문서 맨 앞의 YAML frontmatter 블록과 필드 범위를 읽어 structured editor가 재조립에 쓰도록 함.
 *
 * @param source - frontmatter delimiter와 body offset을 확인할 전체 문서 원문
 * @param warnings - 누락/손상된 frontmatter 상태를 호출자 결과에 누적하기 위한 warning 배열
 * @returns 발견된 frontmatter 블록, 없거나 손상되었으면 null
 */
export function parseEditorFrontmatter(source: string, warnings: EditorDocumentWarning[]): EditorFrontmatterBlock | null {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    warnings.push({
      code: 'missing-frontmatter',
      severity: 'warning',
      message: 'Document does not start with YAML frontmatter.',
      range: { startOffset: 0, endOffset: 0 },
    });
    return null;
  }

  const match = /^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)/.exec(source);
  if (!match) {
    warnings.push({
      code: 'malformed-frontmatter',
      severity: 'error',
      message: 'YAML frontmatter starts but has no closing --- delimiter.',
      range: { startOffset: 0, endOffset: Math.min(source.length, 3) },
    });
    return null;
  }

  const range = { startOffset: 0, endOffset: match[0].length };
  const bodyStartOffset = match[0].indexOf(match[1]);
  const bodyRange = { startOffset: bodyStartOffset, endOffset: bodyStartOffset + match[1].length };
  const fields = parseFrontmatterFields(match[1], bodyRange.startOffset, warnings);
  return {
    exists: true,
    range,
    bodyRange,
    raw: match[1],
    fields,
    unknownFields: [],
  };
}

/**
 * parseFrontmatterFields 함수.
 * YAML frontmatter의 단순 `key: value` 라인을 필드와 source range로 변환함.
 *
 * @param rawFrontmatter - delimiter를 제외하고 실제 field line만 포함한 frontmatter 본문
 * @param bodyStartOffset - field range를 문서 전체 offset으로 환산하기 위한 frontmatter 본문 시작 위치
 * @param warnings - colon 누락 같은 line-level 문제를 호출자 결과에 누적하기 위한 warning 배열
 * @returns 파싱된 frontmatter field 목록
 */
function parseFrontmatterFields(
  rawFrontmatter: string,
  bodyStartOffset: number,
  warnings: EditorDocumentWarning[],
): EditorFrontmatterField[] {
  const fields: EditorFrontmatterField[] = [];
  let relativeOffset = 0;
  for (const rawLine of rawFrontmatter.split(/(?<=\n)/)) {
    const lineWithoutBreak = rawLine.replace(/\r?\n$/, '');
    if (lineWithoutBreak.trim().length === 0) {
      relativeOffset += rawLine.length;
      continue;
    }
    const separatorIndex = lineWithoutBreak.indexOf(':');
    const lineStart = bodyStartOffset + relativeOffset;
    const lineEnd = lineStart + lineWithoutBreak.length;
    if (separatorIndex === -1) {
      warnings.push({
        code: 'malformed-frontmatter',
        severity: 'warning',
        message: `Frontmatter line is missing a colon: ${lineWithoutBreak}`,
        range: { startOffset: lineStart, endOffset: lineEnd },
      });
      relativeOffset += rawLine.length;
      continue;
    }
    const keyStart = lineStart;
    const keyEnd = lineStart + separatorIndex;
    const valueStart = lineStart + separatorIndex + 1 + countLeadingSpaces(lineWithoutBreak.slice(separatorIndex + 1));
    fields.push({
      key: lineWithoutBreak.slice(0, separatorIndex).trim(),
      value: lineWithoutBreak.slice(separatorIndex + 1).trimStart(),
      rawLine: lineWithoutBreak,
      range: { startOffset: lineStart, endOffset: lineEnd },
      keyRange: { startOffset: keyStart, endOffset: keyEnd },
      valueRange: { startOffset: valueStart, endOffset: lineEnd },
    });
    relativeOffset += rawLine.length;
  }
  return fields;
}

/**
 * countLeadingSpaces 함수.
 * frontmatter value 앞의 공백 수를 세어 valueRange 시작 offset을 정확히 맞춤.
 *
 * @param value - colon 뒤쪽에서 trim 전 공백을 확인할 문자열
 * @returns 문자열 앞쪽에 연속으로 있는 공백 개수
 */
function countLeadingSpaces(value: string): number {
  return value.length - value.trimStart().length;
}
