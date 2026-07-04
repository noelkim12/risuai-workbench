<!--
  Asset Manager webview 최상위 셸.
  extension host 의 asset-manager/* 메시지를 받아 snapshot/state 를 저장하고,
  Grid/Matrix/Vocab/Outputs 뷰에 props + 콜백을 내려줌. D4/D5 가 뷰 본 구현을 채움.
  @file packages/webview/src/AssetManagerApp.svelte
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { getVsCodeApi } from './lib/vscode';
  import {
    createAssetManagerWebviewMessage,
    isAssetManagerExtensionMessage,
    type AssetCatalogMirror,
    type AssetCatalogOutputsMirror,
    type AssetCatalogSchemaMirror,
    type AssetExpectedMapMirror,
    type AssetManagerAssetEntry,
    type AssetManagerAssignmentChange,
    type AssetManagerTokenizeProposal,
    type AssetManagerWebviewMessage,
    type AssetOutputKind,
    type ImageMetaMirror,
    type LorebookNameCandidateMirror,
  } from './lib/types/assetManager';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import FirstRunSchemaModal from './lib/components/asset-manager/FirstRunSchemaModal.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import GridView from './lib/components/asset-manager/GridView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import MatrixView from './lib/components/asset-manager/MatrixView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import VocabView from './lib/components/asset-manager/VocabView.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import OutputsView from './lib/components/asset-manager/OutputsView.svelte';

  const vscode = getVsCodeApi();

  type Tab = 'grid' | 'matrix' | 'vocab' | 'outputs';

  let tab: Tab = 'grid';
  let stableId = '';
  let artifactName = '';
  let assetsRootUri = '';
  let entries: readonly AssetManagerAssetEntry[] = [];
  let catalog: AssetCatalogMirror | null = null;
  let catalogExists = true;
  let orphanPaths: readonly string[] = [];
  let duplicateNames: readonly string[] = [];
  let status = 'Connecting to extension host…';
  let errorText = '';
  let initialized = false;
  let schemaModalDismissed = false;
  let lorebookCandidates: readonly LorebookNameCandidateMirror[] = [];
  let tokenizeProposals: readonly AssetManagerTokenizeProposal[] = [];
  let tokenizePrefixes: readonly { readonly value: string; readonly count: number }[] = [];
  let tokenizeSuffixes: readonly { readonly value: string; readonly count: number }[] = [];
  let outputsState: {
    promptBlock?: string;
    whitelistRegex?: { inPattern: string; outPattern: string } | null;
    missingReport?: string;
  } = {};
  let buildSummary: { total: number; named: number; unassigned: number; duplicates: number; orphans: number } | null =
    null;
  let metaByPath: Record<string, ImageMetaMirror> = {};
  let readyRetryTimer: ReturnType<typeof setInterval> | undefined;
  let gridPresetQuery: string | null = null;

  $: suggestThreeSlots = entriesLookThreeSlot(entries);
  $: showSchemaModal = initialized && !catalogExists && !schemaModalDismissed;

  function entriesLookThreeSlot(current: readonly AssetManagerAssetEntry[]): boolean {
    const sample = current.slice(0, 200);
    if (sample.length === 0) return false;
    const threeish = sample.filter((entry) => entry.fileStem.split(/[\s_]+/).length >= 3).length;
    return threeish / sample.length > 0.7;
  }

  function post(message: AssetManagerWebviewMessage): void {
    vscode?.postMessage(message);
  }

  function applySnapshot(payload: {
    entries: readonly AssetManagerAssetEntry[];
    catalog: AssetCatalogMirror;
    catalogExists: boolean;
    orphanPaths: readonly string[];
    duplicateNames: readonly string[];
  }): void {
    entries = payload.entries;
    catalog = payload.catalog;
    catalogExists = payload.catalogExists;
    orphanPaths = payload.orphanPaths;
    duplicateNames = payload.duplicateNames;
    status = `${entries.length} assets · 미할당 ${entries.filter((entry) => entry.flags.unassigned).length} · orphan ${orphanPaths.length}`;
  }

  function handleMessage(event: MessageEvent): void {
    const message: unknown = event.data;
    if (!isAssetManagerExtensionMessage(message)) return;
    errorText = '';
    switch (message.type) {
      case 'asset-manager/assetsLoaded': {
        initialized = true;
        stableId = message.payload.stableId;
        artifactName = message.payload.artifactName;
        assetsRootUri = message.payload.assetsRootWebviewUri;
        applySnapshot(message.payload);
        return;
      }
      case 'asset-manager/catalogSaved':
        applySnapshot(message.payload);
        return;
      case 'asset-manager/lorebookNamesResult':
        lorebookCandidates = message.payload.candidates;
        return;
      case 'asset-manager/tokenizeResult':
        tokenizeProposals = message.payload.proposals;
        tokenizePrefixes = message.payload.prefixes;
        tokenizeSuffixes = message.payload.suffixes;
        return;
      case 'asset-manager/imageMetaResult':
        metaByPath = { ...metaByPath, [message.payload.path]: message.payload.meta };
        return;
      case 'asset-manager/outputsResult':
        outputsState = {
          promptBlock: message.payload.promptBlock ?? outputsState.promptBlock,
          whitelistRegex:
            message.payload.whitelistRegex !== undefined ? message.payload.whitelistRegex : outputsState.whitelistRegex,
          missingReport: message.payload.missingReport ?? outputsState.missingReport,
        };
        return;
      case 'asset-manager/outputSaved':
        status = `저장됨: ${message.payload.savedPath}`;
        return;
      case 'asset-manager/manifestBuilt':
        buildSummary = {
          total: message.payload.total,
          named: message.payload.named,
          unassigned: message.payload.unassigned,
          duplicates: message.payload.duplicates.length,
          orphans: message.payload.orphanPaths.length,
        };
        status = `manifest 빌드 완료 · ${message.payload.total} entries (curated ${message.payload.named})`;
        return;
      case 'asset-manager/error':
        errorText = `${message.payload.context}: ${message.payload.message}`;
        return;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    post(createAssetManagerWebviewMessage('asset-manager/ready', {}));
    readyRetryTimer = setInterval(() => {
      if (initialized) {
        clearInterval(readyRetryTimer);
        return;
      }
      post(createAssetManagerWebviewMessage('asset-manager/ready', {}));
    }, 500);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (readyRetryTimer) clearInterval(readyRetryTimer);
    };
  });

  // ---- 뷰 콜백 (모든 postMessage는 여기 한 곳에서) ----
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes these callbacks.
  const onRefresh = () => post(createAssetManagerWebviewMessage('asset-manager/refreshAssets', { stableId }));
  const onUpdateAssignments = (changes: AssetManagerAssignmentChange[]) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateAssignments', { stableId, changes }));
  const onUpdateVocab = (vocab: AssetCatalogMirror['vocab']) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateVocab', { stableId, vocab }));
  const onUpdateSchema = (schema: AssetCatalogSchemaMirror, outputs?: AssetCatalogOutputsMirror) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateSchema', { stableId, schema, ...(outputs && { outputs }) }));
  const onUpdateExpected = (expected: AssetExpectedMapMirror) =>
    post(createAssetManagerWebviewMessage('asset-manager/updateExpected', { stableId, expected }));
  const onAnalyzeLorebook = () =>
    post(createAssetManagerWebviewMessage('asset-manager/analyzeLorebookNames', { stableId }));
  const onBootstrap = () =>
    post(createAssetManagerWebviewMessage('asset-manager/bootstrapFromFilenames', { stableId }));
  const onReadMeta = (path: string) =>
    post(createAssetManagerWebviewMessage('asset-manager/readImageMeta', { stableId, path }));
  const onGenerateOutputs = (kinds: AssetOutputKind[]) =>
    post(createAssetManagerWebviewMessage('asset-manager/generateOutputs', { stableId, kinds }));
  const onSaveOutput = (kind: AssetOutputKind, targetPath: string, content: string) =>
    post(createAssetManagerWebviewMessage('asset-manager/saveOutput', { stableId, kind, targetPath, content }));
  const onBuildManifest = () => post(createAssetManagerWebviewMessage('asset-manager/buildManifest', { stableId }));

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function jumpToCombo(values: string[]): void {
    gridPresetQuery = values.filter(Boolean).join(' ');
    tab = 'grid';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function assetImageSrc(path: string): string {
    return `${assetsRootUri}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  function confirmSchema(schema: AssetCatalogSchemaMirror): void {
    schemaModalDismissed = true;
    onUpdateSchema(schema);
  }
</script>

<main class="asset-manager" aria-label="Risu Asset Manager">
  <header class="asset-manager__header">
    <div>
      <p class="eyebrow">Asset Manager</p>
      <h1>{artifactName || '…'}</h1>
    </div>
    <nav class="asset-manager__tabs" aria-label="Asset manager views">
      {#each [['grid', 'Grid'], ['matrix', 'Matrix'], ['vocab', 'Vocab'], ['outputs', 'Outputs']] as [id, label] (id)}
        <button type="button" class:active={tab === id} onclick={() => (tab = id as Tab)}>{label}</button>
      {/each}
    </nav>
    <div class="asset-manager__actions">
      <button type="button" class="button-secondary" onclick={onRefresh} title="재스캔">⟳</button>
      <button type="button" onclick={onBuildManifest} title="catalog merge로 manifest.json 빌드">Build ▶</button>
    </div>
  </header>

  <p class="asset-manager__status">{status}</p>
  {#if errorText}<p class="asset-manager__error" role="alert">{errorText}</p>{/if}

  {#if catalog}
    {#if tab === 'grid'}
      <GridView
        {entries}
        {catalog}
        {orphanPaths}
        {tokenizeProposals}
        {metaByPath}
        {assetImageSrc}
        {onUpdateAssignments}
        {onBootstrap}
        {onReadMeta}
        presetQuery={gridPresetQuery}
      />
    {:else if tab === 'matrix'}
      <MatrixView {catalog} {onUpdateExpected} onJumpToCombo={jumpToCombo} />
    {:else if tab === 'vocab'}
      <VocabView
        {catalog}
        {lorebookCandidates}
        {tokenizePrefixes}
        {tokenizeSuffixes}
        {onUpdateVocab}
        {onUpdateSchema}
        {onAnalyzeLorebook}
        {onBootstrap}
      />
    {:else}
      <OutputsView {catalog} {outputsState} {buildSummary} {onGenerateOutputs} {onSaveOutput} {onBuildManifest} />
    {/if}
  {:else}
    <p class="asset-manager__loading">Loading assets…</p>
  {/if}

  {#if showSchemaModal}
    <FirstRunSchemaModal
      {suggestThreeSlots}
      onConfirm={confirmSchema}
      onSkip={() => (schemaModalDismissed = true)}
    />
  {/if}
</main>

<style>
  .asset-manager {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: var(--space-3);
    gap: var(--space-2);
    box-sizing: border-box;
  }
  .asset-manager__header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .asset-manager__header h1 { margin: 0; font-size: 1.1rem; }
  .asset-manager__tabs { display: flex; gap: 4px; margin-left: auto; }
  .asset-manager__tabs button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--secondary);
    color: var(--secondary-text);
  }
  .asset-manager__tabs button.active { background: var(--accent); color: var(--accent-text); border-color: transparent; }
  .asset-manager__actions { display: flex; gap: var(--space-1); }
  .asset-manager__status { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .asset-manager__error { margin: 0; color: var(--vscode-errorForeground, #f66); }
  .asset-manager__loading { color: var(--secondary-text); }
</style>
