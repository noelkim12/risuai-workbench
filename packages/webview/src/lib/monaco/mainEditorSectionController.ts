/**
 * Main Editor section Monaco instance lifecycle controller.
 * @file packages/webview/src/lib/monaco/mainEditorSectionController.ts
 */

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { createWorkbenchMonacoEditorOptions, registerMainEditorFindShortcut, retainWorkbenchMonacoThemeSync, syncMonacoModelValuePreservingViewState } from './mainEditorWorkbenchTheme';

interface MonacoEnvironmentGlobal {
  MonacoEnvironment?: { getWorker: () => Worker };
}

let monacoEnvironmentConfigured = false;

export interface MainEditorContentVersionCounter {
  get: () => number;
  set: (contentVersion: number) => void;
  next: () => number;
}

export interface MainEditorSectionControllerOptions {
  container: HTMLElement;
  initialValue: string;
  languageId: string;
  modelUri: string;
  onChange: (value: string, event: monaco.editor.IModelContentChangedEvent) => void;
  onContentVersionChange: (contentVersion: number) => void;
  contentVersionCounter?: MainEditorContentVersionCounter;
  retainLanguage?: () => monaco.IDisposable | undefined;
  editorOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export interface MainEditorSectionController {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  syncExternalValue: (nextValue: string) => void;
  dispose: () => void;
}

/**
 * createMainEditorContentVersionCounter 함수.
 * section editor 변경 버전을 단일 증가 규칙으로 관리함.
 *
 * @param initialContentVersion - controller 생성 시점의 기준 content version
 * @returns 현재 버전을 조회/갱신/증가시키는 counter
 */
export function createMainEditorContentVersionCounter(initialContentVersion = 0): MainEditorContentVersionCounter {
  let contentVersion = initialContentVersion;

  return {
    get: () => contentVersion,
    set: (nextContentVersion: number) => {
      contentVersion = nextContentVersion;
    },
    next: () => {
      contentVersion += 1;
      return contentVersion;
    },
  };
}

/**
 * createMainEditorSectionController 함수.
 * Monaco model/editor 생성, workbench theme sync, shortcut, external value sync lifecycle을 묶어 제공함.
 *
 * @param options - section editor마다 달라지는 container, language, model URI, change callback 설정
 * @returns 생성된 Monaco editor/model과 정리 함수를 포함한 controller
 */
export function createMainEditorSectionController(options: MainEditorSectionControllerOptions): MainEditorSectionController {
  configureMainEditorMonacoEnvironment();

  const contentVersionCounter = options.contentVersionCounter ?? createMainEditorContentVersionCounter();
  const themeSyncDisposable = retainWorkbenchMonacoThemeSync();
  const languageDisposable = options.retainLanguage?.();
  const model = monaco.editor.createModel(options.initialValue, options.languageId, monaco.Uri.parse(options.modelUri));
  const editor = monaco.editor.create(options.container, {
    ...createWorkbenchMonacoEditorOptions(),
    model,
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    ...options.editorOptions,
  });
  const findShortcutDisposable = registerMainEditorFindShortcut(editor);
  let applyingExternalValue = false;

  const subscription = model.onDidChangeContent((event) => {
    if (applyingExternalValue) return;
    const nextContentVersion = contentVersionCounter.next();
    options.onContentVersionChange(nextContentVersion);
    options.onChange(model.getValue(), event);
  });

  return {
    editor,
    model,
    syncExternalValue: (nextValue: string) => {
      if (model.getValue() === nextValue) return;
      applyingExternalValue = true;
      syncMonacoModelValuePreservingViewState(editor, model, nextValue);
      applyingExternalValue = false;
    },
    dispose: () => {
      subscription.dispose();
      themeSyncDisposable.dispose();
      languageDisposable?.dispose();
      findShortcutDisposable.dispose();
      editor.setModel(null);
      editor.dispose();
      model.dispose();
    },
  };
}

/**
 * configureMainEditorMonacoEnvironment 함수.
 * standalone Monaco editor worker factory를 webview 전역 환경에 등록함.
 */
function configureMainEditorMonacoEnvironment(): void {
  if (monacoEnvironmentConfigured) return;

  const monacoGlobal = globalThis as typeof globalThis & MonacoEnvironmentGlobal;
  monacoGlobal.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
  monacoEnvironmentConfigured = true;
}
