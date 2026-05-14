<!--
  Explicit-save simulator profile editor.
  @file packages/webview/src/lib/components/editor/simulator/SimulatorProfileEditor.svelte
-->

<script lang="ts">
  import type { MainEditorSimulatorProfilePayload } from '../../../types/mainEditor';

  export let profile: MainEditorSimulatorProfilePayload;
  export let pending: boolean;
  export let status: string;
  export let onChange: (profile: MainEditorSimulatorProfilePayload) => void;
  export let onSave: () => void;

  let editingProfileId = '';
  let chatHistoryJson = '[]';
  let validationError = '';

  $: if (profile.id !== editingProfileId) {
    editingProfileId = profile.id;
    chatHistoryJson = JSON.stringify(profile.chatHistory, null, 2);
    validationError = '';
  }

  function updateName(name: string): void {
    onChange({ ...profile, name });
  }

  function updateModules(rawValue: string): void {
    onChange({
      ...profile,
      target: {
        ...profile.target,
        moduleIds: rawValue.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      },
    });
  }

  function updateVariable(scope: keyof MainEditorSimulatorProfilePayload['variables'], rawValue: string): void {
    const parsed = parseKeyValueLines(rawValue);
    if (scope === 'toggleValues') {
      const toggles: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed)) toggles[key] = value === 'true';
      onChange({ ...profile, variables: { ...profile.variables, toggleValues: toggles } });
      return;
    }
    onChange({ ...profile, variables: { ...profile.variables, [scope]: parsed } });
  }

  function updateChatHistory(rawValue: string): void {
    chatHistoryJson = rawValue;
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (!isChatHistory(parsed)) {
        validationError = 'Chat history must be an array of { role, content, timestamp? } objects.';
        return;
      }
      validationError = '';
      onChange({ ...profile, chatHistory: parsed });
    } catch (error) {
      validationError = error instanceof Error ? `Invalid chat history JSON: ${error.message}` : 'Invalid chat history JSON.';
    }
  }

  function parseKeyValueLines(rawValue: string): Record<string, string> {
    const record: Record<string, string> = {};
    for (const line of rawValue.split('\n')) {
      const index = line.indexOf('=');
      if (index <= 0) continue;
      record[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return record;
  }

  function stringifyKeyValueLines(record: Record<string, string | boolean> | undefined): string {
    return Object.entries(record ?? {}).map(([key, value]) => `${key}=${String(value)}`).join('\n');
  }

  function isChatHistory(value: unknown): value is MainEditorSimulatorProfilePayload['chatHistory'] {
    return Array.isArray(value) && value.every((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const candidate = entry as Partial<MainEditorSimulatorProfilePayload['chatHistory'][number]>;
      return isChatRole(candidate.role) && typeof candidate.content === 'string' && (candidate.timestamp === undefined || typeof candidate.timestamp === 'string');
    });
  }

  function isChatRole(value: unknown): value is MainEditorSimulatorProfilePayload['chatHistory'][number]['role'] {
    return value === 'user' || value === 'assistant' || value === 'system' || value === 'bot';
  }
</script>

<section class="simulator-profile-editor" aria-label="Simulator profile editor">
  <header>
    <div>
      <strong>Simulator profile</strong>
      <span>{status}</span>
    </div>
    <button type="button" disabled={pending || validationError.length > 0} onclick={onSave}>Save profile</button>
  </header>

  <div class="simulator-profile-editor__grid">
    <label>
      <span>Name</span>
      <input value={profile.name} oninput={(event) => updateName(event.currentTarget.value)} />
    </label>
    <label>
      <span>Modules</span>
      <input value={profile.target.moduleIds.join(', ')} oninput={(event) => updateModules(event.currentTarget.value)} />
    </label>
  </div>

  <div class="simulator-profile-editor__grid simulator-profile-editor__grid--variables">
    <label>
      <span>Chat variables</span>
      <textarea value={stringifyKeyValueLines(profile.variables.chatVariables)} oninput={(event) => updateVariable('chatVariables', event.currentTarget.value)}></textarea>
    </label>
    <label>
      <span>Global variables</span>
      <textarea value={stringifyKeyValueLines(profile.variables.globalVariables)} oninput={(event) => updateVariable('globalVariables', event.currentTarget.value)}></textarea>
    </label>
    <label>
      <span>Toggles</span>
      <textarea value={stringifyKeyValueLines(profile.variables.toggleValues)} oninput={(event) => updateVariable('toggleValues', event.currentTarget.value)}></textarea>
    </label>
    <label>
      <span>Temp variables</span>
      <textarea value={stringifyKeyValueLines(profile.variables.tempVariables)} oninput={(event) => updateVariable('tempVariables', event.currentTarget.value)}></textarea>
    </label>
  </div>

  <label class="simulator-profile-editor__history">
    <span>Chat history JSON</span>
    <textarea value={chatHistoryJson} oninput={(event) => updateChatHistory(event.currentTarget.value)} spellcheck="false"></textarea>
  </label>
  {#if validationError}
    <p class="simulator-profile-editor__error" role="alert">{validationError}</p>
  {/if}
</section>
