<!--
  Monaco-backed full-file editor for .risuhtml source.
  @file packages/webview/src/lib/components/editor/html/HtmlSourceEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
  import { onDestroy, onMount } from 'svelte';
  import { createWorkbenchMonacoEditorOptions, registerMainEditorFindShortcut, retainWorkbenchMonacoThemeSync, syncMonacoModelValuePreservingViewState } from '../../../monaco/mainEditorWorkbenchTheme';

  export let documentUri: string;
  export let contentText: string;
  export let onChange: (contentText: string) => void;
  export let onContentVersionChange: (contentVersion: number) => void;

  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let model: monaco.editor.ITextModel | undefined;
  let subscription: monaco.IDisposable | undefined;
  let themeSyncDisposable: monaco.IDisposable | undefined;
  let findShortcutDisposable: monaco.IDisposable | undefined;
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
    model = monaco.editor.createModel(contentText, 'html', monaco.Uri.parse(`${documentUri}#FULL`));
    editor = monaco.editor.create(container, {
      ...createWorkbenchMonacoEditorOptions(),
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
    });
    findShortcutDisposable = registerMainEditorFindShortcut(editor);
    subscription = model.onDidChangeContent(() => {
      if (!model || applyingExternalValue) return;
      localContentVersion += 1;
      onContentVersionChange(localContentVersion);
      onChange(model.getValue());
    });
  });

  onDestroy(() => {
    subscription?.dispose();
    themeSyncDisposable?.dispose();
    findShortcutDisposable?.dispose();
    editor?.dispose();
    model?.dispose();
  });

  $: if (model && contentText !== model.getValue()) {
    applyingExternalValue = true;
    syncMonacoModelValuePreservingViewState(editor, model, contentText);
    applyingExternalValue = false;
  }
</script>

<div class="html-source-editor" bind:this={container} aria-label="HTML source editor"></div>
