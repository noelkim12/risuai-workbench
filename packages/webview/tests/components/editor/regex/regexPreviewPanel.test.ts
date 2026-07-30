import { describe, expect, it } from 'vitest';
import regexPreviewPanelSource from '../../../../src/lib/components/editor/regex/RegexPreviewPanel.svelte?raw';

describe('RegexPreviewPanel output document', () => {
  it('gives plain replacement text an adaptive foreground and background', () => {
    expect(regexPreviewPanelSource).toContain(':root { color-scheme: light dark; }');
    expect(regexPreviewPanelSource).toContain('color: CanvasText;');
    expect(regexPreviewPanelSource).toContain('background: Canvas;');
  });
});
