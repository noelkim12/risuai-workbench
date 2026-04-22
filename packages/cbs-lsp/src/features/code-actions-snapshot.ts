/**
 * Code action normalized snapshot helpers for stable test and agent consumption.
 * @file packages/cbs-lsp/src/features/code-actions-snapshot.ts
 */

import type { CodeAction, Range as LspRange, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';

import {
  createCbsAgentProtocolMarker,
  createNormalizedRuntimeAvailabilitySnapshot,
  type NormalizedRuntimeAvailabilitySnapshot,
} from '../core';
import {
  normalizeHostDiagnosticForSnapshot,
  type NormalizedHostDiagnosticSnapshot,
} from '../utils/diagnostics-router';

export interface NormalizedCodeActionTextEditSnapshot {
  newText: string;
  range: LspRange;
}

export interface NormalizedCodeActionWorkspaceEditSnapshot {
  changes: Record<string, NormalizedCodeActionTextEditSnapshot[]> | null;
  documentChangesCount: number;
}

export interface NormalizedCodeActionSnapshot {
  edit: NormalizedCodeActionWorkspaceEditSnapshot | null;
  hasEdit: boolean;
  isNoopGuidance: boolean;
  isPreferred: boolean;
  kind: string | null;
  linkedDiagnostics: NormalizedHostDiagnosticSnapshot[];
  title: string;
}

export interface NormalizedCodeActionsEnvelopeSnapshot {
  schema: string;
  schemaVersion: string;
  actions: NormalizedCodeActionSnapshot[];
  availability: NormalizedRuntimeAvailabilitySnapshot;
}

/**
 * normalizeCodeActionForSnapshot 함수.
 * CodeAction 한 건을 stable field names와 stable nullability를 가진 JSON view로 정규화함.
 *
 * @param action - 정규화할 code action payload
 * @returns 테스트/agent 소비용 normalized code action snapshot
 */
export function normalizeCodeActionForSnapshot(
  action: CodeAction,
): NormalizedCodeActionSnapshot {
  const edit = normalizeWorkspaceEditForSnapshot(action.edit);

  return {
    edit,
    hasEdit: action.edit !== undefined,
    isNoopGuidance: action.edit !== undefined && isNormalizedWorkspaceEditNoop(edit),
    isPreferred: action.isPreferred ?? false,
    kind: action.kind ?? null,
    linkedDiagnostics: [...(action.diagnostics ?? [])]
      .map(normalizeHostDiagnosticForSnapshot)
      .sort(compareNormalizedCodeActionDiagnostic),
    title: action.title,
  };
}

/**
 * normalizeCodeActionsForSnapshot 함수.
 * CodeAction 배열을 deterministic ordering의 normalized JSON view로 변환함.
 *
 * @param actions - 정규화할 code action 목록
 * @returns stable ordering을 가진 normalized snapshot 배열
 */
export function normalizeCodeActionsForSnapshot(
  actions: readonly CodeAction[],
): NormalizedCodeActionSnapshot[] {
  return [...actions].map(normalizeCodeActionForSnapshot).sort(compareNormalizedCodeActions);
}

/**
 * normalizeCodeActionsEnvelopeForSnapshot 함수.
 * code action normalized view에 runtime availability snapshot을 함께 붙임.
 *
 * @param actions - 정규화할 code action 목록
 * @returns availability와 actions를 함께 담은 snapshot-friendly view
 */
export function normalizeCodeActionsEnvelopeForSnapshot(
  actions: readonly CodeAction[],
): NormalizedCodeActionsEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    actions: normalizeCodeActionsForSnapshot(actions),
    availability: createNormalizedRuntimeAvailabilitySnapshot(),
  };
}

/**
 * normalizeWorkspaceEditForSnapshot 함수.
 * WorkspaceEdit를 URI별 stable ordering과 stable TextEdit shape로 정규화함.
 *
 * @param edit - 정규화할 workspace edit
 * @returns deterministic workspace edit snapshot 또는 null
 */
function normalizeWorkspaceEditForSnapshot(
  edit: WorkspaceEdit | undefined,
): NormalizedCodeActionWorkspaceEditSnapshot | null {
  if (!edit) {
    return null;
  }

  const changesEntries = Object.entries(edit.changes ?? {})
    .sort(([leftUri], [rightUri]) => leftUri.localeCompare(rightUri))
    .map(([uri, textEdits]) => [
      uri,
      [...textEdits].map(normalizeTextEditForSnapshot).sort(compareNormalizedTextEdits),
    ] as const);

  return {
    changes: changesEntries.length > 0 ? Object.fromEntries(changesEntries) : null,
    documentChangesCount: edit.documentChanges?.length ?? 0,
  };
}

/**
 * normalizeTextEditForSnapshot 함수.
 * TextEdit 한 건을 stable JSON shape로 정규화함.
 *
 * @param textEdit - 정규화할 text edit
 * @returns stable field names를 가진 text edit snapshot
 */
function normalizeTextEditForSnapshot(textEdit: TextEdit): NormalizedCodeActionTextEditSnapshot {
  return {
    newText: textEdit.newText,
    range: textEdit.range,
  };
}

/**
 * isNormalizedWorkspaceEditNoop 함수.
 * normalized workspace edit가 실제 텍스트 변경을 만들지 않는 guidance/no-op인지 판정함.
 *
 * @param edit - 판정할 normalized workspace edit
 * @returns 의미 있는 document/text changes가 없으면 true
 */
