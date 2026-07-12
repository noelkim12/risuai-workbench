// packages/hmr-plugin/src/helpers/toast.ts
/**
 * 호스트 DOM 상단(배지 아래)에 붙는 단일 슬롯 토스트.
 * 사건("변경이 반영됨")을 알린다 — 상태 표시는 badge.ts의 몫이다.
 * 새 notice가 오면 새 엘리먼트를 만들지 않고 제자리에서 텍스트를 갈고 타이머를 리셋한다.
 * SafeElement 조작이 async라 연속 show가 인터리브될 수 있으므로 시퀀스 번호로
 * 뒤늦게 재개된 렌더가 최신 텍스트를 덮어쓰는 것을 막는다.
 * 권한 거부 시 null — 토스트 없이도 기능 저하는 없다.
 */
import { applyStyles, getHostDocument } from './host-dom';
import type { HmrNotice } from '../hmr/notifier';

const GOLD = '#ffc000';
const SINGLE_HOLD_MS = 4_000;
const DIGEST_HOLD_MS = 6_000;

export function formatNotice(notice: HmrNotice): { readonly line1: string; readonly line2: string } {
  if (notice.kind === 'initial') {
    return { line1: `${notice.label} 연결됨`, line2: `v${notice.version} · 최신 상태 반영` };
  }

  if (notice.kind === 'single') {
    return {
      line1: `${notice.label} 업데이트 반영됨`,
      line2: notice.assetCount > 0 ? `v${notice.version} · 애셋 ${notice.assetCount}개` : `v${notice.version}`,
    };
  }

  const range = `v${notice.fromVersion} → v${notice.toVersion}`;
  return {
    line1: `자리를 비운 사이 ${notice.count}회 반영됨`,
    line2: notice.assetCount > 0 ? `${range} · 애셋 ${notice.assetCount}개` : range,
  };
}

export interface HmrToast {
  show(notice: HmrNotice): void;
  destroy(): void;
}

export async function createToast(): Promise<HmrToast | null> {
  const rootDocument = await getHostDocument();
  if (rootDocument === null) return null;

  const toast = await rootDocument.createElement('div');
  await applyStyles(toast, [
    ['position', 'fixed'],
    ['top', '48px'],
    ['left', '50%'],
    ['transform', 'translateX(-50%) translateY(-6px)'],
    ['zIndex', '999'],
    ['display', 'flex'],
    ['alignItems', 'center'],
    ['gap', '10px'],
    ['padding', '8px 16px'],
    ['border', '1px solid rgba(255, 255, 255, 0.35)'],
    ['borderRadius', '2px'],
    ['background', 'rgba(0, 0, 0, 0.92)'],
    ['color', '#ffffff'],
    ['fontFamily', '"Helvetica Neue", ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif'],
    ['lineHeight', '1.35'],
    ['letterSpacing', '0.04em'],
    ['whiteSpace', 'nowrap'],
    ['maxWidth', 'min(72vw, 520px)'],
    ['pointerEvents', 'none'],
    ['opacity', '0'],
    ['transition', 'opacity 200ms ease, transform 200ms ease'],
  ]);

  const led = await rootDocument.createElement('span');
  await applyStyles(led, [
    ['flex', 'none'],
    ['width', '7px'],
    ['height', '7px'],
    ['borderRadius', '50%'],
    ['background', GOLD],
    ['boxShadow', `0 0 6px ${GOLD}`],
  ]);

  const prefix = await rootDocument.createElement('span');
  await prefix.setTextContent('HMR');
  await applyStyles(prefix, [
    ['flex', 'none'],
    ['color', '#969696'],
    ['fontSize', '10px'],
    ['letterSpacing', '0.18em'],
    ['textTransform', 'uppercase'],
  ]);

  const column = await rootDocument.createElement('div');
  await applyStyles(column, [
    ['display', 'flex'],
    ['flexDirection', 'column'],
    ['overflow', 'hidden'],
  ]);

  const primary = await rootDocument.createElement('span');
  await applyStyles(primary, [
    ['fontSize', '12px'],
    ['overflow', 'hidden'],
    ['textOverflow', 'ellipsis'],
  ]);

  const secondary = await rootDocument.createElement('span');
  await applyStyles(secondary, [
    ['color', '#969696'],
    ['fontSize', '10px'],
    ['letterSpacing', '0.08em'],
    ['overflow', 'hidden'],
    ['textOverflow', 'ellipsis'],
  ]);

  await column.appendChild(primary);
  await column.appendChild(secondary);
  await toast.appendChild(led);
  await toast.appendChild(prefix);
  await toast.appendChild(column);
  await rootDocument.appendChild(toast);

  let sequence = 0;
  let renderQueue = Promise.resolve();
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const hide = (): void => {
    void toast.setStyle('opacity', '0');
    void toast.setStyle('transform', 'translateX(-50%) translateY(-6px)');
  };

  const render = async (notice: HmrNotice, mine: number): Promise<void> => {
    const { line1, line2 } = formatNotice(notice);
    await primary.setTextContent(line1);
    if (mine !== sequence || destroyed) return;
    await secondary.setTextContent(line2);
    if (mine !== sequence || destroyed) return;
    await toast.setStyle('opacity', '1');
    await toast.setStyle('transform', 'translateX(-50%) translateY(0)');
  };

  return {
    show(notice: HmrNotice): void {
      if (destroyed) return;
      const mine = ++sequence;
      if (hideTimer !== null) clearTimeout(hideTimer);
      renderQueue = renderQueue.then(() => render(notice, mine)).catch(() => {});
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (mine === sequence && !destroyed) hide();
      }, notice.kind === 'digest' ? DIGEST_HOLD_MS : SINGLE_HOLD_MS);
    },

    destroy(): void {
      destroyed = true;
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      void toast.remove();
    },
  };
}
