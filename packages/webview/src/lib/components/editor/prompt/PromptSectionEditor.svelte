<!--
  Monaco-backed prompt section editor with type-aware tabs.
  @file packages/webview/src/lib/components/editor/prompt/PromptSectionEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
  import type { PromptEditorState } from 'risu-workbench-core';
  import { onDestroy, onMount } from 'svelte';
  import { MAIN_EDITOR_CBS_LANGUAGE_ID, retainMainEditorCbsLanguage } from '../../../monaco/mainEditorCbsLanguage';
  import { createWorkbenchMonacoEditorOptions, registerMainEditorFindShortcut, retainWorkbenchMonacoThemeSync, syncMonacoModelValuePreservingViewState } from '../../../monaco/mainEditorWorkbenchTheme';

  type PromptType = 'plain' | 'jailbreak' | 'cot' | 'chatML' | 'persona' | 'description' | 'lorebook' | 'postEverything' | 'memory' | 'authornote' | 'chat' | 'cache';
  type PromptSectionName = 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT';

  interface PromptTypeRule {
    allowedSections: PromptSectionName[];
    sectionless: boolean;
  }

  const PROMPT_TYPES: readonly PromptType[] = ['plain', 'jailbreak', 'cot', 'chatML', 'persona', 'description', 'lorebook', 'postEverything', 'memory', 'authornote', 'chat', 'cache'];

  export let documentUri: string;
  export let state: PromptEditorState;
  export let activeSection: PromptSectionName = 'TEXT';
  export let onActiveSectionChange: (section: PromptSectionName) => void;
  export let onSectionChange: (section: PromptSectionName, value: string) => void;
  export let onContentVersionChange: (contentVersion: number) => void;

  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let model: monaco.editor.ITextModel | undefined;
  let subscription: monaco.IDisposable | undefined;
  let themeSyncDisposable: monaco.IDisposable | undefined;
  let cbsLanguageDisposable: monaco.IDisposable | undefined;
  let findShortcutDisposable: monaco.IDisposable | undefined;
  let applyingExternalValue = false;
  let localContentVersion = 0;

  $: rule = isPromptType(state.type) ? getPromptTypeRule(state.type) : getPromptTypeRule('plain');
  $: allowedSections = rule.allowedSections;
  $: if (allowedSections.length > 0 && !allowedSections.includes(activeSection)) onActiveSectionChange(allowedSections[0]);
  $: activeText = state.sections[activeSection] ?? '';

  const monacoGlobal = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };

  monacoGlobal.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };

  onMount(() => {
    themeSyncDisposable = retainWorkbenchMonacoThemeSync();
    cbsLanguageDisposable = retainMainEditorCbsLanguage(monaco);
    model = monaco.editor.createModel(activeText, MAIN_EDITOR_CBS_LANGUAGE_ID, monaco.Uri.parse(`${documentUri}#${activeSection}`));
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
      onSectionChange(activeSection, model.getValue());
    });
  });

  onDestroy(() => {
    subscription?.dispose();
    themeSyncDisposable?.dispose();
    cbsLanguageDisposable?.dispose();
    findShortcutDisposable?.dispose();
    editor?.dispose();
    model?.dispose();
  });

  $: if (model && activeText !== model.getValue()) {
    applyingExternalValue = true;
    syncMonacoModelValuePreservingViewState(editor, model, activeText);
    applyingExternalValue = false;
  }

  function isPromptType(value: unknown): value is PromptType {
    return typeof value === 'string' && PROMPT_TYPES.some((type: PromptType) => type === value);
  }

  function getPromptTypeRule(type: PromptType): PromptTypeRule {
    switch (type) {
      case 'plain':
      case 'jailbreak':
      case 'cot':
      case 'chatML':
        return { allowedSections: ['TEXT'], sectionless: false };
      case 'persona':
      case 'description':
      case 'lorebook':
      case 'postEverything':
      case 'memory':
        return { allowedSections: ['INNER_FORMAT'], sectionless: false };
      case 'authornote':
        return { allowedSections: ['INNER_FORMAT', 'DEFAULT_TEXT'], sectionless: false };
      case 'chat':
      case 'cache':
        return { allowedSections: [], sectionless: true };
    }
  }
</script>

<section class="prompt-section-editor" aria-label="Prompt sections">
  {#if rule.sectionless}
    <div class="prompt-section-editor__guidance">
      <strong>Sectionless prompt</strong>
      <p>{state.type === 'chat' ? 'chat uses range_start/range_end to select chat history and has no editable section body.' : 'cache uses cache metadata and has no editable section body.'}</p>
    </div>
  {:else}
    <div class="trace-panel__tabs" role="tablist" aria-label="Prompt section tabs">
      {#each allowedSections as section}
        <button type="button" class:active={activeSection === section} onclick={() => onActiveSectionChange(section)}>{section}</button>
      {/each}
    </div>
    <div class="prompt-section-editor__monaco" bind:this={container}></div>
  {/if}
</section>
