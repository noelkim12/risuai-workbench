/**
 * Main Editor section scanner 내부 header와 section block 타입.
 * @file packages/core/src/domain/editor/shared/sections/types.ts
 */

import type { SourceRange } from '../source-position/types';

export interface EditorSectionHeaderMatch {
  name: string;
  markerStart: number;
  markerEnd: number;
}

export interface EditorSectionBlock {
  name: string;
  markerRange: SourceRange;
  contentRange: SourceRange;
  rawContent: string;
  normalizedContent: string;
  structuralTrailingNewline: '' | '\n' | '\r\n';
}
