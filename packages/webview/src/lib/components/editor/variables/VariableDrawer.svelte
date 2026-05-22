<!--
  Main editor variable drawer with Used here and lazy sections.
  @file packages/webview/src/lib/components/editor/variables/VariableDrawer.svelte
-->

<script lang="ts">
  import type { MainEditorPreviewRuntimeResultPayload, MainEditorVariableBindingPayload } from '../../../types/mainEditor';
  import TracePanel from '../main/TracePanel.svelte';
  import { buildVariableDrawerSummary, createVariableBindingKey } from './variableDrawerTypes';
  import VariableDrawerSection from './VariableDrawerSection.svelte';
  import VariableRow from './VariableRow.svelte';

  export let open: boolean;
  export let bindings: MainEditorVariableBindingPayload[];
  export let preview: MainEditorPreviewRuntimeResultPayload | null;
  export let profileLabel: string;
  export let profileVariableCount: number;
  export let profileChatCount: number;
  export let profileHtmlCount: number;
  export let onClose: () => void;
  export let onRawChange: (variableName: string, rawValue: string) => void;
  export let onCandidateSelect: (variableName: string, value: string) => void;
  export let onLazySectionOpen: (section: 'workspace' | 'profiles' | 'traceContext') => void;
  export let onOpenSimulatorEditor: () => void;

  let workspaceOpen = false;
  let profilesOpen = false;
  let traceContextOpen = false;
  $: summary = buildVariableDrawerSummary(bindings, profileLabel);

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this lazy section toggle handler.
  function toggleLazy(section: 'workspace' | 'profiles' | 'traceContext'): void {
    let nextOpen = false;
    if (section === 'workspace') {
      workspaceOpen = !workspaceOpen;
      nextOpen = workspaceOpen;
    }
    if (section === 'profiles') {
      profilesOpen = !profilesOpen;
      nextOpen = profilesOpen;
    }
    if (section === 'traceContext') {
      traceContextOpen = !traceContextOpen;
      nextOpen = traceContextOpen;
    }
    if (nextOpen) onLazySectionOpen(section);
  }
</script>

<aside class="variable-drawer" class:variable-drawer--open={open} aria-label="Variables drawer" aria-hidden={!open}>
  <header class="variable-drawer__header">
    <div>
      <strong>Variables</strong>
      <span>Profile: {summary.profileLabel}</span>
      <small>{summary.usedCount} used / {summary.missingCount} missing / {summary.runtimeUnknownCount} runtimeUnknown</small>
    </div>
    <button type="button" onclick={onClose} aria-label="Close variables drawer" tabindex={open ? 0 : -1}>×</button>
  </header>

  <section class="variable-drawer__used" aria-label="Used here">
    <h3>Used here</h3>
    {#if bindings.length === 0}
      <p class="variable-drawer__muted">No variables found in the current preview target.</p>
    {:else}
      {#each bindings as binding (createVariableBindingKey(binding))}
        <VariableRow {binding} {onRawChange} {onCandidateSelect} />
      {/each}
    {/if}
  </section>

  <VariableDrawerSection
    title="Workspace variables"
    open={workspaceOpen}
    onToggle={() => toggleLazy('workspace')}
    description="Workspace candidates load lazily and merge into Used here rows."
  />
  <VariableDrawerSection
    title="Profiles"
    open={profilesOpen}
    onToggle={() => toggleLazy('profiles')}
    description={`Active profile ${summary.profileLabel}: ${profileVariableCount} variables · ${profileChatCount} chats · ${profileHtmlCount} HTML docs.`}
    actionLabel="Open simulator profile editor"
    onAction={onOpenSimulatorEditor}
  />
  <VariableDrawerSection
    title="Trace context"
    open={traceContextOpen}
    onToggle={() => toggleLazy('traceContext')}
    description="Trace, effects, and diagnostics are kept here so the preview output stays readable."
  >
    {#if traceContextOpen}
      <TracePanel {preview} compact />
    {/if}
  </VariableDrawerSection>
</aside>
