<script lang="ts">
  import ConfirmScreen from "./components/ConfirmScreen.svelte";
  import ConnectScreen from "./components/ConnectScreen.svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import SelectScreen from "./components/SelectScreen.svelte";
  import type { WizardSelection } from "./components/selection";
  import { risuUi } from "./helpers/risu-api";
  import type { HmrController } from "./hmr/controller";
  import type { HmrHealthResponse } from "./hmr/protocol";
  import type { PreviewSnapshot } from "./hmr/preview";
  import { hmrState } from "./state.svelte";

  type Props = {
    readonly controller: HmrController;
    readonly recentLabel: string | null;
    readonly onClose: () => void;
  };
  const { controller, recentLabel, onClose }: Props = $props();

  type Screen = "connect" | "select" | "confirm" | "dashboard";
  const RUNNING_PHASES = ["initialSync", "active", "paused", "reconnecting", "stoppedError"];
  const STEPS: readonly { key: Screen; label: string }[] = [
    { key: "connect", label: "연결" },
    { key: "select", label: "대상" },
    { key: "confirm", label: "확인" },
    { key: "dashboard", label: "수신" },
  ];

  // 자동 재연결이 이미 수신 중이면 대시보드로 바로 진입
  let screen = $state<Screen>(RUNNING_PHASES.includes(hmrState.current.phase) ? "dashboard" : "connect");
  let project = $state<HmrHealthResponse["project"] | null>(null);
  let selection = $state<WizardSelection | null>(null);
  let permissionError = $state<string | null>(null);

  const stepIndex = $derived(STEPS.findIndex((step) => step.key === screen));

  const requestInitialPermissions = async (): Promise<void> => {
    permissionError = null;
    const granted = await risuUi.requestRequiredPermissions();
    if (!granted) {
      permissionError = "RisuAI DB/mainDom 권한이 필요합니다. 권한을 허용한 뒤 다시 열어주세요.";
    }
  };

  const startReceiving = async (badgeEnabled: boolean, snapshot: PreviewSnapshot): Promise<void> => {
    if (!selection) return;
    await controller.confirmAndStart({ ...selection, badgeEnabled, mergeMode: snapshot.mode }, snapshot);
    screen = "dashboard";
  };

  void requestInitialPermissions().catch((error: unknown) => {
    permissionError = error instanceof Error ? error.message : String(error);
  });
</script>

<main class="shell">
  <section class="panel">
    <header class="masthead">
      <div class="brand">
        <span class="bolt" aria-hidden="true">⚡</span>
        <div>
          <p class="brand-name">Workbench HMR</p>
          <p class="brand-sub">Live Sync Receiver</p>
        </div>
      </div>
      <button class="icon-close" type="button" aria-label="닫기" onclick={onClose}>✕</button>
    </header>
    <ol class="stepper">
      {#each STEPS as step, index (step.key)}
        <li
          class="step"
          class:active={index === stepIndex}
          class:done={index < stepIndex}
          aria-current={index === stepIndex ? "step" : undefined}
        >
          <span class="step-num">{index < stepIndex ? "✓" : index + 1}</span>
          {step.label}
        </li>
      {/each}
    </ol>
    {#if permissionError}<p class="error">{permissionError}</p>{/if}
    {#if screen === "connect"}
      <ConnectScreen
        {controller}
        {recentLabel}
        onConnected={(health) => {
          project = health.project;
          screen = "select";
        }}
        onReconnected={() => {
          screen = "dashboard";
        }}
      />
    {:else if screen === "select" && project}
      <SelectScreen
        {controller}
        kind={project.kind}
        projectName={project.name}
        onSelected={(picked) => {
          selection = picked;
          screen = "confirm";
        }}
      />
    {:else if screen === "confirm" && project && selection}
      {@const confirmSelection = selection}
      <ConfirmScreen
        projectName={project.name}
        kind={confirmSelection.kind}
        selection={confirmSelection}
        loadPreview={(mode) => controller.prepareConfirmPreview(confirmSelection, mode)}
        onBack={() => {
          screen = "select";
        }}
        onStart={startReceiving}
      />
    {:else}
      <Dashboard
        {controller}
        state={hmrState.current}
        onDisconnected={() => {
          project = null;
          selection = null;
          screen = "connect";
        }}
      />
    {/if}
  </section>
</main>
