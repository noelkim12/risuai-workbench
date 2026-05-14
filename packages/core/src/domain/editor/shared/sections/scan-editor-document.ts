/**
 * Main Editor 문서의 frontmatter와 section block scan을 조합하는 orchestrator.
 * @file packages/core/src/domain/editor/shared/sections/scan-editor-document.ts
 */

import type { EditorDocumentWarning } from '../diagnostics/editor-warning';
import type { EditorFrontmatterBlock } from '../frontmatter/types';
import type { EditorSectionBlock } from './types';
import { parseEditorFrontmatter } from '../frontmatter/parse-frontmatter';
import { buildSections } from './build-sections';
import { collectSectionHeaders } from './collect-section-headers';

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
  const frontmatter = parseEditorFrontmatter(source, warnings);
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
