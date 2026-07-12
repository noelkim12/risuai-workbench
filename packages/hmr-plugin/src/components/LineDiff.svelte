<script lang="ts">
  import type { LineDiffResult } from "../hmr/diff";

  type Props = { readonly lines: LineDiffResult };
  const { lines }: Props = $props();
</script>

{#if lines.truncated}
  <p class="note">내용이 커서 상세 diff 생략 (워크벤치 {lines.afterLineCount}라인 / 대상 {lines.beforeLineCount}라인)</p>
{:else}
  <pre class="line-diff">{#each lines.segments as segment}<span
    class:diff-added={segment.kind === "added"}
    class:diff-removed={segment.kind === "removed"}>{segment.text}</span>{/each}</pre>
{/if}
