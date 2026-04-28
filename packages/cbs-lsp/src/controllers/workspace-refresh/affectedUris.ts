/**
 * Workspace refresh affected URI helpers.
 * @file packages/cbs-lsp/src/controllers/workspace-refresh/affectedUris.ts
 */

import type { WorkspaceDiagnosticsState } from './refreshContracts';

/**
 * collectAffectedDiagnosticsUris 함수.
 * 변경 URI와 variable-flow 전파 대상 diagnostics URI를 수집함.
 *
 * @param changedUris - 직접 변경된 URI 목록
 * @param previousState - rebuild 이전 workspace state
 * @param nextState - rebuild 이후 workspace state
 * @returns 정렬·중복 제거된 diagnostics 대상 URI 목록
 */
export function collectAffectedDiagnosticsUris(
  changedUris: readonly string[],
  previousState: WorkspaceDiagnosticsState | null,
  nextState: WorkspaceDiagnosticsState | null,
): readonly string[] {
  const affected = new Set<string>(changedUris);

  for (const state of [previousState, nextState]) {
    if (!state) {
      continue;
    }

    for (const uri of state.variableFlowService.collectAffectedUris(changedUris)) {
      affected.add(uri);
    }
  }

  return sortUris(affected);
}

/**
 * collectAffectedLorebookCodeLensUris 함수.
 * activation-chain 전파 대상 중 lorebook CodeLens URI만 수집함.
 *
 * @param changedUris - 직접 변경된 URI 목록
 * @param previousState - rebuild 이전 workspace state
 * @param nextState - rebuild 이후 workspace state
 * @returns 정렬·중복 제거된 lorebook CodeLens 대상 URI 목록
 */
export function collectAffectedLorebookCodeLensUris(
  changedUris: readonly string[],
  previousState: WorkspaceDiagnosticsState | null,
  nextState: WorkspaceDiagnosticsState | null,
): readonly string[] {
  const affected = new Set<string>();

  for (const state of [previousState, nextState]) {
    if (!state) {
      continue;
    }

    for (const uri of state.activationChainService.collectAffectedUris(changedUris)) {
      if (state.registry.getFileByUri(uri)?.artifact === 'lorebook') {
        affected.add(uri);
      }
    }
  }

  return sortUris(affected);
}

/**
 * collectWorkspaceStateUris 함수.
 * workspace state 전체가 보유한 diagnostics 대상 URI를 수집함.
 *
 * @param state - URI를 읽을 workspace state
 * @returns 정렬·중복 제거된 workspace file URI 목록
 */
export function collectWorkspaceStateUris(state: WorkspaceDiagnosticsState | null): readonly string[] {
  if (!state) {
    return [];
  }

  return sortUris(state.scanResult.files.map((file) => file.uri));
}

/**
 * collectWorkspaceLorebookCodeLensUris 함수.
 * workspace state 전체에서 lorebook CodeLens 대상 URI를 수집함.
 *
 * @param state - lorebook file을 읽을 workspace state
 * @returns 정렬·중복 제거된 lorebook URI 목록
 */
export function collectWorkspaceLorebookCodeLensUris(
  state: WorkspaceDiagnosticsState | null,
): readonly string[] {
  if (!state) {
    return [];
  }

  return sortUris(
    state.scanResult.files.filter((file) => file.artifact === 'lorebook').map((file) => file.uri),
  );
}

/**
 * sortUris 함수.
 * URI iterable을 deterministic ordering으로 정규화함.
 *
 * @param uris - 정렬할 URI iterable
 * @returns 중복 제거 후 localeCompare 기준으로 정렬한 URI 목록
 */
function sortUris(uris: Iterable<string>): readonly string[] {
  return [...new Set(uris)].sort((left, right) => left.localeCompare(right));
}
