<!--
  Regex frontmatter authoring form.
  @file packages/webview/src/lib/components/editor/regex/RegexFrontmatter.svelte
-->

<script lang="ts">
  import type { RegexEditorState } from 'risu-workbench-core';
  import type { MainEditorDocumentWarningPayload } from '../../../types/mainEditor';

  export let state: RegexEditorState;
  export let warnings: readonly MainEditorDocumentWarningPayload[];
  export let open: boolean;
  export let onToggleOpen: () => void;
  export let onChange: (state: RegexEditorState) => void;

  const REGEX_TYPES = ['editinput', 'editoutput', 'editdisplay', 'editprocess', 'edittrans', 'disabled'];

  function updateFrontmatterField(key: 'comment' | 'flag' | 'type', value: string): void {
    onChange({
      ...state,
      frontmatter: {
        ...state.frontmatter,
        [key]: value,
      },
    });
  }
</script>

<section class="regex-frontmatter" aria-label="Regex metadata">
  <button type="button" class="lorebook-summary-bar" class:lorebook-summary-bar--open={open} aria-expanded={open} aria-controls="regex-frontmatter-panel" onclick={onToggleOpen}>
    <span class="lorebook-summary-bar__disclosure" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="lorebook-summary-bar__title">{state.frontmatter.comment || 'Untitled regex rule'}</span>
    <span class="lorebook-summary-bar__pill">type: {state.frontmatter.type || 'editprocess'}</span>
    <span class="lorebook-summary-bar__pill">flag: {state.frontmatter.flag || 'none'}</span>
    <span class="lorebook-summary-bar__toggle">{open ? 'Hide details' : 'Show details'}</span>
  </button>

  {#if warnings.length > 0}
    <div class="lorebook-frontmatter__warnings" role="status" aria-live="polite">
      <strong>Document warnings</strong>
      <ul>
        {#each warnings as warning}
          <li>{warning.severity}: {warning.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if open}
    <div id="regex-frontmatter-panel" class="lorebook-frontmatter__grid">
      <label class="lorebook-frontmatter__field">
        <span>comment</span>
        <input type="text" value={state.frontmatter.comment ?? ''} oninput={(event) => updateFrontmatterField('comment', event.currentTarget.value)} />
      </label>
      <label class="lorebook-frontmatter__field">
        <span>type</span>
        <select value={state.frontmatter.type ?? 'editprocess'} onchange={(event) => updateFrontmatterField('type', event.currentTarget.value)}>
          {#each REGEX_TYPES as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </label>
      <label class="lorebook-frontmatter__field">
        <span>flag</span>
        <input type="text" value={state.frontmatter.flag ?? ''} oninput={(event) => updateFrontmatterField('flag', event.currentTarget.value)} />
      </label>
    </div>
  {/if}
</section>
