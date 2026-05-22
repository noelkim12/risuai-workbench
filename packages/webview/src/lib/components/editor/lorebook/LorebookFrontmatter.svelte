<!--
  Lorebook frontmatter and key authoring form.
  @file packages/webview/src/lib/components/editor/lorebook/LorebookFrontmatter.svelte
-->

<script lang="ts">
  import type { LorebookEditorState } from 'risu-workbench-core';
  import type { MainEditorDocumentWarningPayload } from '../../../types/mainEditor';
  import LorebookSummaryBar from './LorebookSummaryBar.svelte';
  import {
    LOREBOOK_BOOLEAN_FIELDS,
    LOREBOOK_TEXT_FIELDS,
    buildLorebookSummary,
    type LorebookBooleanFieldKey,
    type LorebookTextFieldKey,
  } from './lorebookAuthoringTypes';

  export let state: LorebookEditorState;
  export let warnings: readonly MainEditorDocumentWarningPayload[];
  export let open: boolean;
  export let onToggleOpen: () => void;
  export let onChange: (state: LorebookEditorState) => void;

  $: summary = buildLorebookSummary(state);

  /**
   * updateFrontmatterField 함수.
   * exposed frontmatter field 한 개를 local state intent에 반영함.
   *
   * @param key - 갱신할 frontmatter key
   * @param value - 다음 field 값
   */
  function updateFrontmatterField(key: LorebookTextFieldKey | LorebookBooleanFieldKey, value: string): void {
    onChange({
      ...state,
      frontmatter: {
        ...state.frontmatter,
        [key]: value,
      },
    });
  }

  /**
   * updateTextArea 함수.
   * KEYS/SECONDARY_KEYS textarea 변경을 structured state에 반영함.
   *
   * @param field - textarea가 갱신할 state field
   * @param value - textarea 원문
   */
  function updateTextArea(field: 'keysText' | 'secondaryKeysText', value: string): void {
    onChange({
      ...state,
      [field]: value,
      hasSecondaryKeysSection: field === 'secondaryKeysText' ? true : state.hasSecondaryKeysSection,
    });
  }
</script>

<section class="lorebook-frontmatter" aria-label="Lorebook metadata and keys">
  <LorebookSummaryBar {summary} {open} controlsId="lorebook-frontmatter-panel" onToggle={onToggleOpen} />

  {#if warnings.length > 0}
    <div class="lorebook-frontmatter__warnings" role="status" aria-live="polite">
      <strong>Document warnings</strong>
      <ul>
        {#each warnings as warning}
          <li>
            <span>{warning.severity}: {warning.message}</span>
            {#if warning.sectionName}<span> section={warning.sectionName}</span>{/if}
            {#if warning.fieldName}<span> field={warning.fieldName}</span>{/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if open}
    <div id="lorebook-frontmatter-panel" class="lorebook-frontmatter__body">
      <div class="lorebook-frontmatter__grid">
        {#each LOREBOOK_TEXT_FIELDS as field}
          <label class="lorebook-frontmatter__field">
            <span>{field.label}</span>
            {#if field.inputKind === 'select'}
              <select
                value={state.frontmatter[field.key] ?? ''}
                onchange={(event) => updateFrontmatterField(field.key, event.currentTarget.value)}
              >
                {#each field.options ?? [] as option}
                  <option value={option}>{option}</option>
                {/each}
                {#if state.frontmatter[field.key] && !(field.options ?? []).includes(state.frontmatter[field.key])}
                  <option value={state.frontmatter[field.key]}>{state.frontmatter[field.key]}</option>
                {/if}
              </select>
            {:else}
              <input
                type="text"
                value={state.frontmatter[field.key] ?? ''}
                oninput={(event) => updateFrontmatterField(field.key, event.currentTarget.value)}
              />
            {/if}
          </label>
        {/each}
      </div>

      <div class="lorebook-frontmatter__booleans" aria-label="Lorebook boolean fields">
        {#each LOREBOOK_BOOLEAN_FIELDS as field}
          <label>
            <input
              type="checkbox"
              checked={state.frontmatter[field.key] === 'true'}
              onchange={(event) => updateFrontmatterField(field.key, event.currentTarget.checked ? 'true' : 'false')}
            />
            <span>{field.label}</span>
          </label>
        {/each}
      </div>

      <label class="lorebook-frontmatter__field lorebook-frontmatter__field--wide">
        <span>KEYS</span>
        <textarea
          class="lorebook-frontmatter__textarea"
          value={state.keysText}
          oninput={(event) => updateTextArea('keysText', event.currentTarget.value)}
          spellcheck="false"
        ></textarea>
      </label>

      <label class="lorebook-frontmatter__field lorebook-frontmatter__field--wide">
        <span>SECONDARY_KEYS</span>
        <textarea
          class="lorebook-frontmatter__textarea"
          value={state.secondaryKeysText}
          oninput={(event) => updateTextArea('secondaryKeysText', event.currentTarget.value)}
          spellcheck="false"
        ></textarea>
      </label>
    </div>
  {/if}
</section>
