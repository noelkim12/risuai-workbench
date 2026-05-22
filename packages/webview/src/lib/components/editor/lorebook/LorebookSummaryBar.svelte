<!--
  Lorebook collapsed metadata summary bar.
  @file packages/webview/src/lib/components/editor/lorebook/LorebookSummaryBar.svelte
-->

<script lang="ts">
  import FrontmatterSummaryBar from '../shared/FrontmatterSummaryBar.svelte';
  import type { LorebookSummary } from './lorebookAuthoringTypes';

  export let summary: LorebookSummary;
  export let open: boolean;
  export let controlsId: string | undefined = undefined;
  export let onToggle: () => void;

  $: pills = [`mode: ${summary.mode}`, `keys: ${summary.keyCount}`, `secondary: ${summary.secondaryKeyCount}`, ...summary.booleanBadges] as const;
</script>

<FrontmatterSummaryBar title={summary.title} {pills} {open} {controlsId} onToggle={onToggle} />
