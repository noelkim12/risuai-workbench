/**
 * Main Editor source offset과 source position 타입 계약.
 * @file packages/core/src/domain/editor/shared/source-position/types.ts
 */

export interface SourceRange {
  startOffset: number;
  endOffset: number;
}

export interface SourcePosition {
  line: number;
  character: number;
  offset: number;
}

export interface SourceLocatedRange extends SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}
