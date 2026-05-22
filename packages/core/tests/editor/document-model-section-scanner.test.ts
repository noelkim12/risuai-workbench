import { describe, expect, it } from 'vitest';
import {
  createEmptyEditorDocumentWarnings,
  createLineOffsetIndex,
  MAIN_EDITOR_FORMAT_KINDS,
  parseMainEditorDocumentModel,
  scanEditorDocumentSections,
  type EditorDocumentWarning,
  type MainEditorFormatKind,
  type SourceRange,
} from '../../src/domain/editor';

describe('editor document model public contracts', () => {
  it('lists the four main editor format kinds in stable UI order', () => {
    expect(MAIN_EDITOR_FORMAT_KINDS).toEqual(['lorebook', 'regex', 'prompt', 'html']);
  });

  it('keeps source ranges as half-open UTF-16 offsets', () => {
    const range: SourceRange = { startOffset: 3, endOffset: 8 };
    expect(range.endOffset - range.startOffset).toBe(5);
  });

  it('creates warning buckets without sharing mutable arrays', () => {
    const first = createEmptyEditorDocumentWarnings();
    const second = createEmptyEditorDocumentWarnings();
    const warning: EditorDocumentWarning = {
      code: 'missing-section',
      severity: 'warning',
      message: 'Missing section.',
      range: { startOffset: 0, endOffset: 0 },
    };

    first.push(warning);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('allows format kind variables without widening to string', () => {
    const formatKind: MainEditorFormatKind = 'lorebook';
    expect(formatKind).toBe('lorebook');
  });
});

describe('editor section scanner', () => {
  it('maps offsets to line and character positions', () => {
    const index = createLineOffsetIndex('alpha\nbeta\r\ngamma');

    expect(index.positionAt(0)).toEqual({ line: 0, character: 0, offset: 0 });
    expect(index.positionAt(6)).toEqual({ line: 1, character: 0, offset: 6 });
    expect(index.positionAt(12)).toEqual({ line: 2, character: 0, offset: 12 });
    expect(index.offsetAt({ line: 2, character: 2 })).toBe(14);
  });

  it('scans frontmatter and ordered section blocks with exact ranges', () => {
    const source = ['---', 'name: Entry', 'mode: normal', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'Hello', ''].join('\n');
    const scanned = scanEditorDocumentSections(source);

    expect(scanned.lineEnding).toBe('\n');
    expect(scanned.hasFinalNewline).toBe(true);
    expect(scanned.frontmatter?.fields.map((field) => [field.key, field.value])).toEqual([
      ['name', 'Entry'],
      ['mode', 'normal'],
    ]);
    expect(scanned.sections.map((section) => section.name)).toEqual(['KEYS', 'CONTENT']);
    expect(scanned.sections.find((section) => section.name === 'KEYS')?.normalizedContent).toBe('alpha');
    expect(scanned.sections.find((section) => section.name === 'CONTENT')?.normalizedContent).toBe('Hello');
  });

  it('keeps recovery warnings for duplicate and unsupported sections', () => {
    const source = ['---', 'name: Entry', '---', '@@@ KEYS', 'alpha', '@@@ KEYS', 'beta', '@@@ UNKNOWN', 'x', '@@@ CONTENT', 'Body'].join('\n');
    const scanned = scanEditorDocumentSections(source, {
      knownSections: ['KEYS', 'SECONDARY_KEYS', 'CONTENT'],
    });

    expect(scanned.sections.map((section) => section.name)).toEqual(['KEYS', 'KEYS', 'UNKNOWN', 'CONTENT']);
    expect(scanned.warnings.map((warning) => warning.code)).toEqual(['duplicate-section', 'unsupported-section']);
    expect(scanned.warnings.map((warning) => warning.sectionName)).toEqual(['KEYS', 'UNKNOWN']);
  });
});

describe('main editor document model dispatcher', () => {
  it('dispatches by format kind', () => {
    expect(parseMainEditorDocumentModel('html', '<div />').formatKind).toBe('html');
    expect(parseMainEditorDocumentModel('lorebook', '---\nname: E\n---\n@@@ KEYS\na\n@@@ CONTENT\nb').formatKind).toBe('lorebook');
  });
});
