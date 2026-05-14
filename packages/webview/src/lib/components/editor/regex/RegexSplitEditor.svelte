<!--
  Monaco-backed split editor for .risuregex IN and OUT sections.
  @file packages/webview/src/lib/components/editor/regex/RegexSplitEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
  import { onDestroy, onMount } from 'svelte';
  import { MAIN_EDITOR_CBS_LANGUAGE_ID, retainMainEditorCbsLanguage } from '../../../monaco/mainEditorCbsLanguage';
  import { createWorkbenchMonacoEditorOptions, registerMainEditorFindShortcut, retainWorkbenchMonacoThemeSync, syncMonacoModelValuePreservingViewState } from '../../../monaco/mainEditorWorkbenchTheme';

  export let documentUri: string;
  export let inText: string;
  export let outText: string;
  export let sampleInput: string;
  export let onInChange: (value: string) => void;
  export let onOutChange: (value: string) => void;
  export let onSampleInputChange: (value: string) => void;
  export let onContentVersionChange: (contentVersion: number) => void;

  let inContainer: HTMLDivElement;
  let outContainer: HTMLDivElement;
  let inEditor: monaco.editor.IStandaloneCodeEditor | undefined;
  let outEditor: monaco.editor.IStandaloneCodeEditor | undefined;
  let inModel: monaco.editor.ITextModel | undefined;
  let outModel: monaco.editor.ITextModel | undefined;
  let inSubscription: monaco.IDisposable | undefined;
  let outSubscription: monaco.IDisposable | undefined;
  let themeSyncDisposable: monaco.IDisposable | undefined;
  let cbsLanguageDisposable: monaco.IDisposable | undefined;
  let findShortcutDisposables: monaco.IDisposable[] = [];
  let applyingExternalValue = false;
  let localContentVersion = 0;

  const monacoGlobal = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };

  monacoGlobal.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };

  onMount(() => {
    themeSyncDisposable = retainWorkbenchMonacoThemeSync();
    cbsLanguageDisposable = retainMainEditorCbsLanguage(monaco);
    inModel = monaco.editor.createModel(inText, 'plaintext', monaco.Uri.parse(`${documentUri}#IN`));
    outModel = monaco.editor.createModel(outText, MAIN_EDITOR_CBS_LANGUAGE_ID, monaco.Uri.parse(`${documentUri}#OUT`));
    inEditor = createEditor(inContainer, inModel);
    outEditor = createEditor(outContainer, outModel);
    inSubscription = inModel.onDidChangeContent(() => handleModelChange(inModel, onInChange));
    outSubscription = outModel.onDidChangeContent(() => handleModelChange(outModel, onOutChange));
  });

  onDestroy(() => {
    inSubscription?.dispose();
    outSubscription?.dispose();
    themeSyncDisposable?.dispose();
    cbsLanguageDisposable?.dispose();
    for (const disposable of findShortcutDisposables.splice(0)) disposable.dispose();
    inEditor?.dispose();
    outEditor?.dispose();
    inModel?.dispose();
    outModel?.dispose();
  });

  $: syncExternalValue(inEditor, inModel, inText);
  $: syncExternalValue(outEditor, outModel, outText);

  function createEditor(container: HTMLDivElement, model: monaco.editor.ITextModel): monaco.editor.IStandaloneCodeEditor {
    const createdEditor = monaco.editor.create(container, {
      ...createWorkbenchMonacoEditorOptions(),
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
    });
    findShortcutDisposables.push(registerMainEditorFindShortcut(createdEditor));
    return createdEditor;
  }

  function handleModelChange(model: monaco.editor.ITextModel | undefined, onChange: (value: string) => void): void {
    if (!model || applyingExternalValue) return;
    localContentVersion += 1;
    onContentVersionChange(localContentVersion);
    onChange(model.getValue());
  }

  function syncExternalValue(editor: monaco.editor.IStandaloneCodeEditor | undefined, model: monaco.editor.ITextModel | undefined, value: string): void {
    if (!editor || !model || model.getValue() === value) return;
    applyingExternalValue = true;
    syncMonacoModelValuePreservingViewState(editor, model, value);
    applyingExternalValue = false;
  }
</script>

<section class="regex-split-editor" aria-label="Regex IN and OUT editors">
  <label class="regex-split-editor__sample">
    <span>Sample input</span>
    <textarea value={sampleInput} oninput={(event) => onSampleInputChange(event.currentTarget.value)} spellcheck="false"></textarea>
  </label>
  <div class="regex-split-editor__section">
    <header>@@@ IN</header>
    <div class="regex-split-editor__monaco regex-split-editor__monaco--in" bind:this={inContainer}></div>
  </div>
  <div class="regex-split-editor__section regex-split-editor__section--out">
    <header>@@@ OUT</header>
    <div class="regex-split-editor__monaco regex-split-editor__monaco--out" bind:this={outContainer}></div>
  </div>
</section>
