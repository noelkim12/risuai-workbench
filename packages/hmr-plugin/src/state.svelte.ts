import type { HmrPublicState } from './hmr/controller';

const initial: HmrPublicState = { phase: 'idle', appliedVersion: 0, updateCount: 0, badgeEnabled: false, autoApply: true, mergeMode: 'merge-by-name', observedVersion: 0, previewBusy: false, applyBusy: false };

export const hmrState: { current: HmrPublicState } = $state({ current: initial });

export function publishState(next: HmrPublicState): void {
  hmrState.current = next;
}
