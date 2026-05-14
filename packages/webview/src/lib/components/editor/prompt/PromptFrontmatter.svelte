<!--
  Prompt template frontmatter authoring form.
  @file packages/webview/src/lib/components/editor/prompt/PromptFrontmatter.svelte
-->

<script lang="ts">
  import type { PromptEditorState } from 'risu-workbench-core';
  import type { MainEditorDocumentWarningPayload } from '../../../types/mainEditor';

  type PromptType = 'plain' | 'jailbreak' | 'cot' | 'chatML' | 'persona' | 'description' | 'lorebook' | 'postEverything' | 'memory' | 'authornote' | 'chat' | 'cache';

  const PROMPT_TYPES: readonly PromptType[] = ['plain', 'jailbreak', 'cot', 'chatML', 'persona', 'description', 'lorebook', 'postEverything', 'memory', 'authornote', 'chat', 'cache'];

  export let state: PromptEditorState;
  export let warnings: readonly MainEditorDocumentWarningPayload[];
  export let open: boolean;
  export let onToggleOpen: () => void;
  export let onChange: (state: PromptEditorState) => void;

  $: promptType = isPromptTypeValue(state.type) ? state.type : 'plain';

  function updateField(key: string, value: string): void {
    const nextFrontmatter = { ...state.frontmatter, [key]: value };
    onChange({ ...state, frontmatter: nextFrontmatter, type: key === 'type' ? value : state.type });
  }

  function isPromptTypeValue(value: string | null): value is PromptType {
    return PROMPT_TYPES.some((type: PromptType) => type === value);
  }
</script>

<section class="prompt-frontmatter" aria-label="Prompt metadata">
  <button type="button" class="lorebook-summary-bar" class:lorebook-summary-bar--open={open} aria-expanded={open} aria-controls="prompt-frontmatter-panel" onclick={onToggleOpen}>
    <span class="lorebook-summary-bar__disclosure" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="lorebook-summary-bar__title">{state.frontmatter.name || '.risuprompt item'}</span>
    <span class="lorebook-summary-bar__pill">type: {promptType}</span>
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
    <div id="prompt-frontmatter-panel" class="lorebook-frontmatter__grid">
      <label class="lorebook-frontmatter__field">
        <span>type</span>
        <select value={promptType} onchange={(event) => updateField('type', event.currentTarget.value)}>
          {#each PROMPT_TYPES as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </label>
      <label class="lorebook-frontmatter__field">
        <span>name</span>
        <input type="text" value={state.frontmatter.name ?? ''} oninput={(event) => updateField('name', event.currentTarget.value)} />
      </label>
      {#if promptType === 'plain' || promptType === 'jailbreak' || promptType === 'cot'}
        <label class="lorebook-frontmatter__field">
          <span>type2</span>
          <select value={state.frontmatter.type2 ?? 'main'} onchange={(event) => updateField('type2', event.currentTarget.value)}>
            <option value="normal">normal</option>
            <option value="globalNote">globalNote</option>
            <option value="main">main</option>
          </select>
        </label>
        <label class="lorebook-frontmatter__field">
          <span>role</span>
          <select value={state.frontmatter.role ?? 'system'} onchange={(event) => updateField('role', event.currentTarget.value)}>
            <option value="user">user</option>
            <option value="bot">bot</option>
            <option value="system">system</option>
          </select>
        </label>
      {/if}
      {#if promptType === 'chat'}
        <label class="lorebook-frontmatter__field"><span>range_start</span><input type="text" value={state.frontmatter.range_start ?? '0'} oninput={(event) => updateField('range_start', event.currentTarget.value)} /></label>
        <label class="lorebook-frontmatter__field"><span>range_end</span><input type="text" value={state.frontmatter.range_end ?? 'end'} oninput={(event) => updateField('range_end', event.currentTarget.value)} /></label>
      {/if}
      {#if promptType === 'cache'}
        <label class="lorebook-frontmatter__field"><span>depth</span><input type="text" value={state.frontmatter.depth ?? '4'} oninput={(event) => updateField('depth', event.currentTarget.value)} /></label>
        <label class="lorebook-frontmatter__field"><span>cache_role</span><input type="text" value={state.frontmatter.cache_role ?? 'system'} oninput={(event) => updateField('cache_role', event.currentTarget.value)} /></label>
      {/if}
    </div>
  {/if}
</section>
