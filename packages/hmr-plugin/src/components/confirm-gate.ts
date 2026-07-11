import type { ConfirmDiff } from '../hmr/diff';

export type DiffLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly diff: ConfirmDiff }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'target-missing'; readonly message: string };

export function needsConsent(state: DiffLoadState): boolean {
  if (state.status === 'ready') return state.diff.status === 'different';
  return state.status === 'error';
}

export function canStart(state: DiffLoadState, agreed: boolean): boolean {
  if (state.status === 'loading' || state.status === 'target-missing') return false;
  if (state.status === 'ready' && state.diff.status === 'identical') return true;
  return agreed;
}
