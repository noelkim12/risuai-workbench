<script lang="ts">
  import type { RegexWorkerPerformanceDto } from './regexWorkerTypes';

  export let performance: RegexWorkerPerformanceDto | null = null;
  export let expanded = true;

  function formatMs(value: number): string {
    return `${value.toFixed(2)}ms`;
  }
</script>

<details class="rpp" aria-label="Regex performance" bind:open={expanded}>
  <summary class="rpp__head rpp__summary">
    <h3 class="rpp__title">Performance</h3>
    <span class="rpp__actions">
      {#if performance && !performance.timedOut}
        <span class="rpp__total">{formatMs(performance.totalMs)}</span>
      {/if}
      <span class="rpp__chevron" aria-hidden="true"></span>
    </span>
  </summary>

  {#if !performance}
    <div class="rpp__empty">
      Waiting for worker result.
    </div>
  {:else if performance.timedOut}
    <div class="rpp__alert" role="alert">
      <span class="rpp__alert-icon">&#x26A0;</span>
      <div class="rpp__alert-body">
        <strong>Timed out</strong>
        <p>The worker was terminated after {performance.timeoutMs}ms to protect the UI.</p>
      </div>
    </div>
  {:else}
    <div class="rpp__grid">
      <div class="rpp__metric">
        <span class="rpp__metric-label">Input length</span>
        <span class="rpp__metric-val">{performance.inputLength.toLocaleString()}</span>
      </div>
      <div class="rpp__metric">
        <span class="rpp__metric-label">Matches</span>
        <span class="rpp__metric-val">{performance.matchCount.toLocaleString()}</span>
      </div>
      <div class="rpp__metric">
        <span class="rpp__metric-label">Compile</span>
        <span class="rpp__metric-val rpp__metric-val--mono">{formatMs(performance.compileMs)}</span>
      </div>
      <div class="rpp__metric">
        <span class="rpp__metric-label">Match</span>
        <span class="rpp__metric-val rpp__metric-val--mono">{formatMs(performance.matchMs)}</span>
      </div>
      <div class="rpp__metric">
        <span class="rpp__metric-label">Replace</span>
        <span class="rpp__metric-val rpp__metric-val--mono">{formatMs(performance.replacementMs)}</span>
      </div>
      <div class="rpp__metric rpp__metric--total">
        <span class="rpp__metric-label">Total</span>
        <span class="rpp__metric-val rpp__metric-val--total">{formatMs(performance.totalMs)}</span>
      </div>
    </div>
  {/if}
</details>

<style>
  .rpp {
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--text);
  }

  .rpp__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--card-border);
    background: var(--section);
  }

  .rpp:not([open]) > .rpp__head {
    border-bottom: 0;
  }

  .rpp__summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .rpp__summary::-webkit-details-marker {
    display: none;
  }

  .rpp__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .rpp__chevron {
    width: 7px;
    height: 7px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 120ms ease, border-color 120ms ease;
  }

  .rpp[open] > .rpp__summary .rpp__chevron {
    transform: rotate(45deg);
  }

  .rpp__summary:hover .rpp__chevron,
  .rpp__summary:focus-visible .rpp__chevron {
    border-color: var(--text);
  }

  .rpp__summary:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -2px;
  }

  .rpp__title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
  }

  .rpp__total {
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--badge);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  /* Empty */
  .rpp__empty {
    padding: var(--space-3);
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.45;
  }

  /* Alert */
  .rpp__alert {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-left: 2px solid var(--warning);
    background: color-mix(in srgb, var(--warning) 6%, transparent);
  }

  .rpp__alert-icon {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-pill);
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 16%, transparent);
    font-size: 12px;
  }

  .rpp__alert-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rpp__alert-body strong {
    color: var(--warning);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .rpp__alert-body p {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.4;
  }

  /* Metric grid */
  .rpp__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    padding: var(--space-1) var(--space-2) var(--space-2);
  }

  .rpp__metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface) 50%, transparent);
  }

  .rpp__metric--total {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    border-top: 1px solid var(--card-border);
    margin-top: var(--space-1);
    background: var(--section);
    border-radius: var(--radius-sm);
  }

  .rpp__metric-label {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .rpp__metric--total .rpp__metric-label {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
  }

  .rpp__metric-val {
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 800;
    line-height: 1.25;
  }

  .rpp__metric-val--mono {
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
  }

  .rpp__metric-val--total {
    justify-self: end;
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    color: var(--accent-text);
    background: var(--accent);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    font-size: var(--text-md);
  }
</style>
