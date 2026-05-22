/**
 * Main editor draft synchronization state-machine helpers.
 * @file packages/webview/src/lib/components/editor/main/mainEditorDraftSync.ts
 */

export type MainEditorPendingRequestKind = 'raw' | 'structured';

export interface MainEditorDraftSyncState<TStructuredState = unknown> {
  rawText: string;
  draftText: string;
  documentVersion: number;
  pendingRequestId?: string;
  pendingRequestKind?: MainEditorPendingRequestKind;
  pendingSentText?: string;
  pendingStructuredState?: TStructuredState;
  queuedStructuredState?: TStructuredState;
  status?: string;
  shouldRescheduleRawEdit: boolean;
  shouldSendQueuedStructuredEdit: boolean;
}

/**
 * createInitialDraftSyncState 함수.
 * canonical raw text에서 draft sync state를 초기화함.
 *
 * @param rawText - host canonical document source
 * @param documentVersion - host TextDocument version
 * @returns pending flag가 비어 있는 draft sync state
 */
export function createInitialDraftSyncState<TStructuredState = unknown>(
  rawText: string,
  documentVersion: number,
): MainEditorDraftSyncState<TStructuredState> {
  return clearDraftSyncEffects({
    rawText,
    draftText: rawText,
    documentVersion,
  });
}

/**
 * markRawEditSent 함수.
 * raw edit request가 host로 전송된 상태를 기록함.
 *
 * @param state - 현재 draft sync state
 * @param sent - 전송 request와 draft snapshot
 * @returns raw pending request가 설정된 state
 */
export function markRawEditSent<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  sent: { requestId: string; sentText: string; draftText: string },
): MainEditorDraftSyncState<TStructuredState> {
  return clearDraftSyncEffects({
    ...state,
    draftText: sent.draftText,
    pendingRequestId: sent.requestId,
    pendingRequestKind: 'raw',
    pendingSentText: sent.sentText,
    pendingStructuredState: undefined,
  });
}

/**
 * markStructuredEditSent 함수.
 * structured edit request가 host로 전송된 상태를 기록함.
 *
 * @param state - 현재 draft sync state
 * @param sent - 전송 request와 structured state snapshot
 * @returns structured pending request가 설정된 state
 */
export function markStructuredEditSent<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  sent: { requestId: string; state: TStructuredState },
): MainEditorDraftSyncState<TStructuredState> {
  return clearDraftSyncEffects({
    ...state,
    pendingRequestId: sent.requestId,
    pendingRequestKind: 'structured',
    pendingSentText: undefined,
    pendingStructuredState: sent.state,
  });
}

/**
 * queueStructuredEdit 함수.
 * pending acknowledgement 뒤에 보낼 최신 structured state를 저장함.
 *
 * @param state - 현재 draft sync state
 * @param structuredState - 최신 lorebook structured editor state
 * @returns queued structured state가 설정된 state
 */
export function queueStructuredEdit<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  structuredState: TStructuredState,
): MainEditorDraftSyncState<TStructuredState> {
  return clearDraftSyncEffects({
    ...state,
    queuedStructuredState: structuredState,
  });
}

/**
 * applyExternalCanonicalSnapshot 함수.
 * host canonical snapshot을 적용하면서 newer local draft를 보존할지 결정함.
 *
 * @param state - 현재 draft sync state
 * @param snapshot - host가 보낸 canonical raw text와 document version
 * @returns canonical snapshot과 reschedule decision을 반영한 state
 */
export function applyExternalCanonicalSnapshot<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  snapshot: { rawText: string; documentVersion: number },
): MainEditorDraftSyncState<TStructuredState> {
  const hadLocalDraft = state.draftText !== state.rawText;
  const acknowledgedPendingText =
    state.pendingRequestKind === 'raw' && Boolean(state.pendingRequestId) && snapshot.rawText === state.pendingSentText;

  const base = clearDraftSyncEffects({
    ...state,
    rawText: snapshot.rawText,
    documentVersion: snapshot.documentVersion,
  });

  if (!hadLocalDraft || state.draftText === snapshot.rawText) {
    return {
      ...base,
      draftText: snapshot.rawText,
      pendingRequestId: state.pendingRequestKind === 'structured' ? state.pendingRequestId : undefined,
      pendingRequestKind: state.pendingRequestKind === 'structured' ? 'structured' : undefined,
      pendingSentText: undefined,
      pendingStructuredState: state.pendingRequestKind === 'structured' ? state.pendingStructuredState : undefined,
      status: `Synced canonical document v${snapshot.documentVersion}.`,
    };
  }

  if (acknowledgedPendingText) {
    return {
      ...base,
      draftText: state.draftText,
      pendingRequestId: undefined,
      pendingRequestKind: undefined,
      pendingSentText: undefined,
      pendingStructuredState: undefined,
      status: `Synced v${snapshot.documentVersion}; preserving newer local draft.`,
      shouldRescheduleRawEdit: true,
    };
  }

  return {
    ...base,
    draftText: state.draftText,
    status: `Canonical document changed to v${snapshot.documentVersion}; preserving local draft.`,
    shouldRescheduleRawEdit: !state.pendingRequestId,
  };
}