function isNormalizedWorkspaceEditNoop(edit: NormalizedCodeActionWorkspaceEditSnapshot | null): boolean {
  if (!edit) {
    return false;
  }

  const changeCount = Object.values(edit.changes ?? {}).reduce(
    (count, textEdits) => count + textEdits.length,
    0,
  );

  return changeCount === 0 && edit.documentChangesCount === 0;
}

/**
 * compareNormalizedCodeActions 함수.
 * normalized code action snapshot 배열의 deterministic ordering을 보장함.
 *
 * @param left - 왼쪽 snapshot
 * @param right - 오른쪽 snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedCodeActions(
  left: NormalizedCodeActionSnapshot,
  right: NormalizedCodeActionSnapshot,
): number {
  return (
    compareStrings(left.title, right.title) ||
    compareStrings(left.kind, right.kind) ||
    compareBooleans(left.isPreferred, right.isPreferred) ||
    compareBooleans(left.hasEdit, right.hasEdit) ||
    compareBooleans(left.isNoopGuidance, right.isNoopGuidance) ||
    compareNormalizedCodeActionDiagnostics(left.linkedDiagnostics, right.linkedDiagnostics) ||
    compareNormalizedWorkspaceEdits(left.edit, right.edit)
  );
}

/**
 * compareNormalizedWorkspaceEdits 함수.
 * normalized workspace edit snapshot의 stable ordering을 비교함.
 *
 * @param left - 왼쪽 workspace edit snapshot
 * @param right - 오른쪽 workspace edit snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedWorkspaceEdits(
  left: NormalizedCodeActionWorkspaceEditSnapshot | null,
  right: NormalizedCodeActionWorkspaceEditSnapshot | null,
): number {
  return (
    compareNumbers(left?.documentChangesCount ?? null, right?.documentChangesCount ?? null) ||
    compareStrings(JSON.stringify(left?.changes ?? null), JSON.stringify(right?.changes ?? null))
  );
}

/**
 * compareNormalizedTextEdits 함수.
 * normalized text edit snapshot을 range/newText 기준으로 정렬함.
 *
 * @param left - 왼쪽 text edit snapshot
 * @param right - 오른쪽 text edit snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedTextEdits(
  left: NormalizedCodeActionTextEditSnapshot,
  right: NormalizedCodeActionTextEditSnapshot,
): number {
  return compareRanges(left.range, right.range) || compareStrings(left.newText, right.newText);
}

/**
 * compareNormalizedCodeActionDiagnostics 함수.
 * linked diagnostic snapshot 배열을 stable string form으로 비교함.
 *
 * @param left - 왼쪽 diagnostic snapshot 배열
 * @param right - 오른쪽 diagnostic snapshot 배열
 * @returns 정렬 비교값
 */
function compareNormalizedCodeActionDiagnostics(
  left: readonly NormalizedHostDiagnosticSnapshot[],
  right: readonly NormalizedHostDiagnosticSnapshot[],
): number {
  return compareStrings(JSON.stringify(left), JSON.stringify(right));
}

/**
 * compareNormalizedCodeActionDiagnostic 함수.
 * linked diagnostic snapshot 한 건씩을 stable string form으로 비교함.
 *
 * @param left - 왼쪽 diagnostic snapshot
 * @param right - 오른쪽 diagnostic snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedCodeActionDiagnostic(
  left: NormalizedHostDiagnosticSnapshot,
  right: NormalizedHostDiagnosticSnapshot,
): number {
  return compareStrings(JSON.stringify(left), JSON.stringify(right));
}

/**
 * compareRanges 함수.
 * LSP range 둘의 정렬 순서를 비교함.
 *
 * @param left - 왼쪽 range
 * @param right - 오른쪽 range
 * @returns 정렬 비교값
 */
function compareRanges(left: LspRange | null, right: LspRange | null): number {
  return comparePositions(left?.start ?? null, right?.start ?? null) || comparePositions(left?.end ?? null, right?.end ?? null);
}

/**
 * comparePositions 함수.
 * LSP position 둘의 정렬 순서를 비교함.
 *
 * @param left - 왼쪽 position
 * @param right - 오른쪽 position
 * @returns 정렬 비교값
 */
function comparePositions(
  left: LspRange['start'] | null,
  right: LspRange['start'] | null,
): number {
  return (
    compareNumbers(left?.line ?? null, right?.line ?? null) ||
    compareNumbers(left?.character ?? null, right?.character ?? null)
  );
}

/**
 * compareStrings 함수.
 * nullable string 두 값을 stable하게 비교함.
 *
 * @param left - 왼쪽 문자열
 * @param right - 오른쪽 문자열
 * @returns 정렬 비교값
 */
function compareStrings(left: string | null, right: string | null): number {
  return (left ?? '').localeCompare(right ?? '');
}

/**
 * compareNumbers 함수.
 * nullable number 두 값을 stable하게 비교함.
 *
 * @param left - 왼쪽 숫자
 * @param right - 오른쪽 숫자
 * @returns 정렬 비교값
 */
function compareNumbers(left: number | null, right: number | null): number {
  return (left ?? -1) - (right ?? -1);
}

/**
 * compareBooleans 함수.
 * boolean 두 값을 stable하게 비교함.
 *
 * @param left - 왼쪽 boolean
 * @param right - 오른쪽 boolean
 * @returns 정렬 비교값
 */
function compareBooleans(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}
