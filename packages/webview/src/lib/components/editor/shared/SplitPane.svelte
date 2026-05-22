<!--
  Horizontal split pane with pointer-driven ratio updates.
  @file packages/webview/src/lib/components/editor/shared/SplitPane.svelte
-->

<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';

  export let ratio: number;
  export let onRatioChange: (ratio: number) => void;
  export let children: Snippet;

  let root: HTMLDivElement;
  let draggingPointerId: number | undefined;

  onDestroy(() => {
    stopResize();
  });

  /**
   * clampRatio 함수.
   * extension-host preference guard와 동일한 0.2..0.8 범위로 제한함.
   *
   * @param value - pointer 위치에서 계산한 raw ratio
   * @returns 저장 가능한 split ratio
   */
  function clampRatio(value: number): number {
    return Math.min(0.8, Math.max(0.2, value));
  }

  /**
   * startResize 함수.
   * pointer capture를 시작하고 현재 x 좌표를 split ratio로 변환함.
   *
   * @param event - handle pointerdown event
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this resize pointer handler.
  function startResize(event: PointerEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    draggingPointerId = event.pointerId;
    target.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', updateRatioFromPointer);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    updateRatioFromPointer(event);
  }

  /**
   * stopResize 함수.
   * window-level pointer listener를 정리해 drag 종료 후 stale resize를 막음.
   */
  function stopResize(): void {
    draggingPointerId = undefined;
    window.removeEventListener('pointermove', updateRatioFromPointer);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  }

  /**
   * updateRatioFromPointer 함수.
   * pane 내부 pointer x 좌표를 0.2..0.8 split ratio로 반영함.
   *
   * @param event - pointer move/down event
   */
  function updateRatioFromPointer(event: PointerEvent): void {
    if (draggingPointerId !== undefined && event.pointerId !== draggingPointerId) return;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return;
    onRatioChange(clampRatio((event.clientX - rect.left) / rect.width));
  }

  /**
   * handleResizeKeydown 함수.
   * keyboard 사용자가 separator를 좌우 방향키로 조절할 수 있게 함.
   *
   * @param event - resize handle keydown event
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup binds this keyboard resize handler.
  function handleResizeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    onRatioChange(clampRatio(ratio + direction * 0.02));
  }
</script>

<div class="split-pane" bind:this={root} style={`--split-pane-ratio: ${ratio};`}>
  {@render children()}
  <button
    type="button"
    class="split-pane__handle"
    aria-label="Resize authoring and result panes"
    title={`Editor ${Math.round(ratio * 100)}% / Preview ${Math.round((1 - ratio) * 100)}%`}
    onpointerdown={startResize}
    onkeydown={handleResizeKeydown}
  ></button>
</div>