/**
 * hasLocalStructuredDraft 함수.
 * host snapshot보다 우선 보존해야 하는 structured editor draft가 있는지 확인함.
 *
 * @param state - 현재 draft sync state
 * @returns pending 또는 queued structured edit이 있으면 true
 */
export function hasLocalStructuredDraft<TStructuredState>(state: MainEditorDraftSyncState<TStructuredState>): boolean {
  return state.pendingStructuredState !== undefined || state.queuedStructuredState !== undefined;
}

/**
 * applyEditAcknowledgement 함수.
 * host editApplied acknowledgement를 pending request와 대조해 반영함.
 *
 * @param state - 현재 draft sync state
 * @param acknowledgement - host acknowledgement request id와 document version
 * @returns pending clear와 follow-up send decision을 반영한 state
 */
export function applyEditAcknowledgement<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  acknowledgement: { requestId: string; documentVersion: number },
): MainEditorDraftSyncState<TStructuredState> {
  if (acknowledgement.requestId !== state.pendingRequestId) {
    return clearDraftSyncEffects({
      ...state,
      documentVersion: acknowledgement.documentVersion,
      status: `Observed edit acknowledgement for document v${acknowledgement.documentVersion}.`,
    });
  }

  const next = clearDraftSyncEffects({
    ...state,
    documentVersion: acknowledgement.documentVersion,
    rawText: state.pendingRequestKind === 'raw' ? state.pendingSentText ?? state.rawText : state.rawText,
    pendingRequestId: undefined,
    pendingRequestKind: undefined,
    pendingSentText: undefined,
    pendingStructuredState: undefined,
    status: `Edit applied at document v${acknowledgement.documentVersion}.`,
  });

  return {
    ...next,
    shouldSendQueuedStructuredEdit: state.queuedStructuredState !== undefined,
    shouldRescheduleRawEdit: state.queuedStructuredState === undefined,
  };
}

/**
 * applyEditError 함수.
 * host error를 pending request와 대조해 local draft 보존 상태로 반영함.
 *
 * @param state - 현재 draft sync state
 * @param error - host error payload
 * @returns matching pending request가 clear된 state
 */
export function applyEditError<TStructuredState>(
  state: MainEditorDraftSyncState<TStructuredState>,
  error: { requestId?: string; code: string; message: string },
): MainEditorDraftSyncState<TStructuredState> {
  const matchingPendingRequest = Boolean(error.requestId) && error.requestId === state.pendingRequestId;
  return clearDraftSyncEffects({
    ...state,
    pendingRequestId: matchingPendingRequest ? undefined : state.pendingRequestId,
    pendingRequestKind: matchingPendingRequest ? undefined : state.pendingRequestKind,
    pendingSentText: matchingPendingRequest ? undefined : state.pendingSentText,
    pendingStructuredState: matchingPendingRequest ? undefined : state.pendingStructuredState,
    status: `${error.code}: ${error.message}`,
  });
}

function clearDraftSyncEffects<TStructuredState>(
  state: Omit<MainEditorDraftSyncState<TStructuredState>, 'shouldRescheduleRawEdit' | 'shouldSendQueuedStructuredEdit'> &
    Partial<Pick<MainEditorDraftSyncState<TStructuredState>, 'shouldRescheduleRawEdit' | 'shouldSendQueuedStructuredEdit'>>,
): MainEditorDraftSyncState<TStructuredState> {
  return {
    ...state,
    shouldRescheduleRawEdit: state.shouldRescheduleRawEdit ?? false,
    shouldSendQueuedStructuredEdit: state.shouldSendQueuedStructuredEdit ?? false,
  };
}
