import { describe, expect, it } from 'vitest';
import { parseLorebookEditorDocument, reassembleLorebookEditorDocument } from '../../src/domain/editor';

describe('lorebook editor document model', () => {
  it('maps frontmatter, KEYS, SECONDARY_KEYS, and CONTENT into editable state', () => {
    const source = [
      '---',
      'name: Entry',
      'comment: Example entry',
      'mode: normal',
      'constant: false',
      'selective: true',
      'insertion_order: 10',
      'case_sensitive: false',
      'use_regex: false',
      'advanced_field: keep-me',
      '---',
      '@@@ KEYS',
      'alpha',
      'beta',
      '@@@ SECONDARY_KEYS',
      'gamma',
      '@@@ CONTENT',
      'Hello {{user}}',
      '',
    ].join('\n');

    const model = parseLorebookEditorDocument(source);

    expect(model.formatKind).toBe('lorebook');
    expect(model.state.frontmatter.name).toBe('Entry');
    expect(model.state.frontmatter.advanced_field).toBe('keep-me');
    expect(model.state.unknownFrontmatter.map((field) => field.key)).toEqual(['advanced_field']);
    expect(model.state.keysText).toBe('alpha\nbeta');
    expect(model.state.secondaryKeysText).toBe('gamma');
    expect(model.state.contentText).toBe('Hello {{user}}');
    expect(model.warnings.map((warning) => warning.code)).toEqual(['unsupported-frontmatter-field']);
  });

  it('reassembles edited state while preserving marker order and final newline', () => {
    const source = [
      '---',
      'name: Entry',
      'comment: Example entry',
      'mode: normal',
      'constant: false',
      'selective: false',
      'insertion_order: 10',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ CONTENT',
      'Old body',
      '',
    ].join('\n');
    const model = parseLorebookEditorDocument(source);

    const next = reassembleLorebookEditorDocument(model, {
      ...model.state,
      frontmatter: { ...model.state.frontmatter, name: 'Edited Entry' },
      keysText: 'alpha\nbeta',
      hasSecondaryKeysSection: true,
      secondaryKeysText: 'gamma',
      contentText: 'New body',
    });

    expect(next).toBe(
      [
        '---',
        'name: Edited Entry',
        'comment: Example entry',
        'mode: normal',
        'constant: false',
        'selective: false',
        'insertion_order: 10',
        'case_sensitive: false',
        'use_regex: false',
        '---',
        '@@@ KEYS',
        'alpha',
        'beta',
        '@@@ SECONDARY_KEYS',
        'gamma',
        '@@@ CONTENT',
        'New body',
        '',
      ].join('\n'),
    );
  });

  it('preserves folder lorebook shape without inventing secondary keys', () => {
    const source = [
      '---',
      'name: Folder',
      'comment: Folder',
      'mode: folder',
      'constant: false',
      'selective: false',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'folder-1',
      '@@@ CONTENT',
      '',
    ].join('\n');
    const model = parseLorebookEditorDocument(source);
    const next = reassembleLorebookEditorDocument(model, model.state);

    expect(model.state.hasSecondaryKeysSection).toBe(false);
    expect(next).toBe(source);
  });

  it('warns and preserves raw source when required lorebook sections are malformed', () => {
    const source = ['---', 'name: Entry', '---', '@@@ KEYS', 'alpha'].join('\n');
    const model = parseLorebookEditorDocument(source);
    const next = reassembleLorebookEditorDocument(model, model.state);

    expect(model.warnings.map((warning) => warning.code)).toContain('missing-section');
    expect(next).toBe(source);
  });

  it('preserves raw source when unsupported sections would be dropped by structured reassembly', () => {
    const source = [
      '---',
      'name: Entry',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ UNKNOWN',
      'must stay',
      '@@@ CONTENT',
      'Body',
    ].join('\n');
    const model = parseLorebookEditorDocument(source);
    const next = reassembleLorebookEditorDocument(model, {
      ...model.state,
      contentText: 'Edited body',
    });

    expect(model.warnings.map((warning) => warning.code)).toContain('unsupported-section');
    expect(next).toBe(source);
  });
});
