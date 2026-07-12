<script lang="ts">
  import CreateArtifactWizard from './lib/components/CreateArtifactWizard.svelte';
  import type { ArtifactBrowserCreateArtifactPayload } from './lib/types';

  export let onCreate: (payload: ArtifactBrowserCreateArtifactPayload) => void;
  export let onClose: () => void;
</script>

<div class="create-wizard-page">
  <CreateArtifactWizard open={true} onCreate={onCreate} onClose={onClose} />
</div>

<style>
  /* The wizard's own .modal-backdrop is position:fixed inset:0, so it already
     fills the editor tab and centers the card. This wrapper just guarantees the
     mount point spans the tab height. */
  .create-wizard-page {
    min-height: 100vh;
  }
</style>
