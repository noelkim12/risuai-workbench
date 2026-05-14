/**
 * Main Editor 문서의 YAML frontmatter와 `@@@` section을 공통 방식으로 스캔하는 유틸.
 * @file packages/core/src/domain/editor/section-scanner.ts
 */

import type {
  EditorDocumentWarning,
  EditorFrontmatterBlock,
  EditorFrontmatterField,
  EditorSectionBlock,
  SourceRange,
} from './document-model-types';

export interface ScanEditorDocumentSectionsOptions {
  knownSections?: readonly string[];
}

export interface ScannedEditorDocumentSections {
  source: string;
  lineEnding: '\n' | '\r\n';
  hasFinalNewline: boolean;
  frontmatter: EditorFrontmatterBlock | null;
  sections: EditorSectionBlock[];
  warnings: EditorDocumentWarning[];
}

interface HeaderMatch {
  name: string;
  markerStart: number;
  markerEnd: number;
}

/**
 * scanEditorDocumentSections 함수.
 * editor 문서 원문에서 frontmatter와 line-based `@@@ SECTION` 블록을 손실 없이 스캔함.
 *
 * @param source - 구조화 editor state로 나누기 전에 보존해야 하는 전체 문서 원문
 * @param options - 지원 section 판별과 warning 생성을 위해 필요한 스캔 옵션
 * @returns frontmatter, section range, warning을 담은 문서 스캔 결과
 */
export function scanEditorDocumentSections(
  source: string,
  options: ScanEditorDocumentSectionsOptions = {},
): ScannedEditorDocumentSections {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const hasFinalNewline = source.endsWith('\n');
  const warnings: EditorDocumentWarning[] = [];
  const frontmatter = scanFrontmatter(source, warnings);
  const bodyStart = frontmatter?.range.endOffset ?? 0;
  const headers = collectSectionHeaders(source, bodyStart);
  const sections = buildSections(source, headers);
  const knownSectionSet = new Set(options.knownSections ?? []);
  const seenSections = new Set<string>();

  for (const section of sections) {
    if (seenSections.has(section.name)) {
      warnings.push({
        code: 'duplicate-section',
        severity: 'warning',
        message: `Duplicate section "${section.name}" is preserved but ignored by structured editors.`,
        range: section.markerRange,
        sectionName: section.name,
      });
    } else if (knownSectionSet.size > 0 && !knownSectionSet.has(section.name)) {
      warnings.push({
        code: 'unsupported-section',
        severity: 'warning',
        message: `Unsupported section "${section.name}" is preserved as raw text.`,
        range: section.markerRange,
        sectionName: section.name,
      });
    }
    seenSections.add(section.name);
  }

  return { source, lineEnding, hasFinalNewline, frontmatter, sections, warnings };
}

/**
 * scanFrontmatter 함수.
 * 문서 맨 앞의 YAML frontmatter 블록과 필드 범위를 읽어 structured editor가 재조립에 쓰도록 함.
 *
 * @param source - frontmatter delimiter와 body offset을 확인할 전체 문서 원문
 * @param warnings - 누락/손상된 frontmatter 상태를 호출자 결과에 누적하기 위한 warning 배열
 * @returns 발견된 frontmatter 블록, 없거나 손상되었으면 null
 */
function scanFrontmatter(source: string, warnings: EditorDocumentWarning[]): EditorFrontmatterBlock | null {
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
 * collectSectionHeaders 함수.
 * 문서 본문에서 `@@@ SECTION` marker의 이름과 offset을 순서대로 수집함.
 *
 * @param source - section marker를 검색할 전체 문서 원문
 * @param bodyStart - frontmatter 영역을 제외하고 section 검색을 시작할 기준 offset
 * @returns 발견된 section header metadata 목록
 */
function collectSectionHeaders(source: string, bodyStart: number): HeaderMatch[] {
  const sectionRegex = /^@@@ ([A-Z_]+)(?:\r?\n|$)/gm;
  const headers: HeaderMatch[] = [];
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

/**
 * buildSections 함수.
 * 수집된 header 사이의 원문 범위를 EditorSectionBlock 목록으로 변환함.
 *
 * @param source - section content와 marker range를 잘라낼 전체 문서 원문
 * @param headers - section 경계를 결정하기 위해 순서대로 정렬된 header 목록
 * @returns content range와 원문 보존 정보를 담은 section block 목록
 */
function buildSections(source: string, headers: readonly HeaderMatch[]): EditorSectionBlock[] {
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
