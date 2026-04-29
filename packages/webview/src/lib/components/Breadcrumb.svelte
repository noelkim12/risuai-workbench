<script lang="ts">
  export let characterName: string;
  export let onBack: () => void;
</script>

<nav class="breadcrumb" aria-label="Character detail breadcrumb">
  <button type="button" class="breadcrumb__link" on:click={onBack}>Characters</button>
  <span class="breadcrumb__separator" aria-hidden="true">›</span>
  <span class="breadcrumb__current" aria-current="page">{characterName}</span>
</nav>
