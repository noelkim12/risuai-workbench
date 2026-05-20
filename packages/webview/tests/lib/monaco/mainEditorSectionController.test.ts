import { beforeEach, describe, expect, it, vi } from 'vitest';
import mainEditorSectionControllerSource from '../../../src/lib/monaco/mainEditorSectionController.ts?raw';
import htmlSourceEditorSource from '../../../src/lib/components/editor/html/HtmlSourceEditor.svelte?raw';
import lorebookContentEditorSource from '../../../src/lib/components/editor/lorebook/LorebookContentEditor.svelte?raw';
import promptSectionEditorSource from '../../../src/lib/components/editor/prompt/PromptSectionEditor.svelte?raw';
import regexSplitEditorSource from '../../../src/lib/components/editor/regex/RegexSplitEditor.svelte?raw';

interface FakeChangeEvent {
  changes: readonly unknown[];
}

interface FakeModel {
  getValue: () => string;
  setValue: (nextValue: string) => void;
  onDidChangeContent: (listener: (event: FakeChangeEvent) => void) => { dispose: () => void };
  dispose: () => void;
  triggerUserEdit: (nextValue: string) => void;
}

interface FakeEditor {
  setModel: (model: unknown) => void;
  dispose: () => void;
}

interface ControllerHarness {
  calls: string[];
  model: FakeModel;
  editor: FakeEditor;
}

describe('main editor Monaco section controller', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    (globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = undefined;
  });

  it('owns the repeated Monaco lifecycle setup in one helper', () => {
    expect(mainEditorSectionControllerSource).toContain('monaco.editor.createModel');
    expect(mainEditorSectionControllerSource).toContain('monaco.editor.create');
    expect(mainEditorSectionControllerSource).toContain('retainWorkbenchMonacoThemeSync');
    expect(mainEditorSectionControllerSource).toContain('registerMainEditorFindShortcut');
    expect(mainEditorSectionControllerSource).toContain('syncMonacoModelValuePreservingViewState');
  });

  it('configures MonacoEnvironment once and disposes owned models explicitly', () => {
    expect(mainEditorSectionControllerSource).toContain('if (monacoEnvironmentConfigured) return;');
    expect(mainEditorSectionControllerSource).toContain('editor.setModel(null);');
    expect(mainEditorSectionControllerSource).toContain('model.dispose();');
  });

  it('keeps section components on the shared controller instead of duplicating base setup', () => {
    for (const source of [htmlSourceEditorSource, promptSectionEditorSource, regexSplitEditorSource, lorebookContentEditorSource]) {
      expect(source).toContain('createMainEditorSectionController');
      expect(source).not.toContain('MonacoEnvironment');
      expect(source).not.toContain('createWorkbenchMonacoEditorOptions');
      expect(source).not.toContain('registerMainEditorFindShortcut');
      expect(source).not.toContain('syncMonacoModelValuePreservingViewState');
    }
  });

  it('increments content version only for user edits, not external value sync', async () => {
    const harness = mockControllerDependencies('initial');
    const { createMainEditorSectionController, createMainEditorContentVersionCounter } = await import('../../../src/lib/monaco/mainEditorSectionController');
    const changes: string[] = [];
    const versions: number[] = [];
    const contentVersionCounter = createMainEditorContentVersionCounter();
    const controller = createMainEditorSectionController({
      container: createFakeContainer(),
      initialValue: 'initial',
      languageId: 'plaintext',
      modelUri: 'file:///fixture#TEXT',
      onChange: (value) => changes.push(value),
      onContentVersionChange: (contentVersion) => versions.push(contentVersion),
      contentVersionCounter,
    });

    harness.model.triggerUserEdit('typed');
    controller.syncExternalValue('host snapshot');

    expect(changes).toEqual(['typed']);
    expect(versions).toEqual([1]);
    expect(contentVersionCounter.get()).toBe(1);
    expect(harness.calls).toContain('sync:host snapshot');
  });

  it('disposes subscription and owned Monaco resources in stable order', async () => {
    const harness = mockControllerDependencies('initial');
    const { createMainEditorSectionController } = await import('../../../src/lib/monaco/mainEditorSectionController');
    const controller = createMainEditorSectionController({
      container: createFakeContainer(),
      initialValue: 'initial',
      languageId: 'plaintext',
      modelUri: 'file:///fixture#TEXT',
      onChange: () => undefined,
      onContentVersionChange: () => undefined,
      retainLanguage: () => ({ dispose: () => harness.calls.push('dispose-language') }),
    });

    controller.dispose();

    expect(harness.calls.slice(-7)).toEqual(['dispose-subscription', 'dispose-theme', 'dispose-language', 'dispose-find', 'editor-set-model:null', 'dispose-editor', 'dispose-model']);
  });
});

