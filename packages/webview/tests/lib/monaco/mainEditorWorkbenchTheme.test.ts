import { describe, expect, it } from 'vitest';
import { MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS } from '../../../src/lib/monaco/mainEditorMonacoOptionsPolicy';
import mainEditorWorkbenchThemeSource from '../../../src/lib/monaco/mainEditorWorkbenchTheme.ts?raw';

describe('main editor Monaco workbench options', () => {
  it('keeps overflow widgets in the editor coordinate space by default', () => {
    expect(MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS).toBe(false);
  });

  it('registers VS Code-like editor shortcut contributions', () => {
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js");
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js");
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js");
  });

  it('registers Monaco hover and go-to-definition UI contributions', () => {
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js");
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js");
    expect(mainEditorWorkbenchThemeSource).toContain("monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js");
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
});
