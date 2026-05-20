<!--
  Monaco-backed split editor for .risuregex IN and OUT sections.
  @file packages/webview/src/lib/components/editor/regex/RegexSplitEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import { onDestroy, onMount } from 'svelte';
  import { MAIN_EDITOR_CBS_LANGUAGE_ID, retainMainEditorCbsLanguage } from '../../../monaco/mainEditorCbsLanguage';
  import { createMainEditorContentVersionCounter, createMainEditorSectionController, type MainEditorContentVersionCounter, type MainEditorSectionController } from '../../../monaco/mainEditorSectionController';

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
  let inController: MainEditorSectionController | undefined;
  let outController: MainEditorSectionController | undefined;
  const contentVersionCounter: MainEditorContentVersionCounter = createMainEditorContentVersionCounter();

  onMount(() => {
    inController = createMainEditorSectionController({
      container: inContainer,
      initialValue: inText,
      languageId: 'plaintext',
      modelUri: `${documentUri}#IN`,
      onChange: onInChange,
      onContentVersionChange,
      contentVersionCounter,
    });
    outController = createMainEditorSectionController({
      container: outContainer,
      initialValue: outText,
      languageId: MAIN_EDITOR_CBS_LANGUAGE_ID,
      modelUri: `${documentUri}#OUT`,
      onChange: onOutChange,
      onContentVersionChange,
      contentVersionCounter,
      retainLanguage: () => retainMainEditorCbsLanguage(monaco),
    });
  });

  onDestroy(() => {
    inController?.dispose();
    outController?.dispose();
  });

  $: inController?.syncExternalValue(inText);
  $: outController?.syncExternalValue(outText);
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
