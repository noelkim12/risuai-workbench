<script lang="ts">
  import type { ConfirmDiff, FieldDiff } from "../hmr/diff";
  import LineDiff from "./LineDiff.svelte";

  type Props = { readonly diff: ConfirmDiff };
  const { diff }: Props = $props();

  let expandedFields = $state<Set<string>>(new Set());
  let expandedEntries = $state<Set<string>>(new Set());
  let showUnchanged = $state(false);

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  type Tone = "add" | "remove" | "modify" | "neutral";

  const fieldBadge = (field: FieldDiff): { text: string; tone: Tone } => {
    if (field.kind === "added") return { text: "+ 추가", tone: "add" };
    if (field.kind === "removed") {
      return field.preservedByMerge
        ? { text: "대상에만 있음 (유지됨)", tone: "neutral" }
        : { text: "− 삭제됨", tone: "remove" };
    }
    if (field.entrySummary) {
      const { added, modified, removed } = field.entrySummary;
      const parts: string[] = [];
      if (added > 0) parts.push(`+${added}`);
      if (modified > 0) parts.push(`±${modified}`);
      if (removed > 0) parts.push(`−${removed}`);
      return { text: parts.join(" · "), tone: "modify" };
    }
    return { text: "± 수정됨", tone: "modify" };
  };

  const entryTone = (kind: "added" | "removed" | "modified"): Tone =>
    kind === "added" ? "add" : kind === "removed" ? "remove" : "modify";

  const entryIcon = (kind: "added" | "removed" | "modified"): string =>
    kind === "added" ? "+" : kind === "removed" ? "−" : "±";

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const expandable = (field: FieldDiff): boolean =>
    (field.entries !== undefined && field.entries.length > 0) || field.lines !== undefined;
</script>

<div class="diff-summary diff-card">
  {#if diff.status === "identical"}
    <p class="note">✓ 대상과 워크벤치 정의가 동일합니다.</p>
  {:else}
    <h3>변경 요약</h3>
    <ul class="diff-fields">
      {#each diff.fields as field (field.key)}
        {@const badge = fieldBadge(field)}
        <li>
          <button
            type="button"
            class="diff-row"
            disabled={!expandable(field)}
            onclick={() => (expandedFields = toggle(expandedFields, field.key))}
          >
            <span class="diff-key">{field.key}</span>
            <span class="diff-badge tone-{badge.tone}">{badge.text}</span>
          </button>
          {#if expandedFields.has(field.key)}
            {#if field.entries !== undefined}
              <ul class="diff-entries">
                {#each field.entries as entry, entryIndex (field.key + "/" + String(entryIndex))}
                  {@const entryKey = field.key + "/" + String(entryIndex)}
                  <li>
                    <button
                      type="button"
                      class="diff-row"
                      disabled={entry.fields.length === 0}
                      onclick={() => (expandedEntries = toggle(expandedEntries, entryKey))}
                    >
                      <span class="entry-icon tone-{entryTone(entry.kind)}">{entryIcon(entry.kind)}</span>
                      "{entry.label}"
                    </button>
                    {#if expandedEntries.has(entryKey)}
                      {#each entry.fields as entryField (entryField.key)}
                        <p class="diff-subkey">{entryField.key}</p>
                        <LineDiff lines={entryField.lines} />
                      {/each}
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else if field.lines !== undefined}
              <LineDiff lines={field.lines} />
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if diff.unchangedKeys.length > 0}
      <button type="button" class="diff-row" onclick={() => (showUnchanged = !showUnchanged)}>
        <span class="diff-badge">{showUnchanged ? "▾" : "▸"} 동일 필드 {diff.unchangedKeys.length}개</span>
      </button>
      {#if showUnchanged}<p class="note">{diff.unchangedKeys.join(", ")}</p>{/if}
    {/if}
  {/if}
  {#if diff.assetSummary.count > 0}
    <p class="diff-foot">
      에셋 {diff.assetSummary.count}개 수신 예정 · {formatBytes(diff.assetSummary.totalBytes)}
    </p>
  {/if}
</div>
