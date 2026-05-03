<script lang="ts">
  export let artifactName: string;
  export let backLabel = 'Characters';
  export let ariaLabel = 'Artifact detail breadcrumb';
  export let onBack: () => void;
</script>

<nav class="breadcrumb" aria-label={ariaLabel}>
  <button type="button" class="breadcrumb__link" on:click={onBack}>{backLabel}</button>
  <span class="breadcrumb__separator" aria-hidden="true">›</span>
  <span class="breadcrumb__current" aria-current="page">{artifactName}</span>
</nav>
