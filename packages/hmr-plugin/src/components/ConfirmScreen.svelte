<script lang="ts">
  import type { ConfirmDiff } from "../hmr/diff";
  import { HmrTargetMissingError } from "../hmr/controller";
  import { canStart, needsConsent, type DiffLoadState } from "./confirm-gate";
  import DiffSummary from "./DiffSummary.svelte";
  import type { WizardSelection } from "./selection";

  type Props = {
    readonly projectName: string;
    readonly kind: "character" | "module";
    readonly selection: WizardSelection;
    readonly loadDiff: () => Promise<ConfirmDiff>;
    readonly onBack: () => void;
    readonly onStart: (badgeEnabled: boolean) => void;
  };
  const { projectName, kind, selection, loadDiff, onBack, onStart }: Props = $props();

  let badgeEnabled = $state(true);
  let agreed = $state(false);
  let diffState = $state<DiffLoadState>({ status: "loading" });

  const refresh = async (): Promise<void> => {
    diffState = { status: "loading" };
    agreed = false;
    try {
      diffState = { status: "ready", diff: await loadDiff() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diffState =
        err instanceof HmrTargetMissingError
          ? { status: "target-missing", message }
          : { status: "error", message };
    }
  };
  void refresh();
</script>

<section class="screen">
  <header class="screen-head">
    <h2>연결 확인</h2>
    <p class="note">아래 워크벤치 프로젝트가 RisuAI 대상으로 실시간 반영됩니다.</p>
  </header>

  <div class="pair-card">
    <div class="pair-side">
      <span class="pair-label">Workbench</span>
      <span class="pair-value">{projectName}</span>
    </div>
    <span class="pair-arrow" aria-hidden="true">→</span>
    <div class="pair-side">
      <span class="pair-label">RisuAI · {kind}</span>
      <span class="pair-value">{selection.label}</span>
    </div>
  </div>
  {#if projectName !== selection.label}
    <p class="warn">⚠ 이름이 다릅니다 — 대상을 다시 확인하세요.</p>
  {/if}

  {#if diffState.status === "loading"}
    <p class="note">변경사항 확인 중…</p>
  {:else if diffState.status === "ready"}
    <DiffSummary diff={diffState.diff} />
  {:else if diffState.status === "target-missing"}
    <p class="error">{diffState.message}</p>
  {:else}
    <p class="error">변경사항을 불러오지 못했습니다: {diffState.message}</p>
    <button type="button" onclick={() => void refresh()}>다시 시도</button>
  {/if}

  <p class="note">RisuAI에서 한 정의 수정은 다음 저장 때 덮어써집니다. 채팅 기록은 안전합니다.</p>
  {#if needsConsent(diffState)}
    <label class="check-row">
      <input type="checkbox" bind:checked={agreed} />
      {#if diffState.status === "error"}
        차이를 확인할 수 없습니다 — 그래도 덮어쓰기에 동의합니다
      {:else}
        위 변경사항이 대상에 덮어써지는 것에 동의합니다
      {/if}
    </label>
  {/if}
  <label class="check-row">
    <input type="checkbox" bind:checked={badgeEnabled} />
    화면 알림 — 상태 배지와 변경 토스트 (권장, RisuAI가 화면 접근 권한을 물어요)
  </label>
  <div class="actions">
    <button type="button" onclick={onBack}>뒤로</button>
    <button
      class="primary"
      type="button"
      disabled={!canStart(diffState, agreed)}
      onclick={() => onStart(badgeEnabled)}
    >수신 시작</button>
  </div>
</section>
