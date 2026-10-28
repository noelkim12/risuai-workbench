import { buildDefinitionDiff, deepEqual, type ConfirmDiff } from './diff';
import { calculateEffectiveDefinition, convertCharacterToModuleDefinition, PRESERVED_CHARACTER_KEYS, type MergeMode } from './merge';
import type { HmrHealthResponse, HmrPayloadResponse } from './protocol';

export const MAX_PREVIEW_READ_ATTEMPTS = 2;

export interface PreviewTarget {
  readonly kind: 'character' | 'module';
  readonly id: string;
}

export interface PreviewSource {
  readonly stableId: string;
  readonly version: number;
  readonly payload: HmrPayloadResponse;
}

export interface PreviewSnapshot {
  readonly source: PreviewSource;
  readonly target: PreviewTarget;
  readonly mode: MergeMode;
  readonly existing: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly diff: ConfirmDiff;
}

export type PreviewReadResult =
  | { readonly status: 'ready'; readonly snapshot: PreviewSnapshot }
  | { readonly status: 'unstable-source' | 'kind-mismatch' };

export type PreviewValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'stale'; readonly reason: 'source' | 'target' | 'mode' | 'definition' };

export function createPreviewSnapshot(input: {
  readonly before: HmrHealthResponse;
  readonly after: HmrHealthResponse;
  readonly payload: HmrPayloadResponse;
  readonly target: PreviewTarget;
  readonly mode: MergeMode;
  readonly existing: Record<string, unknown>;
}): PreviewReadResult {
  const { before, after, mode } = input;
  if (before.project.stableId !== after.project.stableId || before.version !== after.version || before.project.kind !== after.project.kind) {
    return { status: 'unstable-source' };
  }
  if (input.payload.kind !== after.project.kind || (input.target.kind === 'character' && input.payload.kind !== 'character')) {
    return { status: 'kind-mismatch' };
  }
  const payload = structuredClone(input.payload);
  const existing = structuredClone(input.existing);
  const target = { ...input.target };
  const incoming = target.kind === 'module' && payload.kind === 'character'
    ? convertCharacterToModuleDefinition(payload.data)
    : payload.data;
  const effective = calculateEffectiveDefinition({ kind: target.kind, existing, incoming, mode });
  return {
    status: 'ready',
    snapshot: {
      source: { stableId: after.project.stableId, version: after.version, payload },
      target,
      mode,
      existing,
      after: effective.after,
      diff: buildDefinitionDiff({ kind: target.kind, existing, incoming, mode, assets: payload.assets, effective }),
    },
  };
}

function definitionFields(definition: Record<string, unknown>, kind: PreviewTarget['kind']): Record<string, unknown> {
  const protectedKeys: readonly string[] = kind === 'character' ? PRESERVED_CHARACTER_KEYS : ['id'];
  return Object.fromEntries(Object.entries(definition).filter(([key]) => !protectedKeys.includes(key)));
}

export function validatePreviewSnapshot(snapshot: PreviewSnapshot, current: {
  readonly source: PreviewSource;
  readonly target: PreviewTarget;
  readonly mode: MergeMode;
  readonly existing: Record<string, unknown>;
}): PreviewValidation {
  if (!deepEqual(snapshot.target, current.target)) return { status: 'stale', reason: 'target' };
  if (snapshot.mode !== current.mode) return { status: 'stale', reason: 'mode' };
  if (!deepEqual(snapshot.source, current.source)) return { status: 'stale', reason: 'source' };
  if (!deepEqual(definitionFields(snapshot.existing, snapshot.target.kind), definitionFields(current.existing, current.target.kind))) {
    return { status: 'stale', reason: 'definition' };
  }
  return { status: 'valid' };
}
