/**
 * Main editor draft sync state-machine tests.
 * @file packages/webview/tests/lib/components/editor/main/mainEditorDraftSync.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  applyEditAcknowledgement,
  applyEditError,
  applyExternalCanonicalSnapshot,
  createInitialDraftSyncState,
  hasLocalStructuredDraft,
  markRawEditSent,
  markStructuredEditSent,
  queueStructuredEdit,
} from '../../../../../src/lib/components/editor/main/mainEditorDraftSync';

describe('main editor draft sync state machine', () => {
  it('preserves a newer local raw draft when a pending edit is acknowledged by documentChanged', () => {
    const pending = markRawEditSent(createInitialDraftSyncState('A', 1), {
      requestId: 'raw-1',
      sentText: 'B',
      draftText: 'C',
    });
    const next = applyExternalCanonicalSnapshot(pending, { rawText: 'B', documentVersion: 2 });

    expect(next.pendingRequestId).toBeUndefined();
    expect(next.rawText).toBe('B');
    expect(next.draftText).toBe('C');
    expect(next.shouldRescheduleRawEdit).toBe(true);
  });

  it('keeps structured pending state across unrelated canonical refresh', () => {
    const state = markStructuredEditSent(createInitialDraftSyncState('A', 3), {
      requestId: 'structured-1',
      state: { contentText: 'draft' },
    });
    const next = applyExternalCanonicalSnapshot(state, { rawText: 'A from disk', documentVersion: 4 });

    expect(next.pendingRequestId).toBe('structured-1');
    expect(next.pendingRequestKind).toBe('structured');
    expect(next.rawText).toBe('A from disk');
  });

  it('marks queued structured state as sendable after acknowledgement', () => {
    const state = queueStructuredEdit(
      markStructuredEditSent(createInitialDraftSyncState('A', 1), {
        requestId: 'structured-1',
        state: { contentText: 'first' },
      }),
      { contentText: 'second' },
    );
    const next = applyEditAcknowledgement(state, { requestId: 'structured-1', documentVersion: 2 });

    expect(next.pendingRequestId).toBeUndefined();
    expect(next.queuedStructuredState).toEqual({ contentText: 'second' });
    expect(next.shouldSendQueuedStructuredEdit).toBe(true);
  });

  it('reports pending or queued structured drafts as local editor state', () => {
    const initial = createInitialDraftSyncState('A', 1);
    const pending = markStructuredEditSent(initial, {
      requestId: 'structured-1',
      state: { contentText: 'first' },
    });
    const queued = queueStructuredEdit(initial, { contentText: 'second' });

    expect(hasLocalStructuredDraft(initial)).toBe(false);
    expect(hasLocalStructuredDraft(pending)).toBe(true);
    expect(hasLocalStructuredDraft(queued)).toBe(true);
  });

  it('clears matching pending request on host error without clearing local draft text', () => {
    const state = markRawEditSent(createInitialDraftSyncState('A', 1), {
      requestId: 'raw-1',
      sentText: 'B',
      draftText: 'C',
    });
    const next = applyEditError(state, {
      requestId: 'raw-1',
      code: 'staleVersion',
      message: 'Edit request is based on an older document version.',
    });

    expect(next.pendingRequestId).toBeUndefined();
    expect(next.draftText).toBe('C');
    expect(next.status).toBe('staleVersion: Edit request is based on an older document version.');
  });
});
