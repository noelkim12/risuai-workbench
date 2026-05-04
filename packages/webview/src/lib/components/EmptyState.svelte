<script lang="ts">
  export let onRefresh: () => void;
</script>

<section class="empty-state" aria-label="No root-marker artifacts found">
  <p class="empty-state__eyebrow">No manifests</p>
  <h2>No .risuchar or .risumodule files found</h2>
  <p class="empty-state__copy">
    Open a workspace that contains extracted Risu character or module folders, then refresh discovery.
  </p>
  <button type="button" class="button-secondary" on:click={onRefresh}>Refresh discovery</button>
</section>
