<script lang="ts">
  import { extractAssetCbsNames, substituteAssetCbs } from '@risuai-workbench/core/cbs-browser';
  import { onDestroy } from 'svelte';
  import { createRequestId } from '../../../requestIds';
  import type { MainEditorFormatPreviewResultPayload } from '../../../types/mainEditor';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup renders this component.
  import RegexPerformancePanel from './RegexPerformancePanel.svelte';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup renders this component.
  import RegexRiskPanel from './RegexRiskPanel.svelte';
  import { runRegexWorkerWithTimeout } from './regexWorkerClient';
  import type { RegexWorkerResult } from './regexWorkerTypes';

  export let preview: MainEditorFormatPreviewResultPayload | null;
  export let pending: boolean;
  export let sampleInput: string;
  export let resolvedAssets: Record<string, string | null> = {};
  export let assetsTruncated = false;
  export let onRequestAssets: ((names: string[]) => void) | undefined = undefined;

  const EXECUTION_TIMEOUT_MS = 200;
  const limits = { maxInputLength: 50_000, maxMatches: 1_000, maxOutputLength: 50_000 };
  const HTML_PREVIEW_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'";

  let workerResult: RegexWorkerResult | null = null;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads this pending state.
  let workerPending = false;
  let lastRunKey = '';
  let disposed = false;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this details state.
  let outputExpanded = true;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this details state.
  let performanceExpanded = true;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this details state.
  let matchesExpanded = true;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this details state.
  let riskExpanded = true;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this details state.
  let diagnosticsExpanded = true;

  $: regex = preview?.regex;
  $: runKey = regex ? `${regex.pattern.effective}\u0000${regex.jsFlags}\u0000${regex.replacement.effective}\u0000${sampleInput}` : '';
  $: if (regex?.executionRequired && runKey && runKey !== lastRunKey) runWorker(runKey);
  $: executionDisabled = Boolean(regex && !regex.executionRequired);
  $: if (executionDisabled && workerResult) workerResult = null;
  $: renderedOutputSrcdoc = createRenderedOutputSrcdoc(workerResult, preview, resolvedAssets);
  $: outputAssetNames = workerResult && (workerResult.status === 'ok' || workerResult.status === 'partial')
    ? extractAssetCbsNames(workerResult.output)
    : [];
  $: requestMissingAssets(outputAssetNames);

  onDestroy(() => {
    disposed = true;
  });

  async function runWorker(nextRunKey: string): Promise<void> {
    if (!regex) return;
    lastRunKey = nextRunKey;
    workerPending = true;
    const requestId = createRequestId('regex-worker');
    try {
      const result = await runRegexWorkerWithTimeout({
        requestId,
        pattern: regex.pattern.effective,
        flags: regex.jsFlags,
        replacement: regex.replacement.effective,
        sampleInput,
        limits,
      }, { timeoutMs: EXECUTION_TIMEOUT_MS });
      if (disposed || lastRunKey !== nextRunKey) return;
      workerResult = result;
    } catch (error) {
      if (disposed || lastRunKey !== nextRunKey) return;
      const message = error instanceof Error ? error.message : 'Regex worker failed unexpectedly.';
      workerResult = {
        requestId,
        status: 'error',
        output: '',
        matches: [],
        diagnostics: [{ code: 'RISUREGEX_WORKER_UNEXPECTED', severity: 'error', message }],
        performance: {
          compileMs: 0,
          matchMs: 0,
          replacementMs: 0,
          totalMs: 0,
          timedOut: false,
          timeoutMs: 0,
          inputLength: sampleInput.length,
          matchCount: 0,
        },
      };
    } finally {
      if (!disposed && lastRunKey === nextRunKey) {
        workerPending = false;
      }
    }
  }

  function createRenderedOutputSrcdoc(
    result: RegexWorkerResult | null,
    previewResult: MainEditorFormatPreviewResultPayload | null,
    resolved: Record<string, string | null>,
  ): string {
    if (!result || (result.status !== 'ok' && result.status !== 'partial')) return '';
    const substituted = substituteAssetCbs(result.output, resolved);
    return createSandboxedHtmlSrcdoc(`${previewResult?.htmlContext?.sourceHtml ?? ''}${substituted}`, HTML_PREVIEW_CSP);
  }

  function requestMissingAssets(names: string[]): void {
    if (!onRequestAssets || names.length === 0) return;
    const missing = names.filter((name) => !(name in resolvedAssets));
    if (missing.length > 0) onRequestAssets(missing);
  }

  function createSandboxedHtmlSrcdoc(bodyHtml: string, csp: string): string {
    return [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="UTF-8">',
      `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">`,
      '<style>:root { color-scheme: light dark; } body { margin: 0; color: CanvasText; background: Canvas; white-space: pre-wrap; }</style>',
      '</head>',
      '<body>',
      bodyHtml,
      '</body>',
      '</html>',
    ].join('');
  }

  function escapeHtmlAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
