/**
 * Main Editor advanced LSP coordinate mapping helpers.
 * @file packages/vscode/src/editors/mainEditor/mainEditorAdvancedLspMapping.ts
 */

import type {
  MainEditorFormatKind,
  MainEditorMonacoPositionPayload,
  MainEditorMonacoRangePayload,
  MainEditorSectionName,
  MainEditorSourcePositionPayload,
  MainEditorSourceRangePayload,
} from './mainEditorTypes';

interface SectionSpan {
  sectionName: MainEditorSectionName;
  contentStartLine: number;
  contentEndLineExclusive: number;
}

interface MapPositionInput {
  sourceText: string;
  formatKind: MainEditorFormatKind;
  sectionName: string;
  position: MainEditorMonacoPositionPayload;
}

interface MapRangeInput {
  sourceText: string;
  formatKind: MainEditorFormatKind;
  sectionName: string;
  sourceRange: MainEditorSourceRangePayload;
}

const MARKER_PREFIX = '@@@ ';

/**
 * mapMainEditorMonacoPositionToSource 함수.
 * section-relative Monaco 좌표를 실제 TextDocument source 좌표로 변환함.
 *
 * @param input - 원문, 포맷, 섹션, Monaco 좌표
 * @returns source 좌표 또는 지원하지 않는 section이면 null
 */
export function mapMainEditorMonacoPositionToSource(input: MapPositionInput): MainEditorSourcePositionPayload | null {
  const sectionName = normalizeSectionName(input.sectionName);
  if (!sectionName || !isSectionAllowedForFormat(input.formatKind, sectionName)) return null;
  if (input.position.lineNumber < 1 || input.position.column < 1) return null;

  if (sectionName === 'FULL') {
    return { line: input.position.lineNumber - 1, character: input.position.column - 1 };
  }

  const span = collectSectionSpans(input.sourceText).find((candidate) => candidate.sectionName === sectionName);
  if (!span) return null;

  const line = span.contentStartLine + input.position.lineNumber - 1;
  if (line >= span.contentEndLineExclusive) return null;

  return { line, character: input.position.column - 1 };
}

/**
 * mapMainEditorSourceRangeToMonaco 함수.
 * 같은 문서 source range를 section-relative Monaco range로 되돌림.
 *
 * @param input - 원문, 포맷, 섹션, source range
 * @returns Monaco range 또는 해당 section 밖이면 null
 */
export function mapMainEditorSourceRangeToMonaco(input: MapRangeInput): MainEditorMonacoRangePayload | null {
  const sectionName = normalizeSectionName(input.sectionName);
  if (!sectionName || !isSectionAllowedForFormat(input.formatKind, sectionName)) return null;

  if (sectionName === 'FULL') {
    return {
      startLineNumber: input.sourceRange.start.line + 1,
      startColumn: input.sourceRange.start.character + 1,
      endLineNumber: input.sourceRange.end.line + 1,
      endColumn: input.sourceRange.end.character + 1,
    };
  }

  const span = collectSectionSpans(input.sourceText).find((candidate) => candidate.sectionName === sectionName);
  if (!span) return null;
  if (input.sourceRange.start.line < span.contentStartLine || input.sourceRange.end.line >= span.contentEndLineExclusive) return null;

  return {
    startLineNumber: input.sourceRange.start.line - span.contentStartLine + 1,
    startColumn: input.sourceRange.start.character + 1,
    endLineNumber: input.sourceRange.end.line - span.contentStartLine + 1,
    endColumn: input.sourceRange.end.character + 1,
  };
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/u);
}

function normalizeSectionName(rawName: string): MainEditorSectionName | null {
  const name = rawName.trim().toUpperCase();
  if (name === 'CONTENT' || name === 'KEYS' || name === 'SECONDARY_KEYS' || name === 'IN' || name === 'OUT' || name === 'TEXT' || name === 'INNER_FORMAT' || name === 'DEFAULT_TEXT' || name === 'FULL') {
    return name;
  }
  return null;
}

function collectSectionSpans(sourceText: string): SectionSpan[] {
  const lines = splitLines(sourceText);
  const spans: SectionSpan[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(MARKER_PREFIX)) continue;

    const sectionName = normalizeSectionName(line.slice(MARKER_PREFIX.length));
    if (!sectionName) continue;

    const previous = spans.at(-1);
    if (previous) previous.contentEndLineExclusive = index;

    spans.push({ sectionName, contentStartLine: index + 1, contentEndLineExclusive: lines.length });
  }

  return spans;
}

function isSectionAllowedForFormat(formatKind: MainEditorFormatKind, sectionName: MainEditorSectionName): boolean {
  if (formatKind === 'lorebook') return sectionName === 'CONTENT';
  if (formatKind === 'regex') return sectionName === 'IN' || sectionName === 'OUT';
  if (formatKind === 'prompt') return sectionName === 'TEXT' || sectionName === 'INNER_FORMAT' || sectionName === 'DEFAULT_TEXT';
  return sectionName === 'FULL';
}
