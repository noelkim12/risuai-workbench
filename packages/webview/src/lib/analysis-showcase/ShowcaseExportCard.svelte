<!--
  Fixed 1200x630 export card for Showcase PNG capture.
  Contains no VS Code theme variables, no paths, no finding details.
  @file packages/webview/src/lib/analysis-showcase/ShowcaseExportCard.svelte
-->

<script lang="ts">
  import type { AnalysisShowcaseViewModel } from './analysisShowcaseViewModel';

  export let viewModel: AnalysisShowcaseViewModel;
</script>

<div
  class="showcase-card"
  style="width: 1200px; height: 630px; background-color: #101522;"
>
  <header class="showcase-card__header">
    <div class="showcase-card__identity">
      <span class="showcase-card__type">{viewModel.artifactType}</span>
      <h1 class="showcase-card__name">{viewModel.artifactName}</h1>
    </div>
    <div class="showcase-card__freshness" data-freshness={viewModel.freshness}>
      {viewModel.freshness}
    </div>
  </header>

  <section class="showcase-card__hero">
    <span class="showcase-card__hero-label">{viewModel.heroMetric.label}</span>
    <span class="showcase-card__hero-value">{viewModel.heroMetric.value}</span>
  </section>

  {#if viewModel.supportingMetrics.length > 0}
    <section class="showcase-card__metrics">
      {#each viewModel.supportingMetrics as metric}
        <div class="showcase-card__metric">
          <span class="showcase-card__metric-label">{metric.label}</span>
          <span class="showcase-card__metric-value">{metric.value}</span>
        </div>
      {/each}
    </section>
  {/if}

  <section class="showcase-card__distributions">
    <div class="showcase-card__distribution-group">
      <h2 class="showcase-card__distribution-title">Elements</h2>
      {#each viewModel.elementDistribution as bucket}
        <div class="showcase-card__bucket">
          <span class="showcase-card__bucket-label">{bucket.label}</span>
          <span class="showcase-card__bucket-count">{bucket.count}</span>
        </div>
      {/each}
    </div>
    <div class="showcase-card__distribution-group">
      <h2 class="showcase-card__distribution-title">Connectivity</h2>
      {#each viewModel.variableConnectivity as bucket}
        <div class="showcase-card__bucket">
          <span class="showcase-card__bucket-label">{bucket.label}</span>
          <span class="showcase-card__bucket-count">{bucket.count}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="showcase-card__findings">
    <div class="showcase-card__finding">
      <span class="showcase-card__finding-label">Errors</span>
      <span class="showcase-card__finding-value">{viewModel.findings.error}</span>
    </div>
    <div class="showcase-card__finding">
      <span class="showcase-card__finding-label">Warnings</span>
      <span class="showcase-card__finding-value">{viewModel.findings.warning}</span>
    </div>
    <div class="showcase-card__finding">
      <span class="showcase-card__finding-label">Info</span>
      <span class="showcase-card__finding-value">{viewModel.findings.information}</span>
    </div>
  </section>

  <footer class="showcase-card__footer">
    <span class="showcase-card__generated">{viewModel.generatedAtLabel}</span>
  </footer>
</div>

<style>
  .showcase-card {
    display: flex;
    flex-direction: column;
    padding: 40px 48px;
    box-sizing: border-box;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
  }

  .showcase-card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .showcase-card__identity {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .showcase-card__type {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
  }

  .showcase-card__name {
    font-size: 32px;
    font-weight: 700;
    margin: 0;
    color: #f1f5f9;
  }

  .showcase-card__freshness {
    font-size: 14px;
    padding: 4px 12px;
    border-radius: 4px;
    background-color: #1e293b;
    color: #94a3b8;
  }

  .showcase-card__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 24px;
    padding: 20px 0;
  }

  .showcase-card__hero-label {
    font-size: 15px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .showcase-card__hero-value {
    font-size: 56px;
    font-weight: 800;
    color: #38bdf8;
    line-height: 1.1;
  }

  .showcase-card__metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 16px;
  }

  .showcase-card__metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 16px;
    background-color: #1e293b;
    border-radius: 6px;
    min-width: 100px;
  }

  .showcase-card__metric-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .showcase-card__metric-value {
    font-size: 22px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .showcase-card__distributions {
    display: flex;
    gap: 32px;
    margin-top: 20px;
  }

  .showcase-card__distribution-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .showcase-card__distribution-title {
    font-size: 14px;
    color: #94a3b8;
    margin: 0 0 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .showcase-card__bucket {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }

  .showcase-card__bucket-label {
    color: #cbd5e1;
  }

  .showcase-card__bucket-count {
    color: #e2e8f0;
    font-weight: 600;
  }

  .showcase-card__findings {
    display: flex;
    gap: 24px;
    margin-top: 20px;
  }

  .showcase-card__finding {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .showcase-card__finding-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .showcase-card__finding-value {
    font-size: 20px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .showcase-card__footer {
    margin-top: auto;
    display: flex;
    justify-content: flex-end;
  }

  .showcase-card__generated {
    font-size: 12px;
    color: #475569;
  }
</style>
