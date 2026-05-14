/**
 * Main Editor section header 목록을 range가 포함된 section block으로 변환하는 유틸.
 * @file packages/core/src/domain/editor/shared/sections/build-sections.ts
 */

import type { SourceRange } from '../source-position/types';
import type { EditorSectionBlock, EditorSectionHeaderMatch } from './types';

/**
 * buildSections 함수.
 * 수집된 header 사이의 원문 범위를 EditorSectionBlock 목록으로 변환함.
 *
 * @param source - section content와 marker range를 잘라낼 전체 문서 원문
 * @param headers - section 경계를 결정하기 위해 순서대로 정렬된 header 목록
 * @returns content range와 원문 보존 정보를 담은 section block 목록
 */
export function buildSections(source: string, headers: readonly EditorSectionHeaderMatch[]): EditorSectionBlock[] {
  return headers.map((header, index) => {
    const nextStart = headers[index + 1]?.markerStart ?? source.length;
    const { content, trailingNewline, range } = stripStructuralTrailingNewline(source, {
      startOffset: header.markerEnd,
      endOffset: nextStart,
    });
    return {
      name: header.name,
      markerRange: { startOffset: header.markerStart, endOffset: header.markerEnd },
      contentRange: range,
      rawContent: source.slice(header.markerEnd, nextStart),
      normalizedContent: content,
      structuralTrailingNewline: trailingNewline,
    };
  });
}

/**
 * stripStructuralTrailingNewline 함수.
 * section content 끝의 구조적 개행만 분리해 normalized content와 재조립용 개행 정보를 만든다.
 *
 * @param source - trailing newline을 실제 문자 기준으로 확인할 전체 문서 원문
 * @param range - 현재 section content로 간주되는 source 범위
 * @returns normalized content, 분리된 trailing newline, 보정된 content range
 */
function stripStructuralTrailingNewline(
  source: string,
  range: SourceRange,
): { content: string; trailingNewline: '' | '\n' | '\r\n'; range: SourceRange } {
  if (range.endOffset - range.startOffset >= 2 && source.slice(range.endOffset - 2, range.endOffset) === '\r\n') {
    return {
      content: source.slice(range.startOffset, range.endOffset - 2),
      trailingNewline: '\r\n',
      range: { startOffset: range.startOffset, endOffset: range.endOffset - 2 },
    };
  }
  if (range.endOffset > range.startOffset && source[range.endOffset - 1] === '\n') {
    return {
      content: source.slice(range.startOffset, range.endOffset - 1),
      trailingNewline: '\n',
      range: { startOffset: range.startOffset, endOffset: range.endOffset - 1 },
    };
  }
  return { content: source.slice(range.startOffset, range.endOffset), trailingNewline: '', range };
}
