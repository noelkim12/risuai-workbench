/**
 * Main Editor YAML frontmatter scan 결과 타입.
 * @file packages/core/src/domain/editor/shared/frontmatter/types.ts
 */

import type { SourceRange } from '../source-position/types';

export interface EditorFrontmatterField {
  key: string;
  value: string;
  rawLine: string;
  range: SourceRange;
  keyRange: SourceRange;
  valueRange: SourceRange;
}

export interface EditorFrontmatterBlock {
  exists: boolean;
  range: SourceRange;
  bodyRange: SourceRange;
  raw: string;
  fields: EditorFrontmatterField[];
  unknownFields: EditorFrontmatterField[];
}
