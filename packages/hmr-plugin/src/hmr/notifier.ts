/**
 * 가시성에 따라 HMR 이벤트를 즉시 알릴지 병합해 둘지 결정하는 순수 정책.
 * DOM도 타이머도 HMR 프로토콜도 모른다 — isVisible/show만 주입받는다.
 * 숨김 중 도착한 initialSynced는 버린다: 복귀 시 "연결됨"을 뒤늦게 알리는 건 소음이다.
 */
import type { HmrEvent } from './controller';

export type HmrNotice =
  | { readonly kind: 'initial'; readonly label: string; readonly version: number }
  | {
      readonly kind: 'single';
      readonly label: string;
      readonly version: number;
      readonly assetCount: number;
    }
  | {
      readonly kind: 'digest';
      readonly label: string;
      readonly count: number;
      readonly fromVersion: number;
      readonly toVersion: number;
      readonly assetCount: number;
    };

export interface NotifierDeps {
  isVisible(): boolean;
  show(notice: HmrNotice): void;
}

export interface HmrNotifier {
  notify(event: HmrEvent, label: string): void;
  flush(): void;
}

interface Pending {
  readonly label: string;
  readonly count: number;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly assetCount: number;
}

function toVisibleNotice(event: HmrEvent, label: string): HmrNotice {
  switch (event.kind) {
    case 'initialSynced':
      return { kind: 'initial', label, version: event.version };
    case 'applied':
      return { kind: 'single', label, version: event.version, assetCount: event.assetCount };
  }
}

function mergeApplied(pending: Pending | null, event: Extract<HmrEvent, { readonly kind: 'applied' }>, label: string): Pending {
  if (pending === null) {
    return {
      label,
      count: 1,
      fromVersion: event.fromVersion,
      toVersion: event.version,
      assetCount: event.assetCount,
    };
  }

  return {
    label,
    count: pending.count + 1,
    fromVersion: pending.fromVersion,
    toVersion: event.version,
    assetCount: pending.assetCount + event.assetCount,
  };
}

function toFlushNotice(pending: Pending): HmrNotice {
  if (pending.count === 1) {
    return {
      kind: 'single',
      label: pending.label,
      version: pending.toVersion,
      assetCount: pending.assetCount,
    };
  }

  return {
    kind: 'digest',
    label: pending.label,
    count: pending.count,
    fromVersion: pending.fromVersion,
    toVersion: pending.toVersion,
    assetCount: pending.assetCount,
  };
}

export function createNotifier(deps: NotifierDeps): HmrNotifier {
  let pending: Pending | null = null;

  return {
    notify(event: HmrEvent, label: string): void {
      if (deps.isVisible()) {
        deps.show(toVisibleNotice(event, label));
        return;
      }

      if (event.kind === 'initialSynced') {
        return;
      }

      pending = mergeApplied(pending, event, label);
    },

    flush(): void {
      if (pending === null) {
        return;
      }
      const merged = pending;
      pending = null;

      deps.show(toFlushNotice(merged));
    },
  };
}
