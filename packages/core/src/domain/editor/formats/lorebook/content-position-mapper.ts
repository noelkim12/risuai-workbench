/**
 * Main Editor CONTENT 섹션과 원본 문서 좌표를 연결하는 위치 매핑 유틸 모음.
 * @file packages/core/src/domain/editor/formats/lorebook/content-position-mapper.ts
 */

import type { EditorDocumentModel, SourcePosition, SourceRange } from '../../document-model/types';
import { createLineOffsetIndex } from '../../shared/source-position/line-offset-index';

export interface ContentMonacoPosition {
  lineNumber: number;
  column: number;
}

export interface ContentMonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * mapContentMonacoPositionToSourcePosition 함수.
 * CONTENT Monaco 좌표를 원문 TextDocument source position으로 변환함.
 *
 * @param model - section range와 원문을 함께 가진 editor document model
 * @param sectionName - CONTENT 섹션만 매핑하기 위해 확인할 section 이름
 * @param position - 사용자가 Monaco editor에서 선택한 one-based position
 * @returns zero-based source position, 매핑할 수 없으면 null
 */
export function mapContentMonacoPositionToSourcePosition(
  model: EditorDocumentModel,
  sectionName: string,
  position: ContentMonacoPosition,
): SourcePosition | null {
  const section = findMappableSection(model, sectionName);
  if (!section) return null;

  const contentOffset = offsetInSection(section.normalizedContent, position);
  const sourceOffset = Math.min(section.contentRange.endOffset, section.contentRange.startOffset + contentOffset);
  return createLineOffsetIndex(model.source).positionAt(sourceOffset);
}

/**
 * mapSourceRangeToContentMonacoRange 함수.
 * 원문 offset range를 CONTENT Monaco marker range로 변환함.
 *
 * @param model - section range와 원문을 함께 가진 editor document model
 * @param sectionName - CONTENT 섹션만 매핑하기 위해 확인할 section 이름
 * @param range - marker로 표시할 zero-based source offset range
 * @returns one-based Monaco range, 매핑할 수 없으면 null
 */
export function mapSourceRangeToContentMonacoRange(
  model: EditorDocumentModel,
  sectionName: string,
  range: SourceRange,
): ContentMonacoRange | null {
  const section = findMappableSection(model, sectionName);
  if (!section) return null;
  if (range.endOffset < section.contentRange.startOffset || range.startOffset > section.contentRange.endOffset) return null;

  const start = positionInSection(section.normalizedContent, Math.max(0, range.startOffset - section.contentRange.startOffset));
  const end = positionInSection(section.normalizedContent, Math.max(0, range.endOffset - section.contentRange.startOffset));
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

/**
 * findMappableSection 함수.
 * 현재 위치 매핑을 지원하는 lorebook CONTENT 섹션을 찾음.
 *
 * @param model - format kind와 section 목록을 확인할 editor document model
 * @param sectionName - CONTENT 섹션 여부를 검증할 section 이름
 * @returns 매핑 가능한 CONTENT section, 지원하지 않으면 null
 */
function findMappableSection(model: EditorDocumentModel, sectionName: string) {
  if (model.formatKind !== 'lorebook' || sectionName !== 'CONTENT') return null;
  return model.sections.find((section) => section.name === sectionName) ?? null;
}

/**
 * offsetInSection 함수.
 * CONTENT 내부 Monaco position을 섹션 상대 offset으로 바꿈.
 *
 * @param content - 줄 길이를 계산할 정규화된 CONTENT 문자열
 * @param position - 섹션 내부에서 변환할 one-based Monaco position
 * @returns CONTENT 문자열 안에서의 zero-based 상대 offset
 */
function offsetInSection(content: string, position: ContentMonacoPosition): number {
  const lines = content.split('\n');
  const lineIndex = Math.max(0, Math.min(position.lineNumber - 1, lines.length - 1));
  const prefix = lines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
  return prefix + Math.max(0, Math.min(position.column - 1, lines[lineIndex].length));
}

/**
 * positionInSection 함수.
 * CONTENT 상대 offset을 Monaco position으로 바꿈.
 *
 * @param content - 줄/column을 계산할 정규화된 CONTENT 문자열
 * @param offset - 섹션 내부에서 위치를 찾을 zero-based 상대 offset
 * @returns CONTENT Monaco editor에서 사용할 one-based position
 */
function positionInSection(content: string, offset: number): ContentMonacoPosition {
  const clamped = Math.max(0, Math.min(offset, content.length));
  const before = content.slice(0, clamped);
  const lines = before.split('\n');
  return {
    lineNumber: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}
