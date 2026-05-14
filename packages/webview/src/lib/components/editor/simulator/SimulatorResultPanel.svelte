<!--
  Simulator tab surface for format preview profile editing.
  @file packages/webview/src/lib/components/editor/simulator/SimulatorResultPanel.svelte
-->

<script lang="ts">
  import type { MainEditorSimulatorProfilePayload } from '../../../types/mainEditor';
  import SimulatorProfileEditor from './SimulatorProfileEditor.svelte';
  import SimulatorProfileSelector from './SimulatorProfileSelector.svelte';

  export let profiles: MainEditorSimulatorProfilePayload[];
  export let activeProfileId: string;
  export let profileDraft: MainEditorSimulatorProfilePayload;
  export let editorOpen: boolean;
  export let pending: boolean;
  export let status: string;
  export let onSelectProfile: (profileId: string) => void;
  export let onOpenEditor: () => void;
  export let onProfileDraftChange: (profile: MainEditorSimulatorProfilePayload) => void;
  export let onSaveProfile: () => void;
</script>

<section class="simulator-result-panel" aria-label="Simulator profiles panel">
  <SimulatorProfileSelector {profiles} {activeProfileId} onSelect={onSelectProfile} {onOpenEditor} />
  {#if editorOpen}
    <SimulatorProfileEditor profile={profileDraft} {pending} {status} onChange={onProfileDraftChange} onSave={onSaveProfile} />
  {:else}
    <div class="main-editor-simulator-placeholder">
      Select a profile to drive regex, prompt, and HTML preview context. Use Edit profile to stage changes, then Save profile explicitly.
    </div>
  {/if}
</section>
