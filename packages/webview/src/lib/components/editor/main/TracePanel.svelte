<!--
  Main editor preview trace and diagnostics panel.
  @file packages/webview/src/lib/components/editor/main/TracePanel.svelte
-->

<script lang="ts">
  import type { MainEditorPreviewRuntimeResultPayload } from '../../../types/mainEditor';

  export let preview: MainEditorPreviewRuntimeResultPayload | null;
  export let compact = false;

  let activeTab: 'trace' | 'effects' | 'diagnostics' = 'trace';
</script>

<section class="trace-panel" class:trace-panel--compact={compact} aria-label="Preview trace and diagnostics">
  <div class="trace-panel__tabs" role="tablist" aria-label="Trace tabs">
    <button type="button" class:active={activeTab === 'trace'} onclick={() => (activeTab = 'trace')}>Trace</button>
    <button type="button" class:active={activeTab === 'effects'} onclick={() => (activeTab = 'effects')}>Effects</button>
    <button type="button" class:active={activeTab === 'diagnostics'} onclick={() => (activeTab = 'diagnostics')}>Diagnostics</button>
  </div>

  {#if !preview}
    <p class="trace-panel__muted">Run preview to inspect trace evidence.</p>
  {:else if activeTab === 'trace'}
    <ol class="trace-panel__list">
      {#each preview.trace as event}
        <li><strong>{event.phase}</strong> {event.node ? `· ${event.node}` : ''}<br />{event.message}</li>
      {/each}
    </ol>
  {:else if activeTab === 'effects'}
    <ol class="trace-panel__list">
      {#each preview.effects as effect}
        <li><strong>{effect.operation}</strong> {effect.target ? `→ ${effect.target}` : ''}<br />{effect.valuePreview ?? ''} {effect.committed ? 'committed' : 'dry-run only'}</li>
      {/each}
    </ol>
  {:else}
    <ol class="trace-panel__list">
      {#each preview.diagnostics as diagnostic}
        <li data-severity={diagnostic.severity}><strong>{diagnostic.source}</strong> {diagnostic.code ? `· ${diagnostic.code}` : ''}<br />{diagnostic.message}</li>
      {/each}
    </ol>
  {/if}
</section>
