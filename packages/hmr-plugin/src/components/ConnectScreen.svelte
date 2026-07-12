<script lang="ts">
  import type { HmrController } from "../hmr/controller";
  import type { HmrHealthResponse } from "../hmr/protocol";

  type Props = {
    readonly controller: HmrController;
    readonly recentLabel: string | null;
    readonly onConnected: (health: HmrHealthResponse) => void;
    readonly onReconnected: () => void;
  };
  const { controller, recentLabel, onConnected, onReconnected }: Props = $props();

  let raw = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  const connect = async (): Promise<void> => {
    busy = true;
    error = null;
    try {
      onConnected(await controller.connect(raw));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  };

  const reconnect = async (): Promise<void> => {
    busy = true;
    error = null;
    const ok = await controller.tryAutoReconnect();
    busy = false;
    if (ok) onReconnected();
    else error = "자동 재연결 실패 — 연결 문자열을 다시 붙여넣으세요.";
  };
</script>

<section class="screen">
  <header class="screen-head">
    <h2>워크벤치와 연결</h2>
    <p class="note">
      워크벤치 상태 스트립의 [Copy connection string]으로 복사한 문자열을 붙여넣으세요.
    </p>
  </header>
  <div class="connect-row">
    <input
      placeholder="risu-hmr://127.0.0.1:41520#k=…"
      bind:value={raw}
      onkeydown={(event) => {
        if (event.key === "Enter" && !busy) void connect();
      }}
    />
    <button class="primary" type="button" disabled={busy} onclick={() => void connect()}>
      연결
    </button>
  </div>
  {#if recentLabel}
    <button class="recent-chip" type="button" disabled={busy} onclick={() => void reconnect()}>
      ↻ 최근 연결로 재연결 — {recentLabel}
    </button>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>
