<!--
  Monaco-backed full-file editor for .risuhtml source.
  @file packages/webview/src/lib/components/editor/html/HtmlSourceEditor.svelte
-->

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createMainEditorSectionController, type MainEditorSectionController } from '../../../monaco/mainEditorSectionController';

  export let documentUri: string;
  export let contentText: string;
  export let onChange: (contentText: string) => void;
  export let onContentVersionChange: (contentVersion: number) => void;

  let container: HTMLDivElement;
  let controller: MainEditorSectionController | undefined;

  onMount(() => {
    controller = createMainEditorSectionController({
      container,
      initialValue: contentText,
      languageId: 'html',
      modelUri: `${documentUri}#FULL`,
      onChange,
      onContentVersionChange,
    });
  });

  onDestroy(() => {
    controller?.dispose();
  });

  $: controller?.syncExternalValue(contentText);
</script>

<div class="html-source-editor" bind:this={container} aria-label="HTML source editor"></div>
