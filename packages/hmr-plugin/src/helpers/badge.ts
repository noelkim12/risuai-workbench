// packages/hmr-plugin/src/helpers/badge.ts
/**
 * getRootDocument(mainDom 권한)로 host DOM 상단 중앙에 상주 배지를 붙인다.
 * 연결 상태와 자동 변경 토글·수동 Sync를 표시한다. 반영 완료는 toast.ts가 알린다.
 * 스타일은 DESIGN-lamborghini.md 시스템을 따른다: 블랙 서피스, 2px radius,
 * uppercase 마이크로 레이블, 상태는 LED 도트 색으로 표현 (active=gold).
 * 호스트 문서에는 keyframes를 주입할 수 없으므로 active 상태의 LED blink는
 * JS 인터벌로 opacity를 토글해 구현한다 (on-air 사인 느낌).
 * SafeElement의 모든 조작 메서드는 async — update/destroy는 fire-and-forget(void)로 처리.
 * 권한 거부 시 null — 배지 없이도 기능 저하 없음 (크리티컬은 alertError가 커버).
 */
import type { HmrPublicState } from '../hmr/controller';
import { inside, pointOf } from '../root-ui/actions';
import { applyStyles, getHostDocument, removeLeftovers } from './host-dom';

const TONES = {
  ok: {
    led: '#ffc000',
    border: 'rgba(255, 255, 255, 0.35)',
    text: '#ffffff',
  },
  warn: {
    led: '#29abe2',
    border: 'rgba(41, 171, 226, 0.5)',
    text: '#29abe2',
  },
  error: {
    led: '#e05252',
    border: 'rgba(224, 82, 82, 0.5)',
    text: '#e05252',
  },
} as const;

function formatBadgeText(state: HmrPublicState): {
  text: string;
  tone: keyof typeof TONES;
} {
  if (state.phase === 'active') {
    return { text: `${state.targetLabel ?? ''}${state.pendingVersion !== undefined ? ' · 변경 대기' : ''}`, tone: 'ok' };
  }
  if (state.phase === 'paused') return { text: `${state.targetLabel ?? ''} · 일시 정지`, tone: 'warn' };
  if (state.phase === 'reconnecting') {
    return { text: `${state.targetLabel ?? ''} · 재연결 중…`, tone: 'warn' };
  }
  return { text: state.lastError ?? '확인 필요', tone: 'error' };
}

const HIDDEN_PHASES = ['idle', 'connecting', 'selecting', 'confirming', 'initialSync'];

