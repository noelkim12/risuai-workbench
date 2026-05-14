/**
 * Phase 6 lorebook MVP hardening acceptance tests.
 * @file packages/core/tests/editor/lorebook-mvp-hardening.test.ts
 */

import { describe, expect, it } from 'vitest';
import { parseLorebookEditorDocument, reassembleLorebookEditorDocument } from '../../src/domain/editor';
import { LOREBOOK_MVP_HARDENING_FIXTURES } from './lorebook-mvp-hardening-fixtures';

function getFixture(id: string) {
  const fixture = LOREBOOK_MVP_HARDENING_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing lorebook MVP hardening fixture: ${id}`);
  return fixture;
}

describe('lorebook MVP hardening fixtures', () => {
  it('defines the Phase 6 acceptance corpus explicitly', () => {
    expect(LOREBOOK_MVP_HARDENING_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'day-editing-entry',
      'crlf-entry',
      'folder-entry',
      'malformed-preserve-raw',
      'large-entry-smoke',
    ]);
  });

  it.each(LOREBOOK_MVP_HARDENING_FIXTURES)('round-trips fixture $id without unexpected warnings', (fixture) => {
    const model = parseLorebookEditorDocument(fixture.source);
    const next = reassembleLorebookEditorDocument(model, model.state);

    expect(model.warnings.map((warning) => warning.code)).toEqual(fixture.expectedWarningCodes);
    expect(next).toBe(fixture.source);
  });

  it('preserves CRLF and final newline after structured edits', () => {
    const fixture = getFixture('crlf-entry');
    const model = parseLorebookEditorDocument(fixture.source);
    const next = reassembleLorebookEditorDocument(model, {
      ...model.state,
      keysText: 'windows\r\nnewline',
      contentText: 'Edited CRLF body.',
    });

    expect(next).toContain('\r\n@@@ KEYS\r\nwindows\r\nnewline\r\n@@@ CONTENT\r\nEdited CRLF body.\r\n');
    expect(next.endsWith('\r\n')).toBe(true);
  });

  it('keeps large lorebook CONTENT editable without changing section order', () => {
    const fixture = getFixture('large-entry-smoke');
    const model = parseLorebookEditorDocument(fixture.source);
    const next = reassembleLorebookEditorDocument(model, {
      ...model.state,
      contentText: `${model.state.contentText}\nAppended acceptance line.`,
    });

    expect(model.state.contentText.split('\n')).toHaveLength(1200);
    expect(next.indexOf('@@@ KEYS')).toBeLessThan(next.indexOf('@@@ SECONDARY_KEYS'));
    expect(next.indexOf('@@@ SECONDARY_KEYS')).toBeLessThan(next.indexOf('@@@ CONTENT'));
    expect(next).toContain('Appended acceptance line.');
  });

  it('does not mutate malformed sources during acceptance reassembly', () => {
    const fixture = getFixture('malformed-preserve-raw');
    const model = parseLorebookEditorDocument(fixture.source);
    const next = reassembleLorebookEditorDocument(model, {
      ...model.state,
      contentText: 'This must not be written because CONTENT is missing.',
    });

    expect(model.warnings.map((warning) => warning.code)).toEqual(['missing-section']);
    expect(next).toBe(fixture.source);
  });
});
