import { describe, expect, it } from 'vitest';
import { createHtmlMainEditorPreview } from '../../src/domain/editor';

describe('main editor .risuhtml preview adapter', () => {
  it('returns strict sandbox metadata and CBS-rendered srcdoc output', () => {
    const preview = createHtmlMainEditorPreview(
      { contentText: '<main>{{getvar::mood}}</main>' },
      { variables: { chatVariables: { mood: 'calm' } }, scriptsEnabled: false },
    );

    expect(preview.output).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(preview.output).toContain('<main>calm</main>');
    expect(preview.metadata.sandbox).toBe('');
    expect(preview.metadata.renderMode).toBe('iframe-srcdoc');
    expect(preview.metadata.csp).toBe("default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'");
  });

  it('allows scripts only through nested iframe sandbox metadata', () => {
    expect(createHtmlMainEditorPreview(
      { contentText: '<script>document.body.textContent = "x"</script>' },
      { scriptsEnabled: true },
    ).metadata.sandbox).toBe('allow-scripts');
  });
});
