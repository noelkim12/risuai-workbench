<script lang="ts">
  import { toAnalysisProfileViewModel } from '../../analysis-showcase/analysisProfileViewModel';
  import type { BrowserAnalysisProfile } from '../../types';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import AnalysisProfileActions from './AnalysisProfileActions.svelte';

  export let profile: BrowserAnalysisProfile;
  export let stableId: string;
  export let onAnalyze: (stableId: string) => void;
  export let onOpenReport: (stableId: string) => void;

  $: vm = toAnalysisProfileViewModel(profile);
  $: showcase = profile.kind === 'available' ? profile.showcase : null;
  $: traits = showcase?.traits ?? [];
</script>

<details
  class="profile-card"
  data-profile-kind={profile.kind}
>
  <summary class="profile-card__summary">
    <span class="profile-card__heading">
      <span class="profile-card__title">Analysis</span>
      <span class="profile-card__state" aria-live="polite">{vm.stateLabel}</span>
    </span>
    <span class="profile-card__meta">
      {#if vm.generatedAtLabel}
        <time class="profile-card__time" datetime={vm.generatedAtLabel}>{vm.generatedAtLabel}</time>
      {/if}
      <span class="profile-card__chevron" aria-hidden="true"></span>
    </span>
  </summary>

  <div class="profile-card__content">
    {#if profile.kind === 'none'}
      <p class="profile-card__cta-text">
        Reveal your character's variables, lore structure, Lua systems, and activation chains.
      </p>
    {:else if profile.kind === 'invalid'}
      <p class="profile-card__reason">{vm.stateLabel}. Re-analyze to regenerate.</p>
    {/if}

    {#if vm.metrics.length > 0}
      <dl class="profile-card__metrics">
        {#each vm.metrics as metric (metric.id)}
          <div class="profile-card__metric">
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if traits.length > 0}
      <ul class="profile-card__traits" aria-label="Descriptive traits">
        {#each traits as trait (trait.id)}
          <li class="profile-card__trait">{trait.label}</li>
        {/each}
      </ul>
    {/if}

    <AnalysisProfileActions
      profileKind={profile.kind}
      canOpenReport={vm.canOpenReport}
      {stableId}
      {onAnalyze}
      {onOpenReport}
    />
  </div>
</details>

<style>
  .profile-card {
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md, var(--radius-sm));
    background: var(--surface);
  }

  .profile-card__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3);
    list-style: none;
    cursor: pointer;
  }

  .profile-card__summary::-webkit-details-marker {
    display: none;
  }

  .profile-card__summary:hover {
    background: color-mix(in srgb, var(--surface) 88%, var(--focus));
  }

  .profile-card__summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .profile-card__heading,
  .profile-card__meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .profile-card__title {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--primary-text, var(--secondary-text));
  }

  .profile-card__state {
    font-size: var(--text-xs, var(--text-sm));
    color: var(--secondary-text);
  }

  .profile-card__time {
    font-size: var(--text-xs, var(--text-sm));
    color: var(--secondary-text);
    white-space: nowrap;
  }

  .profile-card__chevron {
    width: 6px;
    height: 6px;
    border-right: 1px solid var(--secondary-text);
    border-bottom: 1px solid var(--secondary-text);
    transform: rotate(45deg);
    transition: transform 120ms ease;
  }

  .profile-card[open] .profile-card__chevron {
    transform: rotate(225deg);
  }

  .profile-card__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-3) var(--space-3);
  }

  .profile-card__cta-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--secondary-text);
    line-height: 1.5;
  }

  .profile-card__reason {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--secondary-text);
  }

  .profile-card__metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: var(--space-2);
    margin: 0;
  }

  .profile-card__metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-card__metric dt {
    font-size: var(--text-xs, var(--text-sm));
    color: var(--secondary-text);
  }

  .profile-card__metric dd {
    margin: 0;
    font-size: var(--text-lg, var(--text-md));
    font-weight: 600;
    color: var(--primary-text, var(--secondary-text));
  }

  .profile-card__traits {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .profile-card__trait {
    padding: 2px var(--space-2);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs, var(--text-sm));
    color: var(--secondary-text);
  }
</style>
