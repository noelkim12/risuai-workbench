<script lang="ts">
  import { onMount } from 'svelte';
  import { getVsCodeApi } from './lib/vscode';
  import {
    createAssetManagerWebviewMessage,
    isAssetManagerExtensionMessage,
    type AssetCatalogMirror,
    type AssetCatalogBootstrapGroupSummaryMirror,
    type AssetCatalogBootstrapSplitOptions,
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
  import { filterEntriesByCombo } from './lib/asset-manager/gridModel';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import AssetDetailModal from './lib/components/asset-manager/AssetDetailModal.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import AssetManagerHeader from './lib/components/asset-manager/AssetManagerHeader.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import CatalogBootstrapModal from './lib/components/asset-manager/CatalogBootstrapModal.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import ComboAssetsModal from './lib/components/asset-manager/ComboAssetsModal.svelte';
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
  type CatalogBootstrapSource = 'manifest' | 'filename';
  type CatalogBootstrapMode = 'full' | 'missing';

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
  // Matrix 셀 클릭 → 콤보 에셋 모달 (undefined = 와일드카드 슬롯)
  let comboValues: readonly (string | undefined)[] | null = null;
  let comboDetailIndex: number | null = null;
  let showBootstrapModal = false;
  let firstRunOpened = false;
  let bootstrapPreviewRows: readonly { readonly path: string; readonly name: string; readonly slots: AssetCatalogMirror['assignments'][string] | null }[] = [];
  let bootstrapGroups: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [];

  // catalog가 없으면 FirstRunSchemaModal 대신 Catalog 생성 모달을 바로 띄운다(불필요한 단계 축소).
  $: if (initialized && !catalogExists && !schemaModalDismissed && !firstRunOpened) {
    firstRunOpened = true;
    showBootstrapModal = true;
  }
  $: comboEntries = comboValues ? filterEntriesByCombo(entries, comboValues) : [];
  $: comboLabel = comboValues ? comboValues.map((value) => value ?? '*').join(' / ') : '';
  $: comboDetailEntry = comboDetailIndex === null ? null : (comboEntries[comboDetailIndex] ?? null);

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
      case 'asset-manager/catalogBootstrapPreview':
        bootstrapPreviewRows = message.payload.rows;
        bootstrapGroups = message.payload.groups;
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

  function selectTab(nextTab: Tab): void {
    tab = nextTab;
  }

  function runCatalogBootstrap(
    source: CatalogBootstrapSource,
    mode: CatalogBootstrapMode,
    split?: AssetCatalogBootstrapSplitOptions,
    schema?: AssetCatalogSchemaMirror,
  ): void {
    showBootstrapModal = false;
    schemaModalDismissed = true;
    status = `Catalog 생성 중 · ${source === 'manifest' ? 'manifest' : 'file name'} / ${mode === 'full' ? '전체 재생성' : '누락항목 생성'}`;
    post(createAssetManagerWebviewMessage('asset-manager/bootstrapCatalog', { stableId, source, mode, ...(split && { split }), ...(schema && { schema }) }));
  }

  function previewCatalogBootstrap(
    source: CatalogBootstrapSource,
    mode: CatalogBootstrapMode,
    split?: AssetCatalogBootstrapSplitOptions,
    schema?: AssetCatalogSchemaMirror,
  ): void {
    post(createAssetManagerWebviewMessage('asset-manager/previewCatalogBootstrap', { stableId, source, mode, ...(split && { split }), ...(schema && { schema }) }));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function jumpToCombo(values: string[]): void {
    gridPresetQuery = values.filter(Boolean).join(' ');
    tab = 'grid';
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function openCombo(values: (string | undefined)[]): void {
    comboValues = values;
    comboDetailIndex = null;
  }

  function closeCombo(): void {
    comboValues = null;
    comboDetailIndex = null;
  }

  function comboJumpToGrid(): void {
    if (!comboValues) return;
    jumpToCombo(comboValues.filter((value): value is string => value !== undefined));
    closeCombo();
  }

  function openComboDetail(path: string): void {
    const index = comboEntries.findIndex((item) => item.path === path);
    if (index < 0) return;
    comboDetailIndex = index;
    if (!metaByPath[path]) onReadMeta(path);
  }

  function moveComboDetail(delta: number): void {
    if (comboDetailIndex === null || comboEntries.length === 0) return;
    // 콤보 부분집합 내에서 순환 탐색
    const next = (comboDetailIndex + delta + comboEntries.length) % comboEntries.length;
    comboDetailIndex = next;
    const item = comboEntries[next];
    if (item && !metaByPath[item.path]) onReadMeta(item.path);
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function assetImageSrc(path: string): string {
    return `${assetsRootUri}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

</script>

<main class="asset-manager" aria-label="Risu Asset Manager">
  <AssetManagerHeader
    {artifactName}
    {tab}
    onSelectTab={selectTab}
    {onRefresh}
    onOpenBootstrap={() => (showBootstrapModal = true)}
    {onBuildManifest}
  />

  <p class="asset-manager__status">{status}</p>
  {#if errorText}<p class="asset-manager__error" role="alert">{errorText}</p>{/if}

  {#if catalog}
    {#if tab === 'grid'}
      <GridView {entries} {catalog} {orphanPaths} {tokenizeProposals} {metaByPath} {assetImageSrc} {onUpdateAssignments} {onBootstrap} {onReadMeta} presetQuery={gridPresetQuery} />
    {:else if tab === 'matrix'}
      <MatrixView {catalog} {onUpdateExpected} onOpenCombo={openCombo} />
    {:else if tab === 'vocab'}
      <VocabView {catalog} {lorebookCandidates} {tokenizePrefixes} {tokenizeSuffixes} {onUpdateVocab} {onUpdateSchema} {onAnalyzeLorebook} {onBootstrap} />
    {:else}
      <OutputsView {catalog} {outputsState} {buildSummary} {onGenerateOutputs} {onSaveOutput} {onBuildManifest} />
    {/if}
  {:else}
    <p class="asset-manager__loading">Loading assets…</p>
  {/if}

  {#if showBootstrapModal && catalog}
    <CatalogBootstrapModal
      schema={catalog.schema}
      {catalogExists}
      previewRows={bootstrapPreviewRows}
      groups={bootstrapGroups}
      onPreview={previewCatalogBootstrap}
      onSelect={runCatalogBootstrap}
      onClose={() => {
        showBootstrapModal = false;
        schemaModalDismissed = true;
      }}
    />
  {/if}

  {#if comboValues && !comboDetailEntry}
    <ComboAssetsModal
      entries={comboEntries}
      {comboLabel}
      {assetImageSrc}
      onClose={closeCombo}
      onOpenDetail={openComboDetail}
      onJumpToGrid={comboJumpToGrid}
    />
  {/if}

  {#if comboDetailEntry && catalog}
    <AssetDetailModal
      entry={comboDetailEntry}
      imgSrc={assetImageSrc(comboDetailEntry.path)}
      meta={metaByPath[comboDetailEntry.path] ?? null}
      {catalog}
      onClose={() => (comboDetailIndex = null)}
      onPrev={() => moveComboDetail(-1)}
      onNext={() => moveComboDetail(1)}
      onApplySlots={(path, slots) => onUpdateAssignments([{ path, slots }])}
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
  .asset-manager__status { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .asset-manager__error { margin: 0; color: var(--vscode-errorForeground, #f66); }
  .asset-manager__loading { color: var(--secondary-text); }
</style>
