<!--
  Frontmatter disclosure summary bar shared by authoring frontmatter forms.
  @file packages/webview/src/lib/components/editor/shared/FrontmatterSummaryBar.svelte
-->

<script lang="ts">
  export let title: string;
  export let pills: readonly string[];
  export let open: boolean;
  export let controlsId: string | undefined = undefined;
  export let onToggle: () => void;
  export let className = '';
</script>

<button
  type="button"
  class={`lorebook-summary-bar${className ? ` ${className}` : ''}`}
  class:lorebook-summary-bar--open={open}
  aria-expanded={open}
  aria-controls={controlsId}
  onclick={onToggle}
>
  <span class="lorebook-summary-bar__disclosure" aria-hidden="true">{open ? '▾' : '▸'}</span>
  <span class="lorebook-summary-bar__title">{title}</span>
  {#each pills as pill}
    <span class="lorebook-summary-bar__pill">{pill}</span>
  {/each}
  <span class="lorebook-summary-bar__toggle">{open ? 'Hide details' : 'Show details'}</span>
</button>
