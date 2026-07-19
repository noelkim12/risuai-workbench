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
import './styles.css';

let mountedApp: ReturnType<typeof mount> | null = null;
let badge: Awaited<ReturnType<typeof createBadge>> = null;
let badgeRequested = false;
let panelOpen = false;

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

const handleState = (state: HmrPublicState): void => {
  publishState(state);
  if (!state.badgeEnabled) {
    badgeRequested = false;
    badge?.destroy();
    badge = null;
    return;
  }

  if (state.phase === 'active' && state.badgeEnabled && badge === null && !badgeRequested) {
    badgeRequested = true;
    void createBadge()
      .then((created) => {
        const current = controller.getState();
        if (!current.badgeEnabled) {
          created?.destroy();
          badgeRequested = false;
          return;
        }
        badge = created;
        badge?.update(current);
      })
      .catch((error: unknown) => {
        badgeRequested = false;
        console.error(`${PLUGIN_DISPLAY_NAME} badge creation failed`, error);
      });
  }
  badge?.update(state);
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

const initialPermissionsGranted = await risuUi
  .requestRequiredPermissions()
  .catch((error: unknown) => {
    console.error(`${PLUGIN_DISPLAY_NAME} permission preflight failed`, error);
    return false;
  });

if (initialPermissionsGranted) {
  await controller.tryAutoReconnect();
}

await risuai.onUnload(() => {
  controller.stopLoops();
  document.removeEventListener('visibilitychange', handleForegroundChange);
  window.removeEventListener('focus', handleForegroundChange);
  badge?.destroy();
  void toastPromise?.then((toast) => toast?.destroy());
  toastPromise = null;
  unmountCurrentApp();
});
