/**
 * Main Editor 리팩토링 Phase 0 golden fixture와 public API snapshot 테스트.
 * @file packages/core/tests/editor/editor-golden-fixtures.test.ts
 */

import { describe, expect, it } from 'vitest';
import * as editorApi from '../../src/domain/editor';
import type { EditorDocumentModel, EditorFormatState } from '../../src/domain/editor';
import { EDITOR_GOLDEN_FIXTURES, type EditorGoldenFixture } from './editor-golden-fixtures';

/**
 * reassembleFixture 함수.
 * Fixture format에 맞는 public serializer를 호출함.
 *
 * @param fixture - serializer dispatch에 필요한 formatKind를 담은 golden fixture
 * @param model - parser가 생성한 현재 document model
 * @returns public serializer가 반환한 source text
 */
function reassembleFixture(fixture: EditorGoldenFixture, model: EditorDocumentModel<EditorFormatState>): string {
  switch (fixture.formatKind) {
    case 'lorebook':
      return editorApi.reassembleLorebookEditorDocument(model as EditorDocumentModel<editorApi.LorebookEditorState>, model.state as editorApi.LorebookEditorState);
    case 'regex':
      return editorApi.reassembleRegexEditorDocument(model as EditorDocumentModel<editorApi.RegexEditorState>, model.state as editorApi.RegexEditorState);
    case 'prompt':
      return editorApi.reassemblePromptEditorDocument(model as EditorDocumentModel<editorApi.PromptEditorState>, model.state as editorApi.PromptEditorState);
    case 'html':
      return editorApi.reassembleHtmlEditorDocument(model as EditorDocumentModel<editorApi.HtmlEditorState>, model.state as editorApi.HtmlEditorState);
  }
}

describe('editor Phase 0 golden fixtures', () => {
  it('defines the refactor safety corpus explicitly', () => {
    expect(EDITOR_GOLDEN_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'lorebook-basic-lf-final-newline',
      'lorebook-crlf-final-newline',
      'lorebook-duplicate-content-current-behavior',
      'lorebook-unsupported-frontmatter-current-behavior',
      'regex-basic-lf-final-newline',
      'regex-duplicate-in-current-behavior',
      'prompt-authornote-basic',
      'prompt-forbidden-section-current-behavior',
      'html-identity',
    ]);
  });

  it.each(EDITOR_GOLDEN_FIXTURES)('characterizes parser and serializer behavior for $id', (fixture) => {
    const model = editorApi.parseMainEditorDocumentModel(fixture.formatKind, fixture.source);
    const next = reassembleFixture(fixture, model);

    expect(model.formatKind).toBe(fixture.formatKind);
    expect(model.warnings.map((warning) => warning.code)).toEqual(fixture.expectedWarningCodes);
    expect(next).toBe(fixture.source);
  });

  it('preserves CRLF metadata and final newline for CRLF lorebook fixtures', () => {
    const fixture = EDITOR_GOLDEN_FIXTURES.find((entry) => entry.id === 'lorebook-crlf-final-newline');
    if (!fixture) throw new Error('Missing lorebook CRLF golden fixture.');

    const model = editorApi.parseMainEditorDocumentModel(fixture.formatKind, fixture.source);

    expect(model.lineEnding).toBe('\r\n');
    expect(model.hasFinalNewline).toBe(true);
    expect(reassembleFixture(fixture, model).endsWith('\r\n')).toBe(true);
  });

  it('documents duplicate section current behavior: last duplicate value is selected in state', () => {
    const lorebook = editorApi.parseLorebookEditorDocument(
      EDITOR_GOLDEN_FIXTURES.find((entry) => entry.id === 'lorebook-duplicate-content-current-behavior')?.source ?? '',
    );
    const regex = editorApi.parseRegexEditorDocument(
      EDITOR_GOLDEN_FIXTURES.find((entry) => entry.id === 'regex-duplicate-in-current-behavior')?.source ?? '',
    );

    expect(lorebook.warnings.map((warning) => warning.code)).toEqual(['duplicate-section']);
    expect(lorebook.state.contentText).toBe('last');
    expect(editorApi.reassembleLorebookEditorDocument(lorebook, { ...lorebook.state, contentText: 'edited' })).toBe(lorebook.source);
    expect(regex.warnings.map((warning) => warning.code)).toEqual(['duplicate-section']);
    expect(regex.state.inText).toBe('last');
    expect(editorApi.reassembleRegexEditorDocument(regex, { ...regex.state, inText: 'edited' })).toBe(regex.source);
  });

  it('keeps the current public runtime export surface stable', () => {
    expect(Object.keys(editorApi).sort()).toEqual([
      'HTML_PREVIEW_CSP',
      'MAIN_EDITOR_FORMAT_KINDS',
      'PROMPT_SECTION_NAMES',
      'PROMPT_TYPES',
      'canSerializeLorebookModel',
      'canSerializePromptModel',
      'canSerializeRegexModel',
      'cloneSimulatorProfile',
      'createDefaultMainEditorSimulatorProfile',
      'createDefaultSimulatorProfile',
      'createEmptyEditorDocumentWarnings',
      'createEmptySimulatorProfileVariables',
      'createHtmlMainEditorPreview',
      'createLineOffsetIndex',
      'createLorebookContentPreview',
      'createLorebookContentRuntimePreview',
      'createPreviewDiagnostic',
      'createPromptMainEditorPreview',
      'createRegexMainEditorPreview',
      'createSandboxedHtmlSrcdoc',
      'escapeHtmlAttribute',
      'formatCoverageSummary',
      'getPromptTypeRule',
      'isPromptType',
      'isSimulatorProfile',
      'mapContentMonacoPositionToSourcePosition',
      'mapSourceRangeToContentMonacoRange',
      'mergeSimulatorProfileVariables',
      'normalizeSimulatorProfile',
      'parseHtmlEditorDocument',
      'parseLorebookEditorDocument',
      'parseMainEditorDocumentModel',
      'parsePromptEditorDocument',
      'parseRegexEditorDocument',
      'reassembleHtmlEditorDocument',
      'reassembleLorebookEditorDocument',
      'reassemblePromptEditorDocument',
      'reassembleRegexEditorDocument',
      'resolveHtmlPreviewSandboxMode',
      'scanEditorDocumentSections',
    ]);
  });
});
