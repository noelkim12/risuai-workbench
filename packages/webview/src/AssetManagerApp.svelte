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
    type AssetManagerAssetEntry,
    type AssetManagerAssignmentChange,
    type AssetManagerPickedFile,
    type AssetManagerWebviewMessage,
    type AssetManagerWriteAssetFile,
    type AssetOutputKind,
    type AssetSlotId,
    type ImageMetaMirror,
    type LorebookNameCandidateMirror,
  } from './lib/types/assetManager';
  import { filterEntriesByCombo } from './lib/asset-manager/gridModel';
  import { fileToBase64, isSupportedAssetFile, type StagedItem } from './lib/asset-manager/staging';
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
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes these components.
  import AssetStagingModal from './lib/components/asset-manager/AssetStagingModal.svelte';

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
  // 스냅샷(assetsLoaded/catalogSaved 등)이 도착할 때마다 증가. bootstrap modal이 열린 채로
  // watcher가 파일을 발견하면 이 값으로 modal이 미리보기를 재요청한다.
  let snapshotRevision = 0;
  let autoAssignNotice: {
    readonly assignedPaths: readonly string[];
    readonly anomalyPaths: readonly string[];
    readonly addedVocab: Partial<Record<AssetSlotId, readonly string[]>>;
  } | null = null;
  let stagedItems: StagedItem[] | null = null;
  let stagedApplying = false;
  let dragActive = false;
  /** 드래그 중 상세 모달이 열려 있으면 해당 asset 경로 — drop을 교체로 라우팅한다. */
  let dragReplaceTarget: string | null = null;
  /** webview 내부 요소(타일/모달 이미지 등)에서 시작된 드래그 — 외부 파일 drop 흐름에서 제외한다. */
  let internalDrag = false;
  let dropNotice = '';
  let stagedSeq = 0;

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
    snapshotRevision += 1;
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
      case 'asset-manager/autoAssignApplied': {
        applySnapshot(message.payload);
        const { assignedPaths, anomalyPaths, addedVocab } = message.payload;
        autoAssignNotice = assignedPaths.length > 0 || anomalyPaths.length > 0 ? { assignedPaths, anomalyPaths, addedVocab } : null;
        status = `새 파일 감지 · 자동 assign ${assignedPaths.length}개 · 파싱 실패 ${anomalyPaths.length}개`;
        return;
      }
      case 'asset-manager/assetsWritten': {
        const { writtenPaths, deletedPaths } = message.payload;
        stagedItems = null;
        stagedApplying = false;
        status = `파일 ${writtenPaths.length}개 기록됨${deletedPaths.length > 0 ? ` · 교체로 ${deletedPaths.length}개 삭제` : ''} · 자동 반영 대기중`;
        return;
      }
      case 'asset-manager/filesPicked': {
        stageFiles(message.payload.files, [...message.payload.skipped]);
        return;
      }
      case 'asset-manager/lorebookNamesResult':
        lorebookCandidates = message.payload.candidates;
        return;
      case 'asset-manager/tokenizeResult':
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
        stagedApplying = false;
        return;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    window.addEventListener('dragstart', onInternalDragStart, { capture: true });
    window.addEventListener('dragend', onInternalDragEnd, { capture: true });
    window.addEventListener('dragenter', onDragEnter, { capture: true });
    window.addEventListener('dragover', onDragOver, { capture: true });
    window.addEventListener('dragleave', onDragLeave, { capture: true });
    window.addEventListener('drop', onDrop, { capture: true });
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
      window.removeEventListener('dragstart', onInternalDragStart, { capture: true });
      window.removeEventListener('dragend', onInternalDragEnd, { capture: true });
      window.removeEventListener('dragenter', onDragEnter, { capture: true });
      window.removeEventListener('dragover', onDragOver, { capture: true });
      window.removeEventListener('dragleave', onDragLeave, { capture: true });
      window.removeEventListener('drop', onDrop, { capture: true });
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
  const onPickFiles = () => post(createAssetManagerWebviewMessage('asset-manager/pickAssetFiles', { stableId }));
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function undoAutoAssign(): void {
    if (!autoAssignNotice) return;
    post(
      createAssetManagerWebviewMessage('asset-manager/undoAutoAssign', {
        stableId,
        assignedPaths: autoAssignNotice.assignedPaths,
        addedVocab: autoAssignNotice.addedVocab,
      }),
    );
    autoAssignNotice = null;
  }

  const MAX_DROP_FILE_BYTES = 50 * 1024 * 1024;

  function isPotentialFileDrag(event: DragEvent): boolean {
    // 내부에서 시작된 드래그(dragstart가 webview 안에서 발생)는 외부 파일이 아니다.
    if (internalDrag) return false;
    const transfer = event.dataTransfer;
    if (!transfer) return false;
    if (transfer.files.length > 0) return true;

    const types = [...transfer.types];
    if (types.includes('Files')) return true;
    if ([...transfer.items].some((item) => item.kind === 'file')) return true;

    // Windows Explorer through VS Code/Electron may hide file details until drop.
    return types.length === 0;
  }

  // 내부 드래그(dragstart는 외부 파일 드래그에서는 절대 발생하지 않음) 동안 파일 drop 흐름을 잠근다.
  function onInternalDragStart(): void {
    internalDrag = true;
  }

  function onInternalDragEnd(): void {
    internalDrag = false;
  }

  /** 상세 모달이 열려 있으면 그 asset 경로(교체 대상), 아니면 null. 모달이 자신을 data 속성으로 광고한다. */
  function activeReplaceTargetPath(): string | null {
    return document.querySelector('[data-asset-replace-target]')?.getAttribute('data-asset-replace-target') ?? null;
  }

  function onDragEnter(event: DragEvent): void {
    if (!isPotentialFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragActive = true;
    dragReplaceTarget = activeReplaceTargetPath();
  }

  function onDragOver(event: DragEvent): void {
    if (!isPotentialFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dragActive = true;
    dragReplaceTarget = activeReplaceTargetPath();
  }

  function onDragLeave(event: DragEvent): void {
    if (!isPotentialFileDrag(event)) return;
    const leavingWindow = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
    if (!leavingWindow) return;
    dragActive = false;
    dragReplaceTarget = null;
  }

  async function onDrop(event: DragEvent): Promise<void> {
    // 내부 드래그의 drop은 파일 staging 대상이 아니다 (dragend가 flag를 정리한다).
    if (internalDrag) return;
    event.preventDefault();
    event.stopPropagation();
    dragActive = false;
    const replaceTarget = dragReplaceTarget;
    dragReplaceTarget = null;
    const dropped = [...(event.dataTransfer?.files ?? [])];
    if (dropped.length === 0) return;

    const rejected: string[] = [];
    const candidates: AssetManagerPickedFile[] = [];
    for (const file of dropped) {
      if (file.size > MAX_DROP_FILE_BYTES) {
        rejected.push(file.name);
        continue;
      }
      candidates.push({ name: file.name, bytesBase64: await fileToBase64(file), sizeBytes: file.size });
    }
    // 상세 모달 위 drop은 단일 파일일 때만 그 asset 교체로 고정한다.
    stageFiles(candidates, rejected, dropped.length === 1 ? (replaceTarget ?? undefined) : undefined);
    if (replaceTarget !== null && dropped.length > 1) {
      dropNotice = `여러 파일이 드롭되어 ${replaceTarget} 교체 대신 일반 추가/교체로 처리합니다. ${dropNotice}`.trim();
    }
  }

  /** drop/파일 선택 공통 staging 진입점. 지원 확장자를 거른 뒤 staging modal에 쌓는다. */
  function stageFiles(files: readonly AssetManagerPickedFile[], rejected: string[], replaceTargetPath?: string): void {
    const accepted: StagedItem[] = [];
    for (const file of files) {
      if (!isSupportedAssetFile(file.name)) {
        rejected.push(file.name);
        continue;
      }
      stagedSeq += 1;
      accepted.push({
        id: `staged-${stagedSeq}`,
        originalName: file.name,
        editedName: file.name,
        bytesBase64: file.bytesBase64,
        sizeBytes: file.sizeBytes,
        ...(replaceTargetPath !== undefined && { replaceTargetPath }),
      });
    }
    dropNotice = rejected.length > 0 ? `지원하지 않거나 너무 큰 파일 ${rejected.length}개 제외: ${rejected.join(', ')}` : '';
    if (accepted.length === 0) return;
    stagedItems = [...(stagedItems ?? []), ...accepted];
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function applyStagedFiles(files: readonly AssetManagerWriteAssetFile[]): void {
    stagedApplying = true;
    status = `파일 ${files.length}개 기록 중…`;
    post(createAssetManagerWebviewMessage('asset-manager/writeAssets', { stableId, files }));
  }

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this callback.
  function onReplaceFile(path: string): void {
    status = `파일 교체 대기: ${path} (파일 선택 다이얼로그 확인)`;
    post(createAssetManagerWebviewMessage('asset-manager/replaceAssetFile', { stableId, path }));
  }

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

  // 같은 경로 덮어쓰기(파일 교체) 후 stale 캐시가 남지 않게 mtime을 쿼리로 붙인다.
  $: mtimeByPath = new Map(entries.map((entry) => [entry.path, entry.mtimeMs]));

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this helper.
  function assetImageSrc(path: string): string {
    const base = `${assetsRootUri}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const mtime = mtimeByPath.get(path);
    return mtime === undefined ? base : `${base}?v=${mtime}`;
  }

</script>

<main
  class="asset-manager"
  class:is-dragover={dragActive && !dragReplaceTarget}
  class:is-replace-drag={dragActive && dragReplaceTarget !== null}
  aria-label="Risu Asset Manager"
>
  <AssetManagerHeader
    {artifactName}
    {tab}
    onSelectTab={selectTab}
    {onRefresh}
    onOpenBootstrap={() => (showBootstrapModal = true)}
    {onBuildManifest}
    {onPickFiles}
  />

  <p class="asset-manager__status">{status}</p>
  {#if errorText}<p class="asset-manager__error" role="alert">{errorText}</p>{/if}
  {#if autoAssignNotice}
    <div class="asset-manager__autobanner" role="status">
      <span class="asset-manager__autobanner-text">
        새 파일 자동 assign {autoAssignNotice.assignedPaths.length}개
      {#if autoAssignNotice.anomalyPaths.length > 0}
          · 규칙 파싱 실패 {autoAssignNotice.anomalyPaths.length}개(미할당으로 추가됨)
      {/if}
        {#each Object.entries(autoAssignNotice.addedVocab) as [slotId, values] (slotId)}
          <span class="asset-manager__autobanner-vocab">신규 vocab {slotId}: {values?.join(', ')}</span>
        {/each}
      </span>
      {#if autoAssignNotice.assignedPaths.length > 0}
        <button type="button" onclick={undoAutoAssign}>실행취소</button>
      {/if}
      <button type="button" onclick={() => (autoAssignNotice = null)}>닫기</button>
    </div>
  {/if}
  {#if dropNotice}<p class="asset-manager__dropnotice" role="status">{dropNotice}</p>{/if}
  <!-- 교체 drop(상세 모달 열림)일 때는 전체 오버레이 대신 모달 자체에 grid와 같은 dashed outline을 준다. -->
  {#if dragActive && !dragReplaceTarget}
    <div class="asset-manager__dropzone" aria-hidden="true">여기에 놓으면 assets에 추가/교체합니다</div>
  {/if}
  <!-- VS Code workbench가 Shift 없는 외부 파일 드래그를 webview에 전달하지 않으므로(🚫 커서) 상시 안내 -->
  <p class="asset-manager__drophint">외부 탐색기에서 파일을 <kbd>Drag&Drop</kbd>하여 에셋을 추가할 수 있습니다</p>

  {#if catalog}
    {#if tab === 'grid'}
      <GridView {entries} {catalog} {orphanPaths} {metaByPath} {assetImageSrc} {onUpdateAssignments} {onReadMeta} {onReplaceFile} presetQuery={gridPresetQuery} />
    {:else if tab === 'matrix'}
      <MatrixView {catalog} onOpenCombo={openCombo} />
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
      bootstrapConfig={catalog.bootstrap ?? null}
      previewRows={bootstrapPreviewRows}
      groups={bootstrapGroups}
      assetRevision={snapshotRevision}
      onPreview={previewCatalogBootstrap}
      onSelect={runCatalogBootstrap}
      onClose={() => {
        showBootstrapModal = false;
        schemaModalDismissed = true;
      }}
    />
  {/if}

  {#if stagedItems && stagedItems.length > 0 && catalog}
    <AssetStagingModal
      bind:items={stagedItems}
      {entries}
      bootstrapConfig={catalog.bootstrap ?? null}
      slotIds={catalog.schema.slots.map((slot) => slot.id)}
      {assetImageSrc}
      applying={stagedApplying}
      onApply={applyStagedFiles}
      onClose={() => (stagedItems = null)}
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
      {onReplaceFile}
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
  .asset-manager__autobanner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin: 0;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--focus) 40%, var(--card-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--focus) 10%, transparent);
    font-size: var(--text-sm);
  }
  .asset-manager__autobanner-text { display: inline-flex; gap: var(--space-2); flex-wrap: wrap; }
  .asset-manager__autobanner-vocab { color: var(--secondary-text); }
  .asset-manager__autobanner button {
    padding: 2px 10px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--secondary);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .asset-manager.is-dragover { outline: 2px dashed var(--focus); outline-offset: -6px; }
  /* 교체 drop: grid의 is-dragover와 같은 tone(dashed outline)을 열린 상세 모달에 적용한다. */
  .asset-manager.is-replace-drag :global(.detail-modal) {
    outline: 2px dashed var(--focus);
    outline-offset: -6px;
  }
  .asset-manager.is-replace-drag :global(.detail-modal)::after {
    content: '놓으면 이 asset 파일을 교체합니다';
    position: absolute;
    left: 50%;
    bottom: var(--space-3);
    transform: translateX(-50%);
    padding: 4px 14px;
    border-radius: var(--radius-pill, 999px);
    background: color-mix(in srgb, var(--focus) 18%, var(--card));
    color: var(--focus);
    font-size: var(--text-sm);
    font-weight: 700;
    pointer-events: none;
  }
  .asset-manager__dropzone {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    pointer-events: none;
    background: color-mix(in srgb, var(--focus) 12%, transparent);
    color: var(--focus);
    font-size: 1.1rem;
    font-weight: 700;
  }
  .asset-manager__dropnotice { margin: 0; color: var(--vscode-editorWarning-foreground, #cca700); font-size: var(--text-sm); }
  .asset-manager__drophint { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .asset-manager__drophint kbd {
    padding: 0 var(--space-1);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--secondary) 70%, transparent);
    font-family: inherit;
  }
  .asset-manager__loading { color: var(--secondary-text); }
</style>
