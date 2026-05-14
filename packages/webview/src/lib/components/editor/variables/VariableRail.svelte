<!--
  Thin rail button that opens the main editor variable drawer.
  @file packages/webview/src/lib/components/editor/variables/VariableRail.svelte
-->

<script lang="ts">
  export let open: boolean;
  export let hidden = false;
  export let usedCount: number;
  export let missingCount: number;
  export let runtimeUnknownCount: number;
  export let onToggle: () => void;
</script>

<aside class="main-editor-variable-rail" aria-label="Variables rail" aria-hidden={hidden}>
  <button type="button" class="main-editor-variable-rail__button" aria-expanded={open} tabindex={hidden ? -1 : 0} onclick={onToggle}>
    <span>Variables</span>
    <strong>{usedCount}</strong>
    {#if missingCount > 0 || runtimeUnknownCount > 0}
      <small>{missingCount} missing · {runtimeUnknownCount} runtime</small>
    {/if}
  </button>
</aside>
