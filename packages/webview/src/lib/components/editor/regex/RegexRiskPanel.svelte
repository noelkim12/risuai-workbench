<script lang="ts">
  import type { MainEditorRegexRiskFindingPayload } from '../../../types/mainEditor';

  export let risks: MainEditorRegexRiskFindingPayload[] = [];
  export let expanded = true;

  $: sortedRisks = [...risks].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  function severityRank(severity: MainEditorRegexRiskFindingPayload['severity']): number {
    if (severity === 'error') return 3;
    if (severity === 'warning') return 2;
    return 1;
  }
</script>

<details class="rrp" aria-label="Regex static risk analysis" bind:open={expanded}>
  <summary class="rrp__head rrp__summary">
    <h3 class="rrp__title">Static risk analysis</h3>
    <span class="rrp__actions">
      {#if sortedRisks.length > 0}
        <span class={`rrp__count rrp__count--${sortedRisks[0].severity}`}>{sortedRisks.length}</span>
      {/if}
      <span class="rrp__chevron" aria-hidden="true"></span>
    </span>
  </summary>

  {#if sortedRisks.length === 0}
    <div class="rrp__empty">
      <span class="rrp__ok">&check;</span> No static risk findings for this pattern.
    </div>
  {:else}
    <ul class="rrp__list">
      {#each sortedRisks as risk}
        <li class={`rrp__item rrp__item--${risk.severity}`}>
          <span class={`rrp__sev rrp__sev--${risk.severity}`}>{risk.severity}</span>
          <div class="rrp__body">
            <strong class="rrp__code">{risk.code}</strong>
            <p class="rrp__msg">{risk.message}</p>
            {#if risk.suggestions.length > 0}
              <div class="rrp__suggestions" aria-label="Suggested alternatives">
                <span class="rrp__suggestions-title">Suggested alternative</span>
                <ul class="rrp__suggestion-list">
                  {#each risk.suggestions as suggestion}
                    <li class="rrp__suggestion">
                      <strong class="rrp__suggestion-title">{suggestion.title}</strong>
                      <span class="rrp__suggestion-desc">{suggestion.description}</span>
                      {#if suggestion.example}
                        <code class="rrp__suggestion-example">{suggestion.example}</code>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            <div class="rrp__meta">
              <span class="rrp__conf">confidence: <strong>{risk.confidence}</strong></span>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</details>

<style>
  .rrp {
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--text);
  }

  .rrp__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--card-border);
    background: var(--section);
  }

  .rrp:not([open]) > .rrp__head {
    border-bottom: 0;
  }

  .rrp__summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .rrp__summary::-webkit-details-marker {
    display: none;
  }

  .rrp__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .rrp__chevron {
    width: 7px;
    height: 7px;
    border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 120ms ease, border-color 120ms ease;
  }

  .rrp[open] > .rrp__summary .rrp__chevron {
    transform: rotate(45deg);
  }

  .rrp__summary:hover .rrp__chevron,
  .rrp__summary:focus-visible .rrp__chevron {
    border-color: var(--text);
  }

  .rrp__summary:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -2px;
  }

  .rrp__title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
  }

  .rrp__count {
    min-width: var(--count-min-width);
    padding: var(--pill-padding-y) var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: 800;
    text-align: center;
  }

  .rrp__count--error {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 32%, var(--card-border));
  }

  .rrp__count--warning {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, var(--card-border));
  }

  .rrp__count--info {
    color: var(--badge-text);
    background: var(--badge);
  }

  /* Empty state */
  .rrp__empty {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.45;
  }

  .rrp__ok {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-pill);
    color: var(--badge-text);
    background: var(--success);
    font-size: 11px;
    font-weight: 900;
  }

  /* List */
  .rrp__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: var(--space-1) var(--space-2) var(--space-2);
    list-style: none;
  }

  .rrp__item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-left: 2px solid transparent;
    border-radius: 2px;
    line-height: 1.4;
  }

  .rrp__item--error {
    border-left-color: var(--error);
    background: color-mix(in srgb, var(--error) 6%, transparent);
  }

  .rrp__item--warning {
    border-left-color: var(--warning);
    background: color-mix(in srgb, var(--warning) 5%, transparent);
  }

  .rrp__item--info {
    border-left-color: var(--focus);
    background: color-mix(in srgb, var(--focus) 5%, transparent);
  }

  /* Severity pill */
  .rrp__sev {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.4;
  }

  .rrp__sev--error {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 16%, transparent);
  }

  .rrp__sev--warning {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 16%, transparent);
  }

  .rrp__sev--info {
    color: var(--muted);
    background: color-mix(in srgb, var(--focus) 14%, transparent);
  }

  /* Body */
  .rrp__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .rrp__code {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .rrp__msg {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-md);
    word-break: break-word;
  }

  .rrp__suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-1);
    padding: var(--space-2);
    border: 1px solid color-mix(in srgb, var(--focus) 20%, var(--card-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--focus) 6%, transparent);
  }

  .rrp__suggestions-title {
    color: var(--text);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .rrp__suggestion-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rrp__suggestion {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rrp__suggestion-title {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .rrp__suggestion-desc {
    color: var(--muted);
    font-size: var(--text-md);
    line-height: 1.4;
  }

  .rrp__suggestion-example {
    align-self: flex-start;
    margin-top: 1px;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--card-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--text);
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .rrp__meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .rrp__conf {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .rrp__conf strong {
    color: var(--text);
  }
</style>
