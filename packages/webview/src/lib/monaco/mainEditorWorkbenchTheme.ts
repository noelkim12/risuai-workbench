/**
 * Main editor Monaco workbench integration helpers.
 * @file packages/webview/src/lib/monaco/mainEditorWorkbenchTheme.ts
 */

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
import './mainEditorFindWidgetFallback.css';
import { MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS } from './mainEditorMonacoOptionsPolicy';

const THEME_NAME_PREFIX = 'risu-workbench-main-editor';

let activeThemeName = `${THEME_NAME_PREFIX}-light`;
let observer: MutationObserver | undefined;
let darkSchemeQuery: MediaQueryList | undefined;
let themeSyncRefCount = 0;

/**
 * syncMonacoModelValuePreservingViewState 함수.
 * 외부 snapshot을 반영할 때 cursor/selection/scroll 위치를 보존함.
 *
 * @param editor - view state를 보존할 Monaco editor
 * @param model - 새 값을 반영할 Monaco model
 * @param nextValue - extension host에서 전달된 canonical text
 */
export function syncMonacoModelValuePreservingViewState(
  editor: monaco.editor.IStandaloneCodeEditor | undefined,
  model: monaco.editor.ITextModel | undefined,
  nextValue: string,
): void {
  if (!editor || !model || model.getValue() === nextValue) return;

  const viewState = editor.saveViewState();
  const selection = editor.getSelection();
  const position = editor.getPosition();

  model.setValue(nextValue);

  if (viewState) {
    editor.restoreViewState(viewState);
    return;
  }

  if (selection) {
    editor.setSelection(clampRangeToModel(model, selection));
    return;
  }

  if (position) {
    editor.setPosition(clampPositionToModel(model, position));
  }
}

/**
 * retainWorkbenchMonacoThemeSync 함수.
 * VS Code webview theme class/CSS variable을 Monaco 전역 theme에 동기화함.
 *
 * @returns theme observer 참조를 해제하는 disposable
 */
export function retainWorkbenchMonacoThemeSync(): monaco.IDisposable {
  themeSyncRefCount += 1;
  applyWorkbenchMonacoTheme();

  if (!observer && typeof document !== 'undefined') {
    observer = new MutationObserver(() => applyWorkbenchMonacoTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

    darkSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    darkSchemeQuery?.addEventListener('change', applyWorkbenchMonacoTheme);
  }

  return {
    dispose: () => {
      themeSyncRefCount = Math.max(0, themeSyncRefCount - 1);
      if (themeSyncRefCount > 0) return;

      observer?.disconnect();
      observer = undefined;
      darkSchemeQuery?.removeEventListener('change', applyWorkbenchMonacoTheme);
      darkSchemeQuery = undefined;
    },
  };
}

/**
 * getWorkbenchMonacoThemeName 함수.
 * 현재 VS Code workbench theme에 맞는 Monaco theme 이름을 반환함.
 *
 * @returns 현재 적용된 Monaco theme 이름
 */
export function getWorkbenchMonacoThemeName(): string {
  return activeThemeName;
}

/**
 * createWorkbenchMonacoEditorOptions 함수.
 * main editor Monaco 인스턴스가 VS Code 폰트/테마와 맞도록 공통 옵션을 제공함.
 *
 * @returns Monaco editor 생성 공통 옵션
 */
export function createWorkbenchMonacoEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    theme: getWorkbenchMonacoThemeName(),
    fontFamily: readWorkbenchFont('--vscode-editor-font-family', readWorkbenchFont('--vscode-font-family', 'monospace')),
    fontSize: readWorkbenchNumber('--vscode-editor-font-size', readWorkbenchNumber('--vscode-font-size', 13)),
    lineHeight: readWorkbenchNumber('--vscode-editor-line-height', 0) || undefined,
    fixedOverflowWidgets: MAIN_EDITOR_FIXED_OVERFLOW_WIDGETS,
  };
}

/**
 * registerMainEditorFindShortcut 함수.
 * VS Code webview 안에서도 Monaco editor shortcut을 직접 실행하게 함.
 *
 * @param editor - shortcut을 보강할 Monaco editor instance
 * @returns keydown listener를 해제하는 disposable
 */
