<script lang="ts">
  import type { LineDiffResult } from '../../hmr/diff';
  import { namedListLabel } from '../../hmr/merge';
  import { canApply, type PreviewPart, type PreviewView } from '../view';

  const { part, view }: { readonly part: PreviewPart; readonly view: PreviewView } = $props();
  const labels = { added: '+ 추가', removed: '− 삭제', modified: '± 수정' } as const;
</script>

{#snippet lines(value: LineDiffResult)}
  {#if value.truncated}
    <p data-hmr-note>내용이 커서 줄 차이를 생략했습니다. {value.beforeLineCount}줄 → {value.afterLineCount}줄</p>
  {:else}
    <pre data-hmr-lines>{#each value.segments as segment}<span data-hmr-line={segment.kind}>{segment.text}</span>{/each}</pre>
  {/if}
{/snippet}

{#if part === 'header'}
  <div data-hmr-heading>
    <div><p data-hmr-eyebrow>WORKBENCH HMR · 수동 동기화</p><h2>변경 미리보기</h2></div>
    <button type="button" data-hmr-action="close" aria-label="미리보기 닫기" disabled={view.phase === 'applying'}>×</button>
  </div>
  <p data-hmr-target>{view.target}{view.version === null ? '' : ` · v${view.version}`}</p>
  <div data-hmr-modes role="group" aria-label="치환 방식">
    <button type="button" data-hmr-action="merge-by-name" aria-pressed={view.mode === 'merge-by-name'} disabled={view.phase === 'applying'}>이름 기준 병합</button>
    <button type="button" data-hmr-action="replace" aria-pressed={view.mode === 'replace'} disabled={view.phase === 'applying'}>전체 치환</button>
  </div>
  <p data-hmr-note>{view.mode === 'merge-by-name' ? '같은 이름은 교체하고 RisuAI에만 있는 항목은 유지합니다. 이름을 바꾸면 기존 항목을 유지하고 새 항목을 추가합니다.' : '관리 대상 목록을 전체 교체합니다. 워크벤치에 없는 항목은 삭제됩니다.'}</p>
{:else if part === 'body'}
  {#if view.phase === 'loading'}
    <p role="status">최신 변경을 읽고 있습니다…</p>
  {:else if view.phase === 'error'}
    <p data-hmr-error role="alert">{view.error}</p>
  {:else if view.diff}
    {#if (view.diff.conflicts?.length ?? 0) > 0}
      <p data-hmr-error role="alert">같은 이름의 항목이 여러 개 있어 이름 기준으로 병합할 수 없습니다. 중복된 이름을 고치거나 전체 치환을 선택하세요.</p>
      <ul>{#each view.diff.conflicts ?? [] as conflict}<li>{namedListLabel(conflict.key)} · {conflict.side === 'existing' ? 'RisuAI' : '워크벤치'} · {conflict.index + 1}번: 중복 이름 "{conflict.name}"</li>{/each}</ul>
    {/if}
    {#if view.diff.status === 'identical'}<p>RisuAI와 적용 결과가 동일합니다.</p>{/if}
    <ul data-hmr-fields>
      {#each view.diff.fields as field, index}
        <li>
          <button type="button" data-hmr-action="details" data-hmr-index={index} data-hmr-in-body aria-expanded={view.expanded.has(index)} disabled={view.phase === 'applying'}>
            <span>{view.expanded.has(index) ? '▾' : '▸'} {field.key}</span>
            <span data-hmr-kind={field.kind}>{field.preservedByMerge ? '유지' : labels[field.kind]}{field.entrySummary ? ` · +${field.entrySummary.added} ±${field.entrySummary.modified} −${field.entrySummary.removed}` : ''}</span>
          </button>
          {#if view.expanded.has(index)}
            {#if field.lines}{@render lines(field.lines)}{/if}
            {#each field.entries ?? [] as entry}
              <div data-hmr-entry><p data-hmr-kind={entry.kind}>{labels[entry.kind]} · {entry.label}</p>
                {#each entry.fields as entryField}<p data-hmr-note>{entryField.key}</p>{@render lines(entryField.lines)}{/each}
              </div>
            {/each}
          {/if}
        </li>
      {/each}
    </ul>
    {#each view.diff.preserved ?? [] as kept}
      <p data-hmr-note>유지 · {namedListLabel(kept.key)}{kept.labels.length ? `: ${kept.labels.join(', ')}` : ''}</p>
    {/each}
    {#if (view.diff.legacyFields?.length ?? 0) > 0}<p data-hmr-note>필드 전체 변경 (배열이 아닌 기존 형식): {view.diff.legacyFields?.join(', ')}</p>{/if}
    {#if view.diff.unchangedKeys.length > 0}<p data-hmr-note>동일 필드 {view.diff.unchangedKeys.length}개 · {view.diff.unchangedKeys.join(', ')}</p>{/if}
    {#if view.diff.assetSummary.count > 0}<p data-hmr-note>에셋 {view.diff.assetSummary.count}개 수신 예정 · {view.diff.assetSummary.totalBytes.toLocaleString()} B</p>{/if}
  {/if}
{:else}
  {#if view.phase === 'stale'}<p data-hmr-error role="alert">변경 내용이 달라졌습니다. 다시 읽고 확인하세요.</p>{/if}
  {#if view.phase === 'applying'}<p role="status">변경을 적용하고 있습니다…</p>{/if}
  {#if view.phase === 'ready'}
    <button type="button" data-hmr-action="agree" aria-pressed={view.agreed} disabled={(view.diff?.conflicts?.length ?? 0) > 0}>{view.agreed ? '☑' : '☐'} 위 변경 내용을 확인했습니다</button>
  {/if}
  <div data-hmr-footer-actions>
    <button type="button" data-hmr-action="cancel" disabled={view.phase === 'applying'}>취소</button>
    {#if view.phase === 'error' || view.phase === 'stale'}<button type="button" data-hmr-action="retry">다시 읽기</button>{/if}
    <button type="button" data-hmr-action="apply" data-hmr-primary disabled={!canApply(view)}>적용</button>
  </div>
{/if}
