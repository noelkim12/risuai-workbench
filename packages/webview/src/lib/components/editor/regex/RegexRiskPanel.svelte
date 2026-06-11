<script lang="ts">
  import type { MainEditorRegexRiskFindingPayload } from '../../../types/mainEditor';

  export let risks: MainEditorRegexRiskFindingPayload[] = [];

  $: sortedRisks = [...risks].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  function severityRank(severity: MainEditorRegexRiskFindingPayload['severity']): number {
    if (severity === 'error') return 3;
    if (severity === 'warning') return 2;
    return 1;
  }
</script>

<section class="rrp" aria-label="Regex static risk analysis">
  <header class="rrp__head">
    <h3 class="rrp__title">Static risk analysis</h3>
    {#if sortedRisks.length > 0}
      <span class={`rrp__count rrp__count--${sortedRisks[0].severity}`}>{sortedRisks.length}</span>
    {/if}
  </header>

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
            <div class="rrp__meta">
              <span class="rrp__conf">confidence: <strong>{risk.confidence}</strong></span>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

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
