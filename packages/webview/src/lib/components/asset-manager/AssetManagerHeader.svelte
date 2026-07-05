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
</script>

<header class="asset-manager-header">
  <div>
    <p class="eyebrow">Asset Manager</p>
    <h1>{artifactName || '…'}</h1>
  </div>
  <nav class="asset-manager-header__tabs" aria-label="Asset manager views">
    {#each TABS as item (item.id)}
      <button type="button" class:active={tab === item.id} onclick={() => onSelectTab(item.id)}>{item.label}</button>
    {/each}
  </nav>
  <div class="asset-manager-header__actions">
    <button type="button" class="button-secondary" onclick={onRefresh} title="재스캔">⟳</button>
    <button type="button" class="button-secondary" onclick={onOpenBootstrap} title="vocab과 할당을 자동 생성">Catalog 생성</button>
    <button type="button" onclick={onBuildManifest} title="catalog merge로 manifest.json 빌드">Build ▶</button>
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
    display: inline-flex;
    gap: 2px;
    margin-left: auto;
    padding: 3px;
    border: 1px solid var(--card-border);
    border-radius: calc(var(--radius-sm) + 4px);
    background: var(--secondary);
  }
  .asset-manager-header__tabs button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--secondary-text);
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.4;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .asset-manager-header__tabs button:hover:not(.active) {
    background: color-mix(in srgb, var(--secondary-text) 10%, transparent);
    color: var(--text);
  }
  .asset-manager-header__tabs button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .asset-manager-header__tabs button.active {
    background: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .asset-manager-header__actions { display: flex; gap: var(--space-1); }
</style>