/**
 * mockControllerDependencies 함수.
 * Monaco controller 동작 테스트에 필요한 editor/model dependency를 fake로 교체함.
 *
 * @param initialValue - fake model이 시작할 텍스트 값
 * @returns 호출 순서와 fake editor/model을 관찰하는 harness
 */
function mockControllerDependencies(initialValue: string): ControllerHarness {
  const calls: string[] = [];
  let value = initialValue;
  let changeListener: ((event: FakeChangeEvent) => void) | undefined;

  const model: FakeModel = {
    getValue: () => value,
    setValue: (nextValue: string) => {
      value = nextValue;
      calls.push(`model-set-value:${nextValue}`);
      changeListener?.({ changes: [] });
    },
    onDidChangeContent: (listener) => {
      calls.push('subscribe-content');
      changeListener = listener;
      return { dispose: () => calls.push('dispose-subscription') };
    },
    dispose: () => calls.push('dispose-model'),
    triggerUserEdit: (nextValue: string) => {
      value = nextValue;
      changeListener?.({ changes: [] });
    },
  };
  const editor: FakeEditor = {
    setModel: (nextModel: unknown) => calls.push(nextModel === null ? 'editor-set-model:null' : 'editor-set-model:value'),
    dispose: () => calls.push('dispose-editor'),
  };
  const monacoApi = {
    Uri: {
      parse: (uri: string) => ({ uri }),
    },
    editor: {
      createModel: (nextValue: string, languageId: string, uri: unknown) => {
        calls.push(`create-model:${nextValue}:${languageId}:${typeof uri}`);
        return model;
      },
      create: (container: HTMLElement, options: unknown) => {
        calls.push(`create-editor:${container.tagName}:${typeof options}`);
        return editor;
      },
    },
  };

  vi.doMock('monaco-editor/esm/vs/editor/editor.api.js', () => monacoApi);
  vi.doMock('monaco-editor/esm/vs/editor/editor.worker.js?worker', () => ({
    default: class FakeEditorWorker {},
  }));
  vi.doMock('../../../src/lib/monaco/mainEditorWorkbenchTheme', () => ({
    createWorkbenchMonacoEditorOptions: () => ({ theme: 'test-theme' }),
    registerMainEditorFindShortcut: () => ({ dispose: () => calls.push('dispose-find') }),
    retainWorkbenchMonacoThemeSync: () => ({ dispose: () => calls.push('dispose-theme') }),
    syncMonacoModelValuePreservingViewState: (_editor: FakeEditor, targetModel: FakeModel, nextValue: string) => {
      calls.push(`sync:${nextValue}`);
      targetModel.setValue(nextValue);
    },
  }));

  return { calls, model, editor };
}

/**
 * createFakeContainer 함수.
 * Node test 환경에서 Monaco create 호출에 전달할 최소 container를 제공함.
 *
 * @returns fake HTMLElement
 */
function createFakeContainer(): HTMLElement {
  return { tagName: 'DIV' } as HTMLElement;
}
