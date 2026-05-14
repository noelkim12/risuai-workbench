<!--
  Lorebook collapsed metadata summary bar.
  @file packages/webview/src/lib/components/editor/lorebook/LorebookSummaryBar.svelte
-->

<script lang="ts">
  import type { LorebookSummary } from './lorebookAuthoringTypes';

  export let summary: LorebookSummary;
  export let open: boolean;
  export let controlsId: string | undefined = undefined;
  export let onToggle: () => void;
</script>

<button type="button" class="lorebook-summary-bar" class:lorebook-summary-bar--open={open} aria-expanded={open} aria-controls={controlsId} onclick={onToggle}>
  <span class="lorebook-summary-bar__disclosure" aria-hidden="true">{open ? '▾' : '▸'}</span>
  <span class="lorebook-summary-bar__title">{summary.title}</span>
  <span class="lorebook-summary-bar__pill">mode: {summary.mode}</span>
  <span class="lorebook-summary-bar__pill">keys: {summary.keyCount}</span>
  <span class="lorebook-summary-bar__pill">secondary: {summary.secondaryKeyCount}</span>
  {#each summary.booleanBadges as badge}
    <span class="lorebook-summary-bar__pill">{badge}</span>
  {/each}
  <span class="lorebook-summary-bar__toggle">{open ? 'Hide details' : 'Show details'}</span>
</button>
