import { describe, expect, it } from 'vitest';
import { createRegexMainEditorPreview, mergeSimulatorProfileVariables } from '../../src/domain/editor';

describe('main editor .risuregex preview adapter', () => {
  it('prepares IN and OUT for regex webview worker preview', () => {
    const preview = createRegexMainEditorPreview(
      { frontmatter: { comment: 'Name capture', type: 'editprocess', flag: 'g' }, inText: '(Alice)', outText: 'Hello $1' },
      { sampleInput: 'Alice and Alice', variables: { chatVariables: {}, globalVariables: {}, toggleValues: {}, tempVariables: {} } },
    );

    expect(preview.status).toBe('ok');
    expect(preview.title).toBe('.risuregex Preview');
    expect(preview.output).toBe('');
    expect(preview.metadata.format).toBe('regex');
    expect(preview.metadata.matchCount).toBe('worker');
    expect(preview.regex?.pattern.effective).toBe('(Alice)');
    expect(preview.regex?.replacement.effective).toBe('Hello $1');
    expect(preview.regex?.nativeExecution).toBe('webview-worker-required');
  });

  it('returns regex preflight data for webview worker execution', () => {
    const preview = createRegexMainEditorPreview(
      {
        frontmatter: { comment: 'demo', type: 'editprocess', flag: 'g' },
        inText: 'name:(.*)',
        outText: 'Hello $1',
      },
      { sampleInput: 'name:value' },
    );

    expect(preview.regex).toEqual(expect.objectContaining({
      pattern: expect.objectContaining({ effective: 'name:(.*)' }),
      replacement: expect.objectContaining({ effective: 'Hello $1' }),
      jsFlags: 'g',
      nativeExecution: 'webview-worker-required',
    }));
    expect(preview.output).toBe('');
  });

  it('evaluates OUT conditions with runtime context overrides', () => {
    const variables = mergeSimulatorProfileVariables({}, {
      chatVariables: {},
      contextVariables: { chatIndex: '1', lastmessageid: '2' },
    });
    const preview = createRegexMainEditorPreview(
      {
        frontmatter: { comment: 'context condition', type: 'editdisplay', flag: '' },
        inText: '▶▶▶',
        outText: '{{#if {{greater_equal::{{chat_index}}::{{? {{lastmessageid}}-1}}}}}}\ntest\nasdf\n{{/if}}',
      },
      { sampleInput: '123123\n▶▶▶', variables },
    );

    expect(preview.regex?.replacement.effective).toBe('test\nasdf');
  });
});