export function registerMainEditorFindShortcut(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
    runEditorFindAction(editor);
  });
  editor.addCommand(monaco.KeyCode.F12, () => {
    runEditorDefinitionAction(editor);
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
    runEditorDeleteLineAction(editor);
  });
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
    runEditorLineOperationAction(editor, 'editor.action.moveLinesUpAction');
  });
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
    runEditorLineOperationAction(editor, 'editor.action.moveLinesDownAction');
  });

  const ownerDocument = editor.getDomNode()?.ownerDocument;
  if (!ownerDocument) return { dispose: () => undefined };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!editor.hasTextFocus() && !editor.hasWidgetFocus()) return;

    if (isPlainFindShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      runEditorFindAction(editor);
      return;
    }

    if (isGoToDefinitionShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      runEditorDefinitionAction(editor);
      return;
    }

    if (isPlainDeleteLineShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      runEditorDeleteLineAction(editor);
      return;
    }

    const moveLineActionId = getMoveLineShortcutActionId(event);
    if (moveLineActionId) {
      event.preventDefault();
      event.stopPropagation();
      runEditorLineOperationAction(editor, moveLineActionId);
    }
  };

  ownerDocument.addEventListener('keydown', handleKeydown, { capture: true });

  return {
    dispose: () => ownerDocument.removeEventListener('keydown', handleKeydown, { capture: true }),
  };
}

/**
 * runEditorDefinitionAction 함수.
 * VS Code webview 안에서도 Monaco go-to-definition action을 직접 실행함.
 *
 * @param editor - definition action을 실행할 Monaco editor instance
 */
function runEditorDefinitionAction(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.focus();
  const action = editor.getAction('editor.action.revealDefinition');
  if (action) {
    void action.run();
    return;
  }
  editor.trigger('main-editor-definition-shortcut', 'editor.action.revealDefinition', null);
}

/**
 * runEditorDeleteLineAction 함수.
 * Monaco delete line action을 사용자 keymap 호환 단축키에서 실행함.
 *
 * @param editor - delete line action을 실행할 Monaco editor instance
 */
function runEditorDeleteLineAction(editor: monaco.editor.IStandaloneCodeEditor): void {
  runEditorLineOperationAction(editor, 'editor.action.deleteLines');
}

/**
 * runEditorLineOperationAction 함수.
 * Monaco line operation action을 직접 실행함.
 *
 * @param editor - line operation action을 실행할 Monaco editor instance
 * @param actionId - Monaco line operation action id
 */
function runEditorLineOperationAction(editor: monaco.editor.IStandaloneCodeEditor, actionId: 'editor.action.deleteLines' | 'editor.action.moveLinesUpAction' | 'editor.action.moveLinesDownAction'): void {
  editor.focus();
  const action = editor.getAction(actionId);
  if (action) {
    void action.run();
    return;
  }
  editor.trigger('main-editor-line-operation-shortcut', actionId, null);
}

/**
 * runEditorFindAction 함수.
 * Monaco 기본 find action을 가능한 경로로 실행함.
 *
 * @param editor - find action을 실행할 Monaco editor instance
 */
function runEditorFindAction(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.focus();
  const findAction = editor.getAction('actions.find');
  if (findAction) {
    void findAction.run();
    return;
  }
  editor.trigger('main-editor-find-shortcut', 'actions.find', null);
}

/**
 * isPlainFindShortcut 함수.
 * Ctrl/Cmd+F 단독 검색 단축키인지 판정함.
 *
 * @param event - keyboard event
 * @returns Monaco find를 열어야 하면 true
 */
function isPlainFindShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f';
}

/**
 * isGoToDefinitionShortcut 함수.
 * F12 단독 go-to-definition shortcut인지 판정함.
 *
 * @param event - keyboard event
 * @returns Monaco definition action을 실행해야 하면 true
 */
function isGoToDefinitionShortcut(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.key === 'F12';
}

/**
 * isPlainDeleteLineShortcut 함수.
 * Ctrl/Cmd+D 단독 delete line shortcut인지 판정함.
 *
 * @param event - keyboard event
 * @returns Monaco delete line을 실행해야 하면 true
 */
function isPlainDeleteLineShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd';
}

/**
 * getMoveLineShortcutActionId 함수.
 * Alt+Up/Down move line shortcut에 대응하는 Monaco action id를 반환함.
 *
 * @param event - keyboard event
 * @returns 실행할 move line action id 또는 undefined
 */
function getMoveLineShortcutActionId(event: KeyboardEvent): 'editor.action.moveLinesUpAction' | 'editor.action.moveLinesDownAction' | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  if (event.key === 'ArrowUp') return 'editor.action.moveLinesUpAction';
  if (event.key === 'ArrowDown') return 'editor.action.moveLinesDownAction';
  return undefined;
}

