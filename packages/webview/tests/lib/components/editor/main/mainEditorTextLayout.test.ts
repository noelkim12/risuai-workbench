import { describe, expect, it } from 'vitest';
import mainEditorSource from '../../../../../src/lib/components/editor/main/MainEditor.svelte?raw';
import stylesSource from '../../../../../src/styles.css?inline';

describe('main editor risutext layout', () => {
  it('gives the frontmatter-free text editor a two-row authoring grid', () => {
    expect(mainEditorSource).toContain("textState ? ' main-editor-authoring--text' : ''");
    expect(stylesSource).toMatch(
      /\.main-editor-authoring--text\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s,
    );
  });
});
