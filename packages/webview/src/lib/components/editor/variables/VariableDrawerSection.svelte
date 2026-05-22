<!--
  Collapsible variable drawer section.
  @file packages/webview/src/lib/components/editor/variables/VariableDrawerSection.svelte
-->

<script lang="ts">
  export let title: string;
  export let open: boolean;
  export let count: number | undefined = undefined;
  export let description: string;
  export let onToggle: () => void;
  export let actionLabel: string | undefined = undefined;
  export let onAction: (() => void) | undefined = undefined;

  /**
   * handleToggle 함수.
   * section header 전체 click/keyboard activation을 collapsible toggle로 연결함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this section header handler.
  function handleToggle(): void {
    onToggle();
  }
</script>

<section class="variable-drawer-section">
  <button type="button" class="variable-drawer-section__header" aria-expanded={open} onclick={handleToggle}>
    <span>{open ? '▾' : '▸'} {title}</span>
    {#if count !== undefined}<strong>{count}</strong>{/if}
  </button>
  <div class="variable-drawer-section__body" class:variable-drawer-section__body--open={open} aria-hidden={!open}>
    <div class="variable-drawer-section__body-inner">
      <p class="variable-drawer__muted">{description}</p>
      {#if actionLabel && onAction}
        <button type="button" class="variable-drawer__profile-action" onclick={onAction}>{actionLabel}</button>
      {/if}
      <slot />
    </div>
  </div>
</section>