export async function createBadge(callbacks: {
  readonly onToggle: (enabled: boolean) => Promise<void>;
  readonly onSync: () => Promise<void>;
}): Promise<{
  update(state: HmrPublicState, blocked?: boolean): void;
  focusSync(): Promise<void>;
  destroy(): Promise<void>;
} | null> {
  const rootDocument = await getHostDocument();
  if (rootDocument === null) return null;
  await removeLeftovers(rootDocument, '[x-workbench-hmr-badge]');

  // d.ts는 동기 시그니처지만 샌드박스 브리지 프록시는 모든 메서드가 Promise를 반환한다.
  const badge = await rootDocument.createElement('div');
  await badge.setAttribute('x-workbench-hmr-badge', 'true');
  await applyStyles(badge, [
    ['position', 'fixed'],
    ['top', '12px'],
    ['left', '50%'],
    ['transform', 'translateX(-50%)'],
    ['zIndex', '999'],
    ['display', 'none'],
    ['alignItems', 'center'],
    ['gap', '8px'],
    ['padding', '6px 14px'],
    ['border', `1px solid ${TONES.ok.border}`],
    ['borderRadius', '2px'],
    ['background', 'rgba(0, 0, 0, 0.92)'],
    ['color', '#ffffff'],
    ['fontFamily', '"Helvetica Neue", ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif'],
    ['fontSize', '11px'],
    ['fontWeight', '400'],
    ['lineHeight', '1'],
    ['letterSpacing', '0.04em'],
    ['whiteSpace', 'nowrap'],
    ['maxWidth', 'min(calc(100vw - 24px), 480px)'],
  ]);

  const led = await rootDocument.createElement('span');
  await applyStyles(led, [
    ['flex', 'none'],
    ['width', '7px'],
    ['height', '7px'],
    ['borderRadius', '50%'],
    ['background', TONES.ok.led],
    ['transition', 'opacity 350ms ease, box-shadow 350ms ease'],
  ]);

  // active일 때 on-air 사인처럼 LED를 점멸시킨다.
  const BLINK_INTERVAL_MS = 800;
  const LED_GLOW = '0 0 6px rgba(255, 192, 0, 0.8)';
  let blinkTimer: ReturnType<typeof setInterval> | null = null;
  let blinkOn = true;

  const startBlink = (): void => {
    if (blinkTimer !== null) return;
    blinkOn = true;
    void led.setStyle('boxShadow', LED_GLOW);
    blinkTimer = setInterval(() => {
      blinkOn = !blinkOn;
      void led.setStyle('opacity', blinkOn ? '1' : '0.25');
      void led.setStyle('boxShadow', blinkOn ? LED_GLOW : 'none');
    }, BLINK_INTERVAL_MS);
  };

  const stopBlink = (): void => {
    if (blinkTimer === null) return;
    clearInterval(blinkTimer);
    blinkTimer = null;
    void led.setStyle('opacity', '1');
    void led.setStyle('boxShadow', 'none');
  };

  const prefix = await rootDocument.createElement('span');
  await prefix.setTextContent('HMR');
  await applyStyles(prefix, [
    ['flex', 'none'],
    ['color', '#969696'],
    ['fontSize', '10px'],
    ['letterSpacing', '0.18em'],
    ['textTransform', 'uppercase'],
  ]);

  const label = await rootDocument.createElement('span');
  await applyStyles(label, [
    ['minWidth', '0'],
    ['overflow', 'hidden'],
    ['textOverflow', 'ellipsis'],
  ]);

  await badge.appendChild(led);
  await badge.appendChild(prefix);
  await badge.appendChild(label);
  const controls = await rootDocument.createElement('span');
  await applyStyles(controls, [['display', 'flex'], ['gap', '8px'], ['flexShrink', '0']]);
  await badge.appendChild(controls);
  const style = await rootDocument.createElement('style');
  await style.setTextContent('[x-workbench-hmr-badge] button { font: inherit; color: #fff; background: #202020; border: 1px solid rgba(255,255,255,.35); border-radius: 2px; padding: 8px; cursor: pointer; white-space: nowrap; } [x-workbench-hmr-badge] button:disabled { opacity: .5; cursor: default; } [x-workbench-hmr-badge] button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }');
  await badge.appendChild(style);
  await rootDocument.appendChild(badge);

  let latest: HmrPublicState | null = null;
  let blocked = false;
  let destroyed = false;
  let acting = false;
  let revision = 0;
  let controlHtml = '';
  let renderTail: Promise<void> = Promise.resolve();
  const unavailable = (): boolean => destroyed || !latest || blocked || acting || HIDDEN_PHASES.includes(latest.phase);
  const report = (error: unknown): void => console.warn('[hmr] badge failed:', error);

  function draw(): void {
    revision += 1;
    const render = async (): Promise<void> => {
      const state = latest;
      if (destroyed || !state) return;
      if (HIDDEN_PHASES.includes(state.phase)) {
        stopBlink();
        await badge.setStyle('display', 'none');
        return;
      }
      const { text, tone } = formatBadgeText(state);
      const auto = state.autoApply !== false;
      const disabled = unavailable() || (!auto && (state.previewBusy || state.applyBusy)) ? ' disabled' : '';
      const html = `<button type="button" data-hmr-badge-action="toggle" aria-pressed="${auto}"${disabled}>자동 변경 ${auto ? 'ON' : 'OFF'}</button>${auto ? '' : `<button type="button" data-hmr-badge-action="sync"${disabled}>Sync</button>`}`;
      if (html !== controlHtml) { await controls.setInnerHTML(html); controlHtml = html; }
      await badge.setStyle('borderColor', TONES[tone].border);
      await led.setStyle('background', TONES[tone].led);
      await label.setStyle('color', TONES[tone].text);
      await label.setTextContent(text);
      await badge.setStyle('display', 'flex');
      if (!destroyed && state.phase === 'active' && auto) startBlink();
      else stopBlink();
    };
    renderTail = renderTail.then(render, render).catch(report);
  }

  async function activate(action: 'toggle' | 'sync', before: number): Promise<void> {
    if (before !== revision || unavailable() || !latest || (latest.autoApply === false && (latest.previewBusy || latest.applyBusy)) || (action === 'sync' && latest.autoApply !== false)) return;
    const enable = latest.autoApply === false;
    if (action === 'toggle') {
      await callbacks.onToggle(enable);
      return;
    }
    acting = true;
    draw();
    try {
      await callbacks.onSync();
    } finally {
      acting = false;
      draw();
    }
  }

  async function handle(event: unknown, keyboard: boolean): Promise<void> {
    if (unavailable() || typeof event !== 'object' || event === null) return;
    const before = revision;
    const point = pointOf(event);
    if (keyboard) {
      if (!['Enter', ' '].includes(String(Reflect.get(event, 'key'))) || Reflect.get(event, 'repeat') === true) return;
    } else if (Reflect.get(event, 'button') !== 0 || !point || !inside(point, await badge.getBoundingClientRect())) return;
    for (const action of ['toggle', 'sync'] as const) {
      const button = await controls.querySelector(`button[data-hmr-badge-action="${action}"]:not(:disabled)`);
      if (button && (keyboard ? await button.matches(':focus') : point && inside(point, await button.getBoundingClientRect()))) {
        await activate(action, before);
        return;
      }
    }
  }
  const listeners: { type: string; id: string }[] = [];
  try {
    listeners.push({ type: 'click', id: await badge.addEventListener('click', (event: unknown) => { void handle(event, false).catch(report); }) });
    listeners.push({ type: 'keydown', id: await badge.addEventListener('keydown', (event: unknown) => { void handle(event, true).catch(report); }) });
  } catch (error) {
    for (const listener of listeners) await badge.removeEventListener(listener.type, listener.id);
    await badge.remove();
    throw error;
  }

  return {
    update(state, nextBlocked = false) {
      latest = state;
      blocked = nextBlocked;
      draw();
    },
    async focusSync() {
      await renderTail;
      if (destroyed || blocked || !latest || latest.autoApply !== false || HIDDEN_PHASES.includes(latest.phase)) return;
      await (await controls.querySelector('button[data-hmr-badge-action="sync"]'))?.focus();
    },
    destroy() {
      destroyed = true;
      revision += 1;
      stopBlink();
      return renderTail.then(async () => {
        for (const listener of listeners) await badge.removeEventListener(listener.type, listener.id);
        await badge.remove();
      }).catch(report);
    },
  };
}
