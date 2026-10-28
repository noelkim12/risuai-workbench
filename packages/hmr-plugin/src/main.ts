/**
 * Workbench HMR receiver plugin entry.
 * Button/settings entry points open the fullscreen wizard; load attempts saved-mapping reconnect.
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from './constants/plugin';
import ErrorPanel from './ErrorPanel.svelte';
import { createBadge } from './helpers/badge';
import { isNotificationVisible } from './helpers/notification-visibility';
import { alertErrorSafe, createRisuControllerDeps, risuUi } from './helpers/risu-api';
import { createToast, type HmrToast } from './helpers/toast';
import { HmrController, type HmrEvent, type HmrPublicState } from './hmr/controller';
import { createNotifier } from './hmr/notifier';
import { publishState } from './state.svelte';
import { createPreviewModal, type PreviewModal } from './root-ui/preview-modal';
import './styles.css';

let mountedApp: ReturnType<typeof mount> | null = null;
let badge: Awaited<ReturnType<typeof createBadge>> = null;
let badgeRequested = false;
let panelOpen = false;
let unloaded = false;
let badgeGeneration = 0;
let previewPromise: Promise<PreviewModal> | null = null;
let previewVisible = false;
let previewGeneration = 0;

const PERMISSION_REQUIRED_MESSAGE =
  'PocketRisu에서 DB/mainDom 권한을 허용해야 모듈을 탐색할 수 있습니다. ' +
  '권한을 거부했다면 설정 > 플러그인에서 Risu Workbench HMR의 방패 버튼으로 권한을 초기화한 뒤 다시 열어주세요.';

// 핸들이 아니라 프로미스를 캐시한다. 첫 이벤트가 생성 완료를 기다리지 못하면 유실되고,
// then 콜백은 등록 순서대로 실행되므로 토스트 순서도 보존된다.
let toastPromise: Promise<HmrToast | null> | null = null;

const ensureToast = (): Promise<HmrToast | null> => {
  toastPromise ??= createToast().catch((error: unknown) => {
    console.error(`${PLUGIN_DISPLAY_NAME} toast creation failed`, error);
    return null;
  });
  return toastPromise;
};

const notifier = createNotifier({
  isVisible: () => isNotificationVisible({
    pageVisible: document.visibilityState === 'visible',
    panelOpen,
    iframeFocused: document.hasFocus(),
  }),
  show: (notice) => {
    void ensureToast().then((toast) => toast?.show(notice));
  },
});

const unmountCurrentApp = (): void => {
  if (mountedApp === null) {
    return;
  }

  unmount(mountedApp);
  mountedApp = null;
};

const closePanel = async (): Promise<void> => {
  unmountCurrentApp();
  await risuUi.hideContainer();
  panelOpen = false;
  notifier.flush();
};

const destroyPreview = (): Promise<void> => {
  previewGeneration += 1;
  previewVisible = false;
  const pending = previewPromise;
  previewPromise = null;
  return Promise.resolve(pending?.then((modal) => modal.destroy())).catch((error: unknown) => {
    console.warn(`${PLUGIN_DISPLAY_NAME} preview cleanup failed`, error);
  });
};

const openSync = async (): Promise<void> => {
  const state = controller.getState();
  if (unloaded || previewVisible || state.autoApply !== false || state.applyBusy || state.previewBusy) return;
  const generation = previewGeneration;
  previewVisible = true;
  badge?.update(state, true);
  try {
    previewPromise ??= createPreviewModal({
      prepare: (mode) => controller.prepareManualPreview(mode),
      apply: (snapshot) => controller.applyPreview(snapshot),
      onVisibilityChange: (visible) => {
        if (unloaded || generation !== previewGeneration) return;
        previewVisible = visible;
        badge?.update(controller.getState(), visible);
      },
      returnFocus: async () => { await badge?.focusSync(); },
      onError: (message) => { void alertErrorSafe(message); },
    });
    const modal = await previewPromise;
    if (unloaded || generation !== previewGeneration) return;
    await modal.update({ observedVersion: controller.getState().observedVersion ?? 0, applying: false });
    await modal.show(state.mergeMode ?? 'merge-by-name');
  } catch (error) {
    if (unloaded || generation !== previewGeneration) return;
    void destroyPreview();
    badge?.update(controller.getState(), false);
    await alertErrorSafe(error instanceof Error ? error.message : String(error));
  }
};

const toggleAutoApply = async (enabled: boolean): Promise<void> => {
  if (unloaded || previewVisible || (enabled && (controller.getState().applyBusy || controller.getState().previewBusy))) return;
  try {
    await controller.setAutoApply(enabled);
  } catch (error) {
    if (unloaded || controller.getState().autoApply !== enabled) return;
    await alertErrorSafe(error instanceof Error ? error.message : String(error));
  }
};

const handleState = (state: HmrPublicState): void => {
  if (unloaded) return;
  publishState(state);
  if (['idle', 'connecting', 'selecting', 'confirming', 'initialSync'].includes(state.phase)) {
    if (previewPromise || previewVisible) void destroyPreview();
  } else {
    void previewPromise?.then((modal) => modal.update({ observedVersion: state.observedVersion ?? 0, applying: state.applyBusy === true }))
      .catch((error: unknown) => console.warn(`${PLUGIN_DISPLAY_NAME} preview update failed`, error));
  }
  if (!state.badgeEnabled) {
    badgeGeneration += 1;
    badgeRequested = false;
    void badge?.destroy();
    badge = null;
    return;
  }

  if ((state.phase === 'active' || state.phase === 'paused') && state.badgeEnabled && badge === null && !badgeRequested) {
    badgeRequested = true;
    const generation = ++badgeGeneration;
    void createBadge({ onToggle: toggleAutoApply, onSync: openSync })
      .then((created) => {
        const current = controller.getState();
        if (unloaded || generation !== badgeGeneration || !current.badgeEnabled) {
          void created?.destroy();
          return;
        }
        badge = created;
        badge?.update(current, previewVisible);
      })
      .catch((error: unknown) => {
        badgeRequested = false;
        console.error(`${PLUGIN_DISPLAY_NAME} badge creation failed`, error);
      });
  }
  badge?.update(state, previewVisible);
};

const handleEvent = (event: HmrEvent): void => {
  try {
    const state = controller.getState();
    if (!state.badgeEnabled) return;
    notifier.notify(event, state.targetLabel ?? PLUGIN_DISPLAY_NAME);
  } catch (error) { // no-excuse-ok: catch — HMR 수신 루프로 예외를 전파하지 않는 경계다.
    console.error(`${PLUGIN_DISPLAY_NAME} notify failed`, error);
  }
};

const handleForegroundChange = (): void => {
  if (isNotificationVisible({
    pageVisible: document.visibilityState === 'visible',
    panelOpen,
    iframeFocused: document.hasFocus(),
  })) notifier.flush();
};

document.addEventListener('visibilitychange', handleForegroundChange);
window.addEventListener('focus', handleForegroundChange);

const controller = new HmrController(
  createRisuControllerDeps({ onState: handleState, onEvent: handleEvent }),
);

const renderErrorPanel = (message: string): void => {
  document.body.replaceChildren();
  mountedApp = mount(ErrorPanel, {
    target: document.body,
    props: {
      message,
      onClose: closePanel,
    },
  });
};

const openPanel = async (): Promise<void> => {
  if (unloaded) return;
  try {
    const permissionsGranted = await risuUi.requestRequiredPermissions();
    await risuUi.showContainer();
    panelOpen = true;
    unmountCurrentApp();
    if (!permissionsGranted) {
      renderErrorPanel(PERMISSION_REQUIRED_MESSAGE);
      return;
    }

    document.body.replaceChildren();
    mountedApp = mount(App, {
      target: document.body,
      props: {
        controller,
        recentLabel: await controller.getSavedTargetLabel(),
        onClose: () => void closePanel(),
      },
    });
  } catch (error) {
    unmountCurrentApp();
    const message = error instanceof Error ? error.message : 'Unknown plugin error';
    console.error(`${PLUGIN_DISPLAY_NAME} failed to open`, error);
    if (panelOpen) {
      renderErrorPanel(message);
    } else {
      await alertErrorSafe(message);
    }
  }
};

await risuai.registerButton(
  {
    name: PLUGIN_DISPLAY_NAME,
    icon: '<span aria-hidden="true">⚡</span>',
    iconType: 'html',
    location: 'chat',
    id: `${PLUGIN_NAME}-open`,
  },
  () => void openPanel(),
);
await risuai.registerButton(
  {
    name: PLUGIN_DISPLAY_NAME,
    icon: '<span aria-hidden="true">⚡</span>',
    iconType: 'html',
    location: 'hamburger',
    id: `${PLUGIN_NAME}-open`,
  },
  () => void openPanel(),
);

// RisuAI 초기 initialize 과정에서 권한 팝업이 씹히는 현상을 피하기 위해
// plugin init 이후 약 5초 지연시켜 권한 체크 및 요청을 수행한다.
// 버튼 클릭(openPanel) 시에도 동일한 요청이 수행되므로 사용자가 먼저 버튼을 누르면
// 권한이 이미 부여되어 있어 이 콜백은 no-op로 동작한다.
const initPermissionTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
  void risuUi
    .requestRequiredPermissions()
    .then((granted) => {
      if (granted && !unloaded) {
        return controller.tryAutoReconnect();
      }
      return;
    })
    .catch((error: unknown) => {
      console.error(`${PLUGIN_DISPLAY_NAME} delayed permission preflight failed`, error);
    });
}, 5000);

// RisuAI는 onUnload가 돌려준 Promise를 최대 1초 기다린 뒤 iframe을 종료하므로, 호스트 DOM 정리를 끝까지 기다리게 한다.
await risuai.onUnload(async () => {
  unloaded = true;
  badgeGeneration += 1;
  controller.stopLoops();
  clearTimeout(initPermissionTimer);
  document.removeEventListener('visibilitychange', handleForegroundChange);
  window.removeEventListener('focus', handleForegroundChange);
  unmountCurrentApp();
  const pendingToast = toastPromise;
  toastPromise = null;
  await Promise.allSettled([
    destroyPreview(),
    badge?.destroy(),
    pendingToast?.then((toast) => toast?.destroy()),
  ]);
});
