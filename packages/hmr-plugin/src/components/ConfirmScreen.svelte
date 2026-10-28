<script lang="ts">
  import { onDestroy } from "svelte";
  import type { MergeMode } from "../hmr/merge";
  import type { PreviewSnapshot } from "../hmr/preview";
  import { HmrTargetMissingError } from "../hmr/controller";
  import { canStart, needsConsent, type DiffLoadState } from "./confirm-gate";
  import DiffSummary from "./DiffSummary.svelte";
  import type { WizardSelection } from "./selection";

  type Props = {
    readonly projectName: string;
    readonly kind: "character" | "module";
    readonly selection: WizardSelection;
    readonly loadPreview: (mode: MergeMode) => Promise<PreviewSnapshot>;
    readonly onBack: () => void;
    readonly onStart: (badgeEnabled: boolean, snapshot: PreviewSnapshot) => Promise<void>;
  };
  const { projectName, kind, selection, loadPreview, onBack, onStart }: Props = $props();

  let badgeEnabled = $state(true);
  let agreed = $state(false);
  let diffState = $state<DiffLoadState>({ status: "loading" });
  let mode = $state<MergeMode>("merge-by-name");
  let snapshot = $state<PreviewSnapshot | null>(null);
  let starting = $state(false);
  let startError = $state("");
  let generation = 0;
  onDestroy(() => { generation += 1; });

  const refresh = async (): Promise<void> => {
    const current = ++generation;
    diffState = { status: "loading" };
    snapshot = null;
    agreed = false;
    try {
      const next = await loadPreview(mode);
      if (current !== generation) return;
      snapshot = next;
      diffState = { status: "ready", diff: next.diff };
    } catch (err) {
      if (current !== generation) return;
      const message = err instanceof Error ? err.message : String(err);
      diffState =
        err instanceof HmrTargetMissingError
          ? { status: "target-missing", message }
          : { status: "error", message };
    }
  };
  const start = async (): Promise<void> => {
    if (starting || !snapshot || !canStart(diffState, agreed)) return;
    starting = true;
    startError = "";
    const current = generation;
    try {
      await onStart(badgeEnabled, snapshot);
    } catch (err) {
      if (current !== generation) return;
      startError = err instanceof Error ? err.message : String(err);
      await refresh();
    } finally {
      starting = false;
    }
  };
  void refresh();
</script>

<section class="screen">
  <header class="screen-head">
    <h2>연결 확인</h2>
    <p class="note">아래 워크벤치 프로젝트가 RisuAI 캐릭터 카드에 실시간 반영됩니다.</p>
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

  <label>
    반영 방식
    <select bind:value={mode} disabled={starting} onchange={() => void refresh()}>
      <option value="merge-by-name">이름 기준 병합</option>
      <option value="replace">전체 치환</option>
    </select>
  </label>
  <p class="note">
    {mode === "merge-by-name"
      ? "같은 이름의 항목을 갱신하고 RisuAI에만 있는 항목은 유지합니다. 이름 변경은 기존 항목 유지와 새 항목 추가로 반영됩니다."
      : "로어·정규식·트리거 목록을 워크벤치 내용으로 교체합니다. 빈 목록은 비워집니다."}
  </p>

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

  {#if startError}<p class="error">{startError} 변경사항을 다시 확인하세요.</p>{/if}
  <p class="note">연결 후 자동 변경이 OFF으로 시작됩니다. 화면의 토글로 켜거나 Sync에서 직접 적용할 수 있습니다.</p>
  {#if needsConsent(diffState)}
    <label class="check-row">
      <input type="checkbox" bind:checked={agreed} disabled={starting} />
      위 변경사항이 RisuAI에 반영되는 것에 동의합니다
    </label>
  {/if}
  <label class="check-row">
    <input type="checkbox" bind:checked={badgeEnabled} disabled={starting} />
    화면 알림 — 상태 배지와 변경 토스트 (권장, RisuAI가 화면 접근 권한을 묻습니다)
  </label>
  <div class="actions">
    <button type="button" onclick={onBack} disabled={starting}>뒤로</button>
    <button
      class="primary"
      type="button"
      disabled={starting || !snapshot || !canStart(diffState, agreed)}
      onclick={() => void start()}
    >{starting ? "반영 중…" : "수신 시작"}</button>
  </div>
</section>
