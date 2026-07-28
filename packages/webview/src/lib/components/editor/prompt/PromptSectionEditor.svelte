<!--
  Monaco-backed prompt section editor with type-aware tabs.
  @file packages/webview/src/lib/components/editor/prompt/PromptSectionEditor.svelte
-->

<script lang="ts">
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
  import type { PromptEditorState } from '@risuai-workbench/core';
  import { onDestroy, onMount } from 'svelte';
  import { MAIN_EDITOR_CBS_LANGUAGE_ID, retainMainEditorCbsLanguage } from '../../../monaco/mainEditorCbsLanguage';
  import { createMainEditorContentVersionCounter, createMainEditorSectionController, type MainEditorContentVersionCounter, type MainEditorSectionController } from '../../../monaco/mainEditorSectionController';

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
  let controller: MainEditorSectionController | undefined;
  const contentVersionCounter: MainEditorContentVersionCounter = createMainEditorContentVersionCounter();

  $: rule = isPromptType(state.type) ? getPromptTypeRule(state.type) : getPromptTypeRule('plain');
  $: allowedSections = rule.allowedSections;
  $: if (allowedSections.length > 0 && !allowedSections.includes(activeSection)) onActiveSectionChange(allowedSections[0]);
  $: activeText = state.sections[activeSection] ?? '';

  onMount(() => {
    controller = createMainEditorSectionController({
      container,
      initialValue: activeText,
      languageId: MAIN_EDITOR_CBS_LANGUAGE_ID,
      modelUri: `${documentUri}#${activeSection}`,
      onChange: (value) => onSectionChange(activeSection, value),
      onContentVersionChange,
      contentVersionCounter,
      retainLanguage: () => retainMainEditorCbsLanguage(monaco),
    });
  });

  onDestroy(() => {
    controller?.dispose();
  });

  $: controller?.syncExternalValue(activeText);

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
