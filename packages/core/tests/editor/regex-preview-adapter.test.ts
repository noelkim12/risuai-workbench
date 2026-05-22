import { describe, expect, it } from 'vitest';
import { createRegexMainEditorPreview } from '../../src/domain/editor';

describe('main editor .risuregex preview adapter', () => {
  it('runs IN and OUT through the regex preview simulator', () => {
    const preview = createRegexMainEditorPreview(
      { frontmatter: { comment: 'Name capture', type: 'editprocess', flag: 'g' }, inText: '(Alice)', outText: 'Hello $1' },
      { sampleInput: 'Alice and Alice', variables: { chatVariables: {}, globalVariables: {}, toggleValues: {}, tempVariables: {} } },
    );

    expect(preview.status).toBe('ok');
    expect(preview.title).toBe('.risuregex Preview');
    expect(preview.output).toContain('Hello Alice');
    expect(preview.metadata.format).toBe('regex');
  });
});
