<script lang="ts">
  import type { HmrController, HmrPublicState } from "../hmr/controller";

  type Props = {
    readonly controller: HmrController;
    readonly state: HmrPublicState;
    readonly onDisconnected: () => void;
  };
  const { controller, state, onDisconnected }: Props = $props();

  const PHASE_LABEL: Record<string, string> = {
    initialSync: "초기 동기화 중…",
    active: "수신 중",
    paused: "일시정지",
    reconnecting: "재연결 중…",
  };
  const phaseLabel = $derived(
    state.phase === "stoppedError"
      ? `정지: ${state.lastError ?? ""}`
      : (PHASE_LABEL[state.phase] ?? state.phase),
  );
  const progressPercent = $derived(
    state.syncProgress && state.syncProgress.total > 0
      ? Math.round((state.syncProgress.done / state.syncProgress.total) * 100)
      : 0,
  );

  const disconnect = async (): Promise<void> => {
    await controller.disconnect();
    onDisconnected();
  };
</script>

<section class="screen">
  <header class="screen-head">
    <h2>수신 상태</h2>
  </header>

  <div class="status-board">
    <span class="status-pill" data-phase={state.phase}>
      <span class="led" aria-hidden="true"></span>
      {phaseLabel}
    </span>
    {#if state.targetLabel}
      <span class="status-target mono">{state.targetLabel}</span>
    {/if}
  </div>

  <div class="stat-grid">
    <div class="stat">
      <span class="stat-label">적용 버전</span>
      <span class="stat-value">v{state.appliedVersion}</span>
    </div>
    <div class="stat">
      <span class="stat-label">갱신 횟수</span>
      <span class="stat-value">{state.updateCount}<small>회</small></span>
    </div>
  </div>

  {#if state.syncProgress}
    <div class="sync-progress">
      <span class="sync-progress-label">
        <span>{state.syncProgress.phase === "probe" ? "기존 에셋 확인" : "누락 에셋 수신"}</span>
        <span>{state.syncProgress.done}/{state.syncProgress.total}</span>
      </span>
      <div class="progress-track">
        <div class="progress-fill" style:width="{progressPercent}%"></div>
      </div>
    </div>
  {/if}

  <div class="actions">
    {#if state.phase === "paused"}
      <button type="button" onclick={() => controller.resume()}>재개</button>
    {:else}
      <button type="button" onclick={() => controller.pause()}>일시정지</button>
    {/if}
    <button class="danger" type="button" onclick={() => void disconnect()}>연결 해제</button>
  </div>
</section>