function applyWorkbenchMonacoTheme(): void {
  const themeKind = detectWorkbenchThemeKind();
  activeThemeName = `${THEME_NAME_PREFIX}-${themeKind}`;
  monaco.editor.defineTheme(activeThemeName, createWorkbenchThemeData(themeKind));
  monaco.editor.setTheme(activeThemeName);
}

function detectWorkbenchThemeKind(): 'light' | 'dark' | 'high-contrast' | 'high-contrast-light' {
  if (typeof document === 'undefined') return 'light';

  const classes = document.body.classList;
  if (classes.contains('vscode-high-contrast-light')) return 'high-contrast-light';
  if (classes.contains('vscode-high-contrast')) return 'high-contrast';
  if (classes.contains('vscode-dark')) return 'dark';
  if (classes.contains('vscode-light')) return 'light';
  return darkSchemeQuery?.matches ? 'dark' : 'light';
}

function createWorkbenchThemeData(themeKind: ReturnType<typeof detectWorkbenchThemeKind>): monaco.editor.IStandaloneThemeData {
  const isDark = themeKind === 'dark' || themeKind === 'high-contrast';
  const base = themeKind === 'high-contrast-light' ? 'hc-light' : themeKind === 'high-contrast' ? 'hc-black' : isDark ? 'vs-dark' : 'vs';
  const fallbackBackground = isDark ? '#1e1e1e' : '#ffffff';
  const fallbackForeground = isDark ? '#d4d4d4' : '#1f1f1f';

  return {
    base,
    inherit: true,
    rules: [],
    colors: {
      'editor.background': readWorkbenchColor('--vscode-editor-background', fallbackBackground),
      'editor.foreground': readWorkbenchColor('--vscode-editor-foreground', fallbackForeground),
      'editorCursor.foreground': readWorkbenchColor('--vscode-editorCursor-foreground', fallbackForeground),
      'editor.lineHighlightBackground': readWorkbenchColor('--vscode-editor-lineHighlightBackground', isDark ? '#2a2a2a' : '#f5f5f5'),
      'editor.selectionBackground': readWorkbenchColor('--vscode-editor-selectionBackground', isDark ? '#264f78' : '#add6ff'),
      'editor.inactiveSelectionBackground': readWorkbenchColor('--vscode-editor-inactiveSelectionBackground', isDark ? '#3a3d41' : '#e5ebf1'),
      'editorLineNumber.foreground': readWorkbenchColor('--vscode-editorLineNumber-foreground', isDark ? '#858585' : '#6e7681'),
      'editorLineNumber.activeForeground': readWorkbenchColor('--vscode-editorLineNumber-activeForeground', fallbackForeground),
      'editorWidget.background': readWorkbenchColor('--vscode-editorWidget-background', fallbackBackground),
      'editorWidget.border': readWorkbenchColor('--vscode-editorWidget-border', readWorkbenchColor('--vscode-panel-border', isDark ? '#454545' : '#c8c8c8')),
      'editorSuggestWidget.background': readWorkbenchColor('--vscode-editorSuggestWidget-background', readWorkbenchColor('--vscode-editorWidget-background', fallbackBackground)),
      'editorHoverWidget.background': readWorkbenchColor('--vscode-editorHoverWidget-background', readWorkbenchColor('--vscode-editorWidget-background', fallbackBackground)),
      focusBorder: readWorkbenchColor('--vscode-focusBorder', isDark ? '#007fd4' : '#0090f1'),
    },
  };
}

function readWorkbenchColor(variableName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value.length > 0 ? value : fallback;
}

function readWorkbenchFont(variableName: string, fallback: string): string {
  const value = readWorkbenchColor(variableName, fallback);
  return value.length > 0 ? value : fallback;
}

function readWorkbenchNumber(variableName: string, fallback: number): number {
  const value = readWorkbenchColor(variableName, '').trim();
  if (!value) return fallback;
  const parsed = Number.parseFloat(value.replace(/px$/, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampRangeToModel(model: monaco.editor.ITextModel, range: monaco.Range): monaco.Range {
  const start = clampPositionToModel(model, range.getStartPosition());
  const end = clampPositionToModel(model, range.getEndPosition());
  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

function clampPositionToModel(model: monaco.editor.ITextModel, position: monaco.Position): monaco.Position {
  const lineNumber = Math.min(Math.max(1, position.lineNumber), model.getLineCount());
  const column = Math.min(Math.max(1, position.column), model.getLineMaxColumn(lineNumber));
  return new monaco.Position(lineNumber, column);
}
