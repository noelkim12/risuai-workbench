// packages/hmr-plugin/src/helpers/badge.ts
/**
 * getRootDocument(mainDom 권한)로 host DOM 상단 중앙에 상주 배지를 붙인다.
 * 배지는 연결 상태(active/reconnecting/error)만 표현한다. "변경이 반영됨"이라는
 * 사건은 toast.ts가 담당한다 — 상태와 이벤트는 다른 채널이다.
 * 스타일은 DESIGN-lamborghini.md 시스템을 따른다: 블랙 서피스, 2px radius,
 * uppercase 마이크로 레이블, 상태는 LED 도트 색으로 표현 (active=gold).
 * 호스트 문서에는 keyframes를 주입할 수 없으므로 active 상태의 LED blink는
 * JS 인터벌로 opacity를 토글해 구현한다 (on-air 사인 느낌).
 * SafeElement의 모든 조작 메서드는 async — update/destroy는 fire-and-forget(void)로 처리.
 * 권한 거부 시 null — 배지 없이도 기능 저하 없음 (크리티컬은 alertError가 커버).
 */
import type { HmrPublicState } from '../hmr/controller';
import { applyStyles, getHostDocument } from './host-dom';

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
    return { text: state.targetLabel ?? '', tone: 'ok' };
  }
  if (state.phase === 'reconnecting') {
    return { text: `${state.targetLabel ?? ''} · 재연결 중…`, tone: 'warn' };
  }
  return { text: state.lastError ?? '확인 필요', tone: 'error' };
}

const HIDDEN_PHASES = ['idle', 'connecting', 'selecting', 'confirming'];

export async function createBadge(): Promise<{
  update(state: HmrPublicState): void;
  destroy(): void;
} | null> {
  const rootDocument = await getHostDocument();
  if (rootDocument === null) return null;

  // d.ts는 동기 시그니처지만 샌드박스 브리지 프록시는 모든 메서드가 Promise를 반환한다.
  const badge = await rootDocument.createElement('div');
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
    ['maxWidth', 'min(60vw, 480px)'],
    ['pointerEvents', 'none'],
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
    ['overflow', 'hidden'],
    ['textOverflow', 'ellipsis'],
  ]);

  await badge.appendChild(led);
  await badge.appendChild(prefix);
  await badge.appendChild(label);
  await rootDocument.appendChild(badge);

  return {
    update(state: HmrPublicState) {
      if (HIDDEN_PHASES.includes(state.phase)) {
        stopBlink();
        void badge.setStyle('display', 'none');
        return;
      }
      const { text, tone } = formatBadgeText(state);
      void badge.setStyle('display', 'flex');
      void badge.setStyle('borderColor', TONES[tone].border);
      void led.setStyle('background', TONES[tone].led);
      void label.setStyle('color', TONES[tone].text);
      void label.setTextContent(text);
      if (state.phase === 'active') startBlink();
      else stopBlink();
    },
    destroy() {
      stopBlink();
      void badge.remove();
    },
  };
}
