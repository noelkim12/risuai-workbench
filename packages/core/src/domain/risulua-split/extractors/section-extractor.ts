import { buildSafeRelativePath } from '../shared/path-policy';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { sliceSourceOffsets } from '../shared/source-slice';
import type { LuaSourceRange, SourceProfileSectionMarker } from '../shared/types';

export interface RisuLuaExtractedSection {
  sectionLabel: string;
  path: string;
  sourceRange: LuaSourceRange;
  content: string;
  preserveOrderIndex: number;
}

export interface ExtractRisuLuaSectionsResult {
  sections: RisuLuaExtractedSection[];
}

export function extractRisuLuaSections(source: string): ExtractRisuLuaSectionsResult {
  const profile = detectRisuLuaSourceProfile(source);
  const sections = buildSections(source, profile.sectionMarkers);
  return { sections };
}

function buildSections(source: string, markers: SourceProfileSectionMarker[]): RisuLuaExtractedSection[] {
  const lineStarts = buildLineStarts(source);
  const sections: RisuLuaExtractedSection[] = [];
  const usedPaths = new Set<string>();

  if (markers.length === 0) return sections;

  if (markers[0].startOffset > 0) {
    sections.push(buildSection({
      source,
      lineStarts,
      label: '000_prelude',
      startOffset: 0,
      endOffset: markers[0].startOffset,
      preserveOrderIndex: sections.length,
      usedPaths,
    }));
  }

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const nextMarker = markers[index + 1];
    sections.push(buildSection({
      source,
      lineStarts,
      label: marker.label,
      startOffset: marker.startOffset,
      endOffset: nextMarker?.startOffset ?? source.length,
      preserveOrderIndex: sections.length,
      usedPaths,
    }));
  }

  return sections;
}

function buildSection(input: {
  source: string;
  lineStarts: number[];
  label: string;
  startOffset: number;
  endOffset: number;
  preserveOrderIndex: number;
  usedPaths: Set<string>;
}): RisuLuaExtractedSection {
  const endOffset = Math.max(input.startOffset, input.endOffset);
  const baseName = stripLuaExtension(input.label);
  const path = buildUniqueSectionPath(baseName, input.usedPaths);
  const endLineOffset = Math.max(input.startOffset, endOffset - 1);

  return {
    sectionLabel: input.label,
    path,
    sourceRange: {
      startLine: lineAtOffset(input.startOffset, input.lineStarts),
      endLine: lineAtOffset(endLineOffset, input.lineStarts),
      startOffset: input.startOffset,
      endOffset,
    },
    content: sliceSourceOffsets(input.source, input.startOffset, endOffset),
    preserveOrderIndex: input.preserveOrderIndex,
  };
}

function buildUniqueSectionPath(label: string, usedPaths: Set<string>): string {
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? '' : `_${attempt + 1}`;
    const fileName = buildSafeRelativePath(`${label}${suffix}`, 'risulua');
    if (fileName === null) throw new Error(`Unable to build safe section filename for label: ${label}`);
    const relativePath = `lua/sections/${fileName}`;
    if (!usedPaths.has(relativePath)) {
      usedPaths.add(relativePath);
      return relativePath;
    }
    attempt += 1;
  }
  throw new Error(`Unable to build unique section filename for label: ${label}`);
}

function stripLuaExtension(label: string): string {
  return label.trim().replace(/\.(?:risulua|lua)$/i, '');
}
