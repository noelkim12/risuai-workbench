/**
 * Main Editor 문서 본문에서 `@@@ SECTION` marker를 수집하는 유틸.
 * @file packages/core/src/domain/editor/shared/sections/collect-section-headers.ts
 */

import type { EditorSectionHeaderMatch } from './types';

/**
 * collectSectionHeaders 함수.
 * 문서 본문에서 `@@@ SECTION` marker의 이름과 offset을 순서대로 수집함.
 *
 * @param source - section marker를 검색할 전체 문서 원문
 * @param bodyStart - frontmatter 영역을 제외하고 section 검색을 시작할 기준 offset
 * @returns 발견된 section header metadata 목록
 */
export function collectSectionHeaders(source: string, bodyStart: number): EditorSectionHeaderMatch[] {
  const sectionRegex = /^@@@ ([A-Z_]+)(?:\r?\n|$)/gm;
  const headers: EditorSectionHeaderMatch[] = [];
  let match: RegExpExecArray | null = sectionRegex.exec(source);
  while (match !== null) {
    if (match.index >= bodyStart) {
      headers.push({
        name: match[1],
        markerStart: match.index,
        markerEnd: match.index + match[0].length,
      });
    }
    match = sectionRegex.exec(source);
  }
  return headers;
}
