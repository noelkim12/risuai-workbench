<!--
  Asset Manager header and global actions.
  @file packages/webview/src/lib/components/asset-manager/AssetManagerHeader.svelte
-->

<script lang="ts">
  type Tab = 'grid' | 'matrix' | 'vocab' | 'outputs';
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this constant.
  const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'grid', label: 'Grid' },
    { id: 'matrix', label: 'Matrix' },
    { id: 'vocab', label: 'Vocab' },
    { id: 'outputs', label: 'Outputs' },
  ];

  export let artifactName: string;
  export let tab: Tab;
  export let onSelectTab: (tab: Tab) => void;
  export let onRefresh: () => void;
  export let onOpenBootstrap: () => void;
  export let onBuildManifest: () => void;

  $: activeIndex = Math.max(
    0,
    TABS.findIndex((item) => item.id === tab),
  );

  // Measure the active tab so the sliding thumb matches its real position/width,
  // regardless of differing label lengths.
  let tabButtons: HTMLButtonElement[] = [];
  let thumbLeft = 0;
  let thumbWidth = 0;
  $: {
    const el = tabButtons[activeIndex];
    if (el) {
      thumbLeft = el.offsetLeft;
      thumbWidth = el.offsetWidth;
    }
  }
</script>

<header class="asset-manager-header">
  <div>
    <p class="eyebrow">Asset Manager</p>
    <h1>{artifactName || '…'}</h1>
  </div>
  <nav class="asset-manager-header__tabs" aria-label="Asset manager views">
    <span
      class="asset-manager-header__tabs-thumb"
      aria-hidden="true"
      style="transform: translateX({thumbLeft}px); width: {thumbWidth}px;"
    ></span>
    {#each TABS as item, i (item.id)}
      <button
        type="button"
        bind:this={tabButtons[i]}
        class:active={tab === item.id}
        onclick={() => onSelectTab(item.id)}>{item.label}</button
      >
    {/each}
  </nav>
  <div class="asset-manager-header__actions">
    <button
      type="button"
      class="action action--icon"
      onclick={onRefresh}
      title="재스캔"
      aria-label="재스캔"
    >
      <span class="action__icon">⟳</span>
    </button>
    <button type="button" class="action" onclick={onOpenBootstrap} title="vocab과 할당을 자동 생성">
      <span class="action__glyph">✦</span>
      Catalog 생성
    </button>
    <button
      type="button"
      class="action action--primary"
      onclick={onBuildManifest}
      title="catalog merge로 manifest.json 빌드"
    >
      Build
      <span class="action__glyph">▶</span>
    </button>
  </div>
</header>

<style>
  .asset-manager-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .asset-manager-header h1 { margin: 0; font-size: 1.1rem; }
  .asset-manager-header__tabs {
    position: relative;
    display: inline-flex;
    margin-left: auto;
    padding: 3px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--secondary) 70%, transparent);
    isolation: isolate;
  }
  /* Sliding pill that glides beneath the active tab (position/width measured in JS). */
  .asset-manager-header__tabs-thumb {
    position: absolute;
    z-index: -1;
    top: 3px;
    bottom: 3px;
    left: 0;
    border-radius: var(--radius-pill);
    background: var(--accent);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18), 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    transition: transform 0.32s cubic-bezier(0.34, 1.4, 0.5, 1), width 0.32s cubic-bezier(0.34, 1.4, 0.5, 1);
  }
  .asset-manager-header__tabs button {
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--secondary-text);
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.2s ease;
  }
  .asset-manager-header__tabs button:hover:not(.active) {
    color: var(--text);
  }
  .asset-manager-header__tabs button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .asset-manager-header__tabs button.active {
    color: var(--accent-text);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .asset-manager-header__tabs-thumb { transition: none; }
  }

  .asset-manager-header__actions {
    display: flex;
    gap: var(--space-2);
  }
  /* Shared outlined action button. */
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--card) 60%, transparent);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.4;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
  }
  .action:hover {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--card-border));
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .action:active { transform: translateY(1px); }
  .action:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .action__glyph {
    font-size: 0.72rem;
    opacity: 0.85;
  }
  /* Icon-only refresh button — spins on hover. */
  .action--icon {
    padding: var(--space-1);
    width: 1.9rem;
    justify-content: center;
  }
  .action__icon {
    display: inline-block;
    font-size: 0.95rem;
    line-height: 1;
    transition: transform 0.5s cubic-bezier(0.34, 1.2, 0.5, 1);
  }
  .action--icon:hover .action__icon { transform: rotate(180deg); }
  .action--icon:active .action__icon { transform: rotate(360deg); }
  /* Primary build button — filled accent with subtle glow. */
  .action--primary {
    border-color: transparent;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
  .action--primary:hover {
    background: color-mix(in srgb, var(--accent) 88%, #fff);
    border-color: transparent;
    box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .action--primary .action__glyph { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .action__icon { transition: none; }
  }
</style>
