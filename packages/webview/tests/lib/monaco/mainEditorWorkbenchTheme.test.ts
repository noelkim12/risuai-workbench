import { describe, expect, it } from 'vitest';
import { MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS } from '../../../src/lib/monaco/mainEditorMonacoOptionsPolicy';
import mainEditorWorkbenchThemeSource from '../../../src/lib/monaco/mainEditorWorkbenchTheme.ts?raw';

describe('main editor Monaco workbench options', () => {
  it('keeps overflow widgets in the editor coordinate space by default', () => {
    expect(MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS).toBe(false);
  });

  it('registers Monaco core editor contributions as a complete bundle', () => {
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/edcore.main.js");
    expect(mainEditorWorkbenchThemeSource).not.toContain('monaco-editor/esm/vs/editor/contrib/');
  });

  it('registers Monaco hover and go-to-definition UI contributions', () => {
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/edcore.main.js");
  });

  it('bridges F12 to Monaco go-to-definition action', () => {
    expect(mainEditorWorkbenchThemeSource).toContain('monaco.KeyCode.F12');
    expect(mainEditorWorkbenchThemeSource).toContain('editor.action.revealDefinition');
    expect(mainEditorWorkbenchThemeSource).toContain('runEditorDefinitionAction');
  });

  it('bridges the user delete-line shortcut to Monaco line operations', () => {
    expect(mainEditorWorkbenchThemeSource).toContain('monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD');
    expect(mainEditorWorkbenchThemeSource).toContain('editor.action.deleteLines');
  });

  it('bridges move-line shortcuts to Monaco line operations', () => {
    expect(mainEditorWorkbenchThemeSource).toContain('monaco.KeyMod.Alt | monaco.KeyCode.UpArrow');
    expect(mainEditorWorkbenchThemeSource).toContain('monaco.KeyMod.Alt | monaco.KeyCode.DownArrow');
    expect(mainEditorWorkbenchThemeSource).toContain('editor.action.moveLinesUpAction');
    expect(mainEditorWorkbenchThemeSource).toContain('editor.action.moveLinesDownAction');
  });

  it('bridges paste and cut shortcuts to clipboard fallbacks', () => {
    expect(mainEditorWorkbenchThemeSource).toContain('isPlainPasteShortcut');
    expect(mainEditorWorkbenchThemeSource).toContain('isPlainCutShortcut');
    expect(mainEditorWorkbenchThemeSource).toContain('pasteFromNavigatorClipboard');
    expect(mainEditorWorkbenchThemeSource).toContain('cutToNavigatorClipboard');
    expect(mainEditorWorkbenchThemeSource).toContain("event.key.toLowerCase() === 'v'");
    expect(mainEditorWorkbenchThemeSource).toContain("event.key.toLowerCase() === 'x'");
  });

  it('handles native paste and cut clipboard events before Monaco loses them', () => {
    expect(mainEditorWorkbenchThemeSource).toContain("ownerDocument.addEventListener('paste'");
    expect(mainEditorWorkbenchThemeSource).toContain("ownerDocument.addEventListener('cut'");
    expect(mainEditorWorkbenchThemeSource).toContain("event.clipboardData?.getData('text/plain')");
    expect(mainEditorWorkbenchThemeSource).toContain("event.clipboardData?.setData('text/plain', selectedText)");
  });
});
