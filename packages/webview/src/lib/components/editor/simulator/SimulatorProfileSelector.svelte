<!--
  Simulator profile selector for Main Editor format previews.
  @file packages/webview/src/lib/components/editor/simulator/SimulatorProfileSelector.svelte
-->

<script lang="ts">
  import type { MainEditorSimulatorProfilePayload } from '../../../types/mainEditor';

  export let profiles: MainEditorSimulatorProfilePayload[];
  export let activeProfileId: string;
  export let onSelect: (profileId: string) => void;
  export let onOpenEditor: () => void;

  $: activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
</script>

<section class="simulator-profile-selector" aria-label="Simulator profiles">
  <label>
    <span>Profile</span>
    <select value={activeProfileId} onchange={(event) => onSelect(event.currentTarget.value)}>
      {#each profiles as profile}
        <option value={profile.id}>{profile.name}</option>
      {/each}
    </select>
  </label>
  <button type="button" onclick={onOpenEditor}>Edit profile</button>
  {#if activeProfile}
    <small>{activeProfile.chatHistory.length} chats · {activeProfile.target.moduleIds.length} modules</small>
  {/if}
</section>
