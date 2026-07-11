import type { HmrPublicState } from './hmr/controller';

const initial: HmrPublicState = { phase: 'idle', appliedVersion: 0, updateCount: 0, badgeEnabled: false };

export const hmrState: { current: HmrPublicState } = $state({ current: initial });

export function publishState(next: HmrPublicState): void {
  hmrState.current = next;
}