</script>

<div class="rpi p-10" aria-label="Regex inspector">
  <header class="rpi__head">
    <div class="rpi__title-row">
      <h2 class="rpi__title">Regex Inspector</h2>
      {#if pending || workerPending}
        <span class="rpi__busy" aria-label="Running">
          <span class="rpi__dot rpi__dot--pulse"></span>
          Running&hellip;
        </span>
      {:else if workerResult}
        <span class="rpi__status rpi__status--ok" aria-label="Complete">{workerResult.matches.length ?? 0} match{workerResult.matches.length !== 1 ? 'es' : ''}</span>
      {/if}
    </div>
  </header>

  {#if !preview}
    <div class="rpi__empty" role="status">
      <p>Waiting for regex preview.</p>
    </div>
  {:else if !regex}
    <div class="rpi__empty rpi__empty--warn" role="alert">
      <p>Regex preflight data is unavailable.</p>
    </div>
  {:else}
    <!-- Output ---------------------------------------------------------- -->
    <details class="rpi__card" aria-label="Replacement output" bind:open={outputExpanded}>
      <summary class="rpi__card-head rpi__summary">
        <span class="rpi__summary-title">Output</span>
        <span class="rpi__chevron" aria-hidden="true"></span>
      </summary>
      <div class="rpi__output-wrap">
        {#if !workerResult}
          {#if executionDisabled}
            <p class="rpi__card-muted">Regex execution disabled by preflight.</p>
          {:else}
            <p class="rpi__card-muted">Waiting for worker result&hellip;</p>
          {/if}
        {:else if workerResult.status === 'ok' || workerResult.status === 'partial'}
          <iframe
            class="rpi__output-frame"
            title="Rendered regex output preview"
            sandbox=""
            srcdoc={renderedOutputSrcdoc}
            referrerpolicy="no-referrer"
          ></iframe>
        {:else}
          <p class="rpi__card-muted">Regex execution did not produce replacement output. See diagnostics.</p>
        {/if}
        {#if assetsTruncated}
          <p class="rpi__card-muted">Some assets were not rendered (preview asset limit reached).</p>
        {/if}
      </div>
    </details>

    <!-- Subpanels ------------------------------------------------------- -->
    <RegexPerformancePanel performance={workerResult?.performance ?? null} bind:expanded={performanceExpanded} />
    <!-- Matches --------------------------------------------------------- -->
    <details class="rpi__card" aria-label="Matches" bind:open={matchesExpanded}>
      <summary class="rpi__card-head rpi__summary">
        <span class="rpi__summary-title">Matches</span>
        <span class="rpi__summary-actions">
          {#if workerResult}
            <span class="rpi__badge">{workerResult.matches.length}</span>
          {/if}
          <span class="rpi__chevron" aria-hidden="true"></span>
        </span>
      </summary>
      {#if !workerResult}
        {#if executionDisabled}
          <p class="rpi__card-muted">Regex execution disabled by preflight.</p>
        {:else}
          <p class="rpi__card-muted">Worker result pending.</p>
        {/if}
      {:else if workerResult.matches.length === 0}
        <p class="rpi__card-muted">No matches found.</p>
      {:else}
        <ol class="rpi__match-list">
          {#each workerResult.matches as match, i}
            <li class="rpi__match">
              <header class="rpi__match-head">
                <span class="rpi__match-idx" title="Match #{i + 1}">#{i + 1}</span>
                <span class="rpi__match-range">{match.index}&hellip;{match.index + match.length - 1}</span>
                <span class="rpi__match-len">({match.length}ch)</span>
              </header>
              <code class="rpi__match-text">{match.text}</code>
              {#if match.captures.length > 0 || match.namedCaptures.length > 0}
                <ul class="rpi__caps">
                  {#each [...match.captures, ...match.namedCaptures] as capture}
                    <li class="rpi__cap">
                      <span class="rpi__cap-name">{capture.name}</span>
                      <code class="rpi__cap-val">{capture.text ?? '\u2205'}</code>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </details>
    <!-- RegexRiskPanel -------------------------------------------------- -->
    <RegexRiskPanel risks={regex.risks} bind:expanded={riskExpanded} />

    <!-- Diagnostics ----------------------------------------------------- -->
    {#if preview.diagnostics.length > 0 || workerResult?.diagnostics.length}
      <details class="rpi__card" aria-label="Diagnostics" bind:open={diagnosticsExpanded}>
        <summary class="rpi__card-head rpi__summary">
          <span class="rpi__summary-title">Diagnostics</span>
          <span class="rpi__summary-actions">
            <span class="rpi__badge rpi__badge--warn">{preview.diagnostics.length + (workerResult?.diagnostics?.length ?? 0)}</span>
            <span class="rpi__chevron" aria-hidden="true"></span>
          </span>
        </summary>
        <ul class="rpi__diag-list">
          {#each preview.diagnostics as diagnostic}
            <li class={`rpi__diag rpi__diag--${diagnostic.severity}`}>
              <span class="rpi__diag-sev">{diagnostic.severity}</span>
              <span class="rpi__diag-body">
                <strong class="rpi__diag-code">{diagnostic.code ?? 'diagnostic'}</strong>
                <span class="rpi__diag-msg">{diagnostic.message}</span>
              </span>
            </li>
          {/each}
          {#each workerResult?.diagnostics ?? [] as diagnostic}
            <li class={`rpi__diag rpi__diag--${diagnostic.severity ?? 'error'}`}>
              <span class="rpi__diag-sev">{diagnostic.severity ?? 'error'}</span>
              <span class="rpi__diag-body">
                <strong class="rpi__diag-code">{diagnostic.code}</strong>
                <span class="rpi__diag-msg">{diagnostic.message}</span>
              </span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

  {/if}
</div>

<style>
  .rpi {
    display: grid;
    align-content: start;
    grid-auto-rows: max-content;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
    height: 100%;
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    color: var(--text);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }

  /* Header */
  .rpi__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .rpi__title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .rpi__title {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 800;
    line-height: 1.2;
    color: var(--text);
  }

  .rpi__busy {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .rpi__dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--warning);
  }

  .rpi__dot--pulse {
    animation: rpi-pulse 900ms ease-in-out infinite;
  }

  @keyframes rpi-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.28; }
  }

  .rpi__status {
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .rpi__status--ok {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 30%, var(--card-border));
  }

  /* Empty state */
  .rpi__empty {
    padding: var(--space-4) var(--space-3);
    border: 1px dashed var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
    text-align: center;
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.45;
  }

  .rpi__empty--warn {
    border-style: solid;
    border-color: color-mix(in srgb, var(--warning) 36%, var(--card-border));
    color: var(--warning);
  }

  .rpi__empty p { margin: 0; }

  /* Card container */
  .rpi__card {
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
  }

  .rpi__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--card-border);
    background: var(--section);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .rpi__card:not([open]) > .rpi__card-head {
    border-bottom: 0;
  }

  .rpi__summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .rpi__summary::-webkit-details-marker {
    display: none;
  }

  .rpi__summary-title,
  .rpi__summary-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .rpi__chevron {
    width: 7px;
    height: 7px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 120ms ease, border-color 120ms ease;
  }

  .rpi__card[open] > .rpi__summary .rpi__chevron {
    transform: rotate(45deg);
  }

  .rpi__summary:hover .rpi__chevron,
  .rpi__summary:focus-visible .rpi__chevron {
    border-color: var(--text);
  }

  .rpi__summary:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -2px;
  }

  /* Badge */
  .rpi__badge {
    min-width: var(--count-min-width);
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    text-align: center;
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .rpi__badge--warn {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--card-border));
  }

  /* Output */
  .rpi__output-wrap {
    min-height: 200px;
    padding: var(--space-1) 0;
  }

  .rpi__output-frame {
    display: block;
    width: 100%;
    min-height: 320px;
    border: 0;
    background: var(--surface);
    color-scheme: light dark;
  }

  /* Card muted text */
  .rpi__card-muted {
    margin: var(--space-3);
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.4;
  }

  /* Match list */
  .rpi__match-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    list-style: none;
  }

  .rpi__match {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid color-mix(in srgb, var(--focus) 18%, var(--card-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface) 60%, transparent);
  }

  .rpi__match-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .rpi__match-idx {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 17px;
    padding: 0 4px;
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .rpi__match-range {
    color: var(--muted);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    font-size: var(--text-xs);
  }

  .rpi__match-len {
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .rpi__match-text {
    display: block;
    padding: var(--space-1) var(--space-2);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--card-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    font-size: var(--text-md);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* Captures */
  .rpi__caps {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rpi__cap {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px 1px 6px;
    border: 1px solid color-mix(in srgb, var(--focus) 26%, var(--card-border));
    border-radius: var(--radius-pill);
    background: var(--section);
    font-size: var(--text-xs);
    line-height: 1.35;
  }

  .rpi__cap-name {
    color: var(--muted);
    font-weight: 600;
  }

  .rpi__cap-val {
    color: var(--text);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    background: none;
    border: none;
    padding: 0;
  }

  /* Diagnostics */
  .rpi__diag-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: var(--space-1) var(--space-2) var(--space-2);
    list-style: none;
  }

  .rpi__diag {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-left: 2px solid transparent;
    border-radius: 2px;
    font-size: var(--text-md);
    line-height: 1.4;
  }

  .rpi__diag--error {
    border-left-color: var(--error);
    background: color-mix(in srgb, var(--error) 6%, transparent);
  }

  .rpi__diag--warning {
    border-left-color: var(--warning);
    background: color-mix(in srgb, var(--warning) 5%, transparent);
  }

  .rpi__diag--info {
    border-left-color: var(--focus);
    background: color-mix(in srgb, var(--focus) 5%, transparent);
  }

  .rpi__diag-sev {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.4;
  }

  .rpi__diag--error .rpi__diag-sev {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 16%, transparent);
  }

  .rpi__diag--warning .rpi__diag-sev {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 16%, transparent);
  }

  .rpi__diag--info .rpi__diag-sev {
    color: var(--muted);
    background: color-mix(in srgb, var(--focus) 14%, transparent);
  }

  .rpi__diag-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .rpi__diag-code {
    color: var(--text);
    font-weight: 700;
    font-size: var(--text-sm);
  }

  .rpi__diag-msg {
    color: var(--muted);
    word-break: break-word;
  }

  @media (prefers-reduced-motion: reduce) {
    .rpi__dot--pulse { animation: none; }
  }
</style>
