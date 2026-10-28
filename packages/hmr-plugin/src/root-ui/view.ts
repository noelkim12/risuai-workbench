import { render } from 'svelte/server';

import type { ConfirmDiff } from '../hmr/diff';
import type { MergeMode } from '../hmr/merge';
import Preview from './view/Preview.svelte';

export interface PreviewView {
  readonly phase: 'loading' | 'ready' | 'error' | 'stale' | 'applying';
  readonly mode: MergeMode;
  readonly target: string;
  readonly version: number | null;
  readonly diff: ConfirmDiff | null;
  readonly error: string;
  readonly agreed: boolean;
  readonly expanded: ReadonlySet<number>;
}

export const PARTS = ['header', 'body', 'footer'] as const;
export type PreviewPart = typeof PARTS[number];

export function canApply(view: PreviewView): boolean {
  return view.phase === 'ready' && view.agreed && view.diff !== null
    && (view.diff.conflicts?.length ?? 0) === 0;
}

export function renderPart(part: PreviewPart, view: PreviewView): string {
  return render(Preview, { props: { part, view } }).body.replace(/<!--.*?-->/gs, '');
}
