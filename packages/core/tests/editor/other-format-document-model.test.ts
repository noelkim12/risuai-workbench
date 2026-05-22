import { describe, expect, it } from 'vitest';
import {
  parseHtmlEditorDocument,
  parsePromptEditorDocument,
  parseRegexEditorDocument,
  reassembleHtmlEditorDocument,
  reassemblePromptEditorDocument,
  reassembleRegexEditorDocument,
} from '../../src/domain/editor';

describe('other format editor document models', () => {
  it('maps regex IN and OUT sections and reassembles them', () => {
    const source = ['---', 'comment: Rule', 'type: editdisplay', 'flag: g', '---', '@@@ IN', 'A', '@@@ OUT', 'B', ''].join('\n');
    const model = parseRegexEditorDocument(source);
    const next = reassembleRegexEditorDocument(model, {
      ...model.state,
      inText: 'A+',
      outText: 'B+',
    });

    expect(model.state.frontmatter.comment).toBe('Rule');
    expect(model.state.inText).toBe('A');
    expect(model.state.outText).toBe('B');
    expect(next).toBe(['---', 'comment: Rule', 'type: editdisplay', 'flag: g', '---', '@@@ IN', 'A+', '@@@ OUT', 'B+', ''].join('\n'));
  });

  it('maps prompt allowed sections for authornote', () => {
    const source = ['---', 'type: authornote', 'name: Note', '---', '@@@ INNER_FORMAT', 'Inner', '@@@ DEFAULT_TEXT', 'Default', ''].join('\n');
    const model = parsePromptEditorDocument(source);

    expect(model.state.type).toBe('authornote');
    expect(model.state.sections.INNER_FORMAT).toBe('Inner');
    expect(model.state.sections.DEFAULT_TEXT).toBe('Default');
    expect(reassemblePromptEditorDocument(model, model.state)).toBe(source);
  });

  it('maps prompt chat and cache variants as bodyless skeletons', () => {
    const chat = parsePromptEditorDocument(['---', 'type: chat', 'range_start: 0', 'range_end: end', '---', ''].join('\n'));
    const cache = parsePromptEditorDocument(['---', 'type: cache', 'name: K', 'depth: 4', 'cache_role: system', '---', ''].join('\n'));

    expect(chat.state.sections).toEqual({});
    expect(cache.state.sections).toEqual({});
    expect(chat.warnings).toEqual([]);
    expect(cache.warnings).toEqual([]);
  });

  it('maps html as full-file identity', () => {
    const source = '<main>{{char}}</main>\n';
    const model = parseHtmlEditorDocument(source);

    expect(model.formatKind).toBe('html');
    expect(model.state.contentText).toBe(source);
    expect(reassembleHtmlEditorDocument(model, { contentText: '<main>{{user}}</main>\n' })).toBe('<main>{{user}}</main>\n');
  });

  it('preserves regex raw source when unsupported sections are present', () => {
    const source = ['---', 'comment: Rule', '---', '@@@ IN', 'A', '@@@ UNKNOWN', 'keep', '@@@ OUT', 'B'].join('\n');
    const model = parseRegexEditorDocument(source);

    expect(model.warnings.map((warning) => warning.code)).toContain('unsupported-section');
    expect(reassembleRegexEditorDocument(model, { ...model.state, inText: 'A+' })).toBe(source);
  });

  it('preserves prompt raw source when unsupported sections are present', () => {
    const source = ['---', 'type: authornote', '---', '@@@ INNER_FORMAT', 'Inner', '@@@ EXTRA', 'keep'].join('\n');
    const model = parsePromptEditorDocument(source);

    expect(model.warnings.map((warning) => warning.code)).toContain('unsupported-section');
    expect(reassemblePromptEditorDocument(model, { ...model.state, sections: { INNER_FORMAT: 'Edited' } })).toBe(source);
  });
});
