<!--
  Analysis Showcase webview app: renders profile hierarchy and export card.
  Capture-on-ready fires once; errors are visible with role="alert".
  @file packages/webview/src/lib/analysis-showcase/AnalysisShowcaseApp.svelte
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { postAnalysisShowcaseMessage } from '../vscode';
  import {
    createAnalysisShowcaseReadyMessage,
    createAnalysisShowcaseOpenFullReportMessage,
    createAnalysisShowcaseSavePngMessage,
    createAnalysisShowcasePngCaptureFailedMessage,
    isAnalysisShowcaseLoadedMessage,
    isAnalysisShowcaseSaveCompletedMessage,
    isAnalysisShowcaseErrorMessage,
    type AnalysisShowcaseLoadedPayload,
  } from './protocol';
  import { toAnalysisShowcaseViewModel, type AnalysisShowcaseViewModel } from './analysisShowcaseViewModel';
  import ShowcaseExportCard from './ShowcaseExportCard.svelte';
  import { exportShowcasePng } from './exportShowcasePng';

  let loaded: AnalysisShowcaseLoadedPayload | null = null;
  let errorMessage: string | null = null;
  let saveStatus: string | null = null;
  let capturePending = false;
  let exportCard: HTMLElement;
  let viewModel: AnalysisShowcaseViewModel | null = null;

  function handleMessage(event: MessageEvent): void {
    const data = event.data;

    if (isAnalysisShowcaseLoadedMessage(data)) {
      loaded = data.payload;
      viewModel = toAnalysisShowcaseViewModel(data.payload.showcase, data.payload.freshness);
      errorMessage = null;
      saveStatus = null;
      if (data.payload.captureOnReady && !capturePending) {
        void triggerCapture();
      }
      return;
    }

    if (isAnalysisShowcaseSaveCompletedMessage(data)) {
      saveStatus = 'Image saved successfully.';
      capturePending = false;
      return;
    }

    if (isAnalysisShowcaseErrorMessage(data)) {
      errorMessage = data.payload.message;
      capturePending = false;
    }
  }

  async function triggerCapture(): Promise<void> {
    if (capturePending) return;
    capturePending = true;
    errorMessage = null;

    try {
      const dataUrl = await exportShowcasePng(exportCard);
      postAnalysisShowcaseMessage(createAnalysisShowcaseSavePngMessage(dataUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG capture failed';
      postAnalysisShowcaseMessage(createAnalysisShowcasePngCaptureFailedMessage(message));
      errorMessage = message;
      capturePending = false;
    }
  }

  function openFullReport(): void {
    postAnalysisShowcaseMessage(createAnalysisShowcaseOpenFullReportMessage());
  }

  function shareShowcase(): void {
    void triggerCapture();
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    postAnalysisShowcaseMessage(createAnalysisShowcaseReadyMessage());
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<main class="showcase-app">
  {#if errorMessage}
    <div role="alert" class="showcase-app__error">
      {errorMessage}
    </div>
  {/if}

  {#if saveStatus}
    <div role="status" class="showcase-app__status">
      {saveStatus}
    </div>
  {/if}

  {#if viewModel}
    <div class="showcase-app__actions">
      {#if loaded?.reportAvailable}
        <button type="button" class="showcase-app__btn" on:click={openFullReport}>
          Open Full Report
        </button>
      {/if}
      <button
        type="button"
        class="showcase-app__btn showcase-app__btn--primary"
        on:click={shareShowcase}
        disabled={capturePending}
      >
        {capturePending ? 'Capturing...' : 'Share Showcase'}
      </button>
    </div>

    <div class="showcase-app__preview" bind:this={exportCard}>
      <ShowcaseExportCard viewModel={viewModel} />
    </div>
  {:else}
    <p class="showcase-app__loading">Loading analysis showcase...</p>
  {/if}
</main>

<style>
  .showcase-app {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .showcase-app__error {
    padding: 12px 16px;
    border-radius: 4px;
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: rgb(239, 68, 68);
    font-size: 14px;
  }

  .showcase-app__status {
    padding: 8px 16px;
    border-radius: 4px;
    background-color: rgba(34, 197, 94, 0.1);
    color: rgb(34, 197, 94);
    font-size: 14px;
  }

  .showcase-app__actions {
    display: flex;
    gap: 12px;
  }

  .showcase-app__btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, transparent);
    background-color: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ffffff);
    cursor: pointer;
    font-size: 13px;
  }

  .showcase-app__btn--primary {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }

  .showcase-app__btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .showcase-app__preview {
    overflow: auto;
  }

  .showcase-app__loading {
    color: var(--vscode-foreground, #cccccc);
    font-size: 14px;
  }
</style>
