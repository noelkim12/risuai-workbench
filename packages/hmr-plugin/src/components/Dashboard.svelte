<script lang="ts">
  import type { HmrController, HmrPublicState } from "../hmr/controller";

  type Props = {
    readonly controller: HmrController;
    readonly state: HmrPublicState;
    readonly onDisconnected: () => void;
  };
  const { controller, state: currentState, onDisconnected }: Props = $props();
  let actionError = $state("");
  let actionBusy = $state(false);

  const PHASE_LABEL: Record<string, string> = {
    initialSync: "초기 동기화 중…",
    active: "수신 중",
    paused: "일시정지",
    reconnecting: "재연결 중…",
  };
  const phaseLabel = $derived(
    currentState.phase === "stoppedError"
      ? `정지: ${currentState.lastError ?? ""}`
      : (PHASE_LABEL[currentState.phase] ?? currentState.phase),
  );
  const progressPercent = $derived(
    currentState.syncProgress && currentState.syncProgress.total > 0
      ? Math.round((currentState.syncProgress.done / currentState.syncProgress.total) * 100)
      : 0,
  );

  const disconnect = async (): Promise<void> => {
    await controller.disconnect();
    onDisconnected();
  };
  const setPaused = async (paused: boolean): Promise<void> => {
    actionError = "";
    actionBusy = true;
    try {
      if (paused) await controller.pause();
      else await controller.resume();
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      actionBusy = false;
    }
  };
</script>

<section class="screen">
  <header class="screen-head">
    <h2>수신 상태</h2>
  </header>

  <div class="status-board">
    <span class="status-pill" data-phase={currentState.phase}>
      <span class="led" aria-hidden="true"></span>
      {phaseLabel}
    </span>
    {#if currentState.targetLabel}
      <span class="status-target mono">{currentState.targetLabel}</span>
    {/if}
  </div>

  <div class="stat-grid">
    <div class="stat">
      <span class="stat-label">적용 버전</span>
      <span class="stat-value">v{currentState.appliedVersion}</span>
    </div>
    <div class="stat">
      <span class="stat-label">갱신 횟수</span>
      <span class="stat-value">{currentState.updateCount}<small>회</small></span>
    </div>
  </div>

  {#if currentState.syncProgress}
    <div class="sync-progress">
      <span class="sync-progress-label">
        <span>{currentState.syncProgress.phase === "probe" ? "기존 에셋 확인" : "누락 에셋 수신"}</span>
        <span>{currentState.syncProgress.done}/{currentState.syncProgress.total}</span>
      </span>
      <div class="progress-track">
        <div class="progress-fill" style:width="{progressPercent}%"></div>
      </div>
    </div>
  {/if}

  {#if actionError || currentState.lastError}<p class="error">{actionError || currentState.lastError}</p>{/if}
  <div class="actions">
    {#if currentState.phase === "paused"}
      <button type="button" disabled={actionBusy} onclick={() => void setPaused(false)}>재개</button>
    {:else}
      <button type="button" disabled={actionBusy} onclick={() => void setPaused(true)}>일시정지</button>
    {/if}
    <button class="danger" type="button" disabled={actionBusy} onclick={() => void disconnect()}>연결 해제</button>
  </div>
</section>
