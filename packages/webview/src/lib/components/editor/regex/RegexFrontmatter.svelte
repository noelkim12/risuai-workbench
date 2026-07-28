<!--
  Regex frontmatter authoring form.
  @file packages/webview/src/lib/components/editor/regex/RegexFrontmatter.svelte
-->

<script lang="ts">
  import type { RegexEditorState } from '@risuai-workbench/core';
  import type { MainEditorDocumentWarningPayload } from '../../../types/mainEditor';
  import FrontmatterSummaryBar from '../shared/FrontmatterSummaryBar.svelte';

  export let state: RegexEditorState;
  export let warnings: readonly MainEditorDocumentWarningPayload[];
  export let open: boolean;
  export let onToggleOpen: () => void;
  export let onChange: (state: RegexEditorState) => void;

  const REGEX_TYPES = ['editinput', 'editoutput', 'editdisplay', 'editprocess', 'edittrans', 'disabled'];
  const REGEX_FLAG_OPTIONS = [
    { label: 'Global (g)', value: 'g' },
    { label: 'Case Insensitive (i)', value: 'i' },
    { label: 'Multi Line (m)', value: 'm' },
    { label: 'Unicode (u)', value: 'u' },
    { label: 'Dot All (s)', value: 's' },
    { label: 'Move Top', value: '<move_top>' },
    { label: 'Move Bottom', value: '<move_bottom>' },
    { label: 'Repeat Back', value: '<repeat_back>' },
    { label: 'IN CBS Parsing', value: '<cbs>' },
    { label: 'No Newline Suffix', value: '<no_end_nl>' },
  ] as const;

  $: flagTokens = tokenizeRegexFlags(state.frontmatter.flag ?? '');
  $: summaryPills = [`type: ${state.frontmatter.type || 'editprocess'}`, `flag: ${state.frontmatter.flag || 'none'}`] as const;

  function updateFrontmatterField(key: 'comment' | 'flag' | 'type' | 'ableFlag', value: string): void {
    onChange({
      ...state,
      frontmatter: {
        ...state.frontmatter,
        [key]: value,
      },
    });
  }

  function updateFrontmatterFields(fields: Record<string, string>): void {
    onChange({
      ...state,
      frontmatter: {
        ...state.frontmatter,
        ...fields,
      },
    });
  }

  function tokenizeRegexFlags(raw: string): string[] {
    const tokens: string[] = [];
    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if (char.trim() === '') continue;
      if (char === '<') {
        const closingIndex = raw.indexOf('>', index + 1);
        tokens.push(closingIndex === -1 ? raw.slice(index) : raw.slice(index, closingIndex + 1));
        index = closingIndex === -1 ? raw.length : closingIndex;
        continue;
      }
      tokens.push(char);
    }
    return tokens;
  }

  function hasFlagToken(token: string): boolean {
    return flagTokens.includes(token);
  }

  function toggleFlagToken(token: string): void {
    const nextTokens = hasFlagToken(token) ? flagTokens.filter((candidate) => candidate !== token) : [...flagTokens, token];
    updateFrontmatterField('flag', nextTokens.join(''));
  }

  function getOrderFlag(raw: string): number {
    const order = raw.match(/<order\s+(-?\d+)>/)?.[1];
    return order === undefined ? 0 : Number.parseInt(order, 10);
  }

  function updateOrderFlag(order: number): void {
    const raw = state.frontmatter.flag ?? '';
    const orderToken = `<order ${order}>`;
    updateFrontmatterField('flag', raw.includes('<order') ? raw.replace(/<order\s+-?\d+>/, orderToken) : `${raw}${orderToken}`);
  }

  function updateAbleFlag(checked: boolean): void {
    updateFrontmatterFields({
      ableFlag: String(checked),
      flag: checked && !(state.frontmatter.flag ?? '') ? 'g' : (state.frontmatter.flag ?? ''),
    });
  }
</script>

<section class="regex-frontmatter" aria-label="Regex metadata">
  <FrontmatterSummaryBar title={state.frontmatter.comment || 'Untitled regex rule'} pills={summaryPills} {open} controlsId="regex-frontmatter-panel" onToggle={onToggleOpen} />

  {#if warnings.length > 0}
    <div class="lorebook-frontmatter__warnings" role="status" aria-live="polite">
      <strong>Document warnings</strong>
      <ul>
        {#each warnings as warning}
          <li>{warning.severity}: {warning.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if open}
    <div id="regex-frontmatter-panel" class="lorebook-frontmatter__grid">
      <label class="lorebook-frontmatter__field">
        <span>comment</span>
        <input type="text" value={state.frontmatter.comment ?? ''} oninput={(event) => updateFrontmatterField('comment', event.currentTarget.value)} />
      </label>
      <label class="lorebook-frontmatter__field">
        <span>type</span>
        <select value={state.frontmatter.type ?? 'editprocess'} onchange={(event) => updateFrontmatterField('type', event.currentTarget.value)}>
          {#each REGEX_TYPES as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </label>
      <div class="regex-frontmatter__flags lorebook-frontmatter__field lorebook-frontmatter__field--wide">
        <span>flags</span>
        <label class="regex-frontmatter__able-flag">
          <input type="checkbox" checked={state.frontmatter.ableFlag !== 'false'} onchange={(event) => updateAbleFlag(event.currentTarget.checked)} />
          <span>Enable RisuAI regex flags</span>
        </label>
        <div class="regex-frontmatter__flag-grid" aria-label="RisuAI regex flags">
          {#each REGEX_FLAG_OPTIONS as flag}
            <button
              type="button"
              class="regex-frontmatter__flag-button"
              class:regex-frontmatter__flag-button--active={hasFlagToken(flag.value)}
              aria-pressed={hasFlagToken(flag.value)}
              onclick={() => toggleFlagToken(flag.value)}
            >
              {flag.label}
            </button>
          {/each}
        </div>
        <label class="regex-frontmatter__order-flag">
          <span>Order Flag</span>
          <input type="number" value={getOrderFlag(state.frontmatter.flag ?? '')} onchange={(event) => updateOrderFlag(Number.parseInt(event.currentTarget.value, 10) || 0)} />
        </label>
        <output class="regex-frontmatter__flag-output">{state.frontmatter.flag || 'none'}</output>
      </div>
    </div>
  {/if}
</section>
