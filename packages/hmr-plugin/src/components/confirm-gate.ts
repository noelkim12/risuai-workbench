import type { ConfirmDiff } from '../hmr/diff';

export type DiffLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly diff: ConfirmDiff }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'stale'; readonly message: string }
  | { readonly status: 'target-missing'; readonly message: string };

export function needsConsent(state: DiffLoadState): boolean {
  return state.status === 'ready' && (state.diff.conflicts?.length ?? 0) === 0 && state.diff.status === 'different';
}

export function canStart(state: DiffLoadState, agreed: boolean): boolean {
  if (state.status !== 'ready' || (state.diff.conflicts?.length ?? 0) > 0) return false;
  if (state.status === 'ready' && state.diff.status === 'identical') return true;
  return agreed;
}
