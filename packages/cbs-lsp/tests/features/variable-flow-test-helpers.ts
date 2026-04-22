/**
 * Cross-file variable flow provider test helpers.
 * @file packages/cbs-lsp/tests/features/variable-flow-test-helpers.ts
 */

import type { CustomExtensionArtifact, Range } from 'risu-workbench-core';

import { createCbsAgentProtocolMarker } from '../../src/core';
import type {
  UnifiedVariableNode,
  UnifiedVariableOccurrence,
} from '../../src/indexer';
import type {
  VariableFlowQueryResult,
  VariableFlowService,
  WorkspaceSnapshotState,
} from '../../src/services';
import { createAgentMetadataWorkspaceSnapshot } from '../../src/core';

export interface VariableOccurrenceSeed {
  variableName?: string;
  direction: 'read' | 'write';
  uri: string;
  relativePath: string;
  range: Range;
  artifact?: CustomExtensionArtifact;
  sourceName: string;
  occurrenceId?: string;
}

export interface VariableFlowServiceStubOptions {
  getAllVariableNames?: () => readonly string[];
  queryVariable?: (variableName: string) => VariableFlowQueryResult | null;
  queryAt?: (uri: string, hostOffset: number) => VariableFlowQueryResult | null;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

/**
 * createVariableOccurrence 함수.
 * provider 테스트에서 쓸 최소 workspace occurrence payload를 만듦.
 *
 * @param seed - occurrence 식별자와 위치를 담은 테스트 seed
 * @returns Layer 3 query가 그대로 돌려줄 occurrence fixture
 */
export function createVariableOccurrence(seed: VariableOccurrenceSeed): UnifiedVariableOccurrence {
  const variableName = seed.variableName ?? 'shared';
  const artifact = seed.artifact ?? 'lorebook';

  return {
    occurrenceId:
      seed.occurrenceId ??
      `${seed.uri}:${seed.direction}:${seed.range.start.line}:${seed.range.start.character}:${variableName}`,
    variableName,
    direction: seed.direction,
    sourceKind: artifact === 'lua' ? 'lua-state-api' : 'cbs-macro',
    sourceName: seed.sourceName,
    uri: seed.uri,
    relativePath: seed.relativePath,
    artifact,
    artifactClass: artifact === 'variable' || artifact === 'toggle' ? 'non-cbs' : 'cbs-bearing',
    elementId: `${seed.uri}#fixture`,
    elementName: seed.relativePath,
    fragmentSection: artifact === 'lua' ? null : 'CONTENT',
    analysisKind: artifact === 'lua' ? 'lua-file' : 'cbs-fragment',
    hostRange: seed.range,
    hostStartOffset: seed.range.start.character,
    hostEndOffset: seed.range.end.character,
    argumentRange: seed.range,
  };
}

/**
 * createVariableFlowQueryResult 함수.
 * writers/readers occurrence로 provider 테스트용 query result를 조립함.
 *
 * @param variableName - 조회 대상 변수 이름
 * @param writers - writer occurrence 목록
 * @param readers - reader occurrence 목록
 * @param matchedOccurrence - queryAt가 가리키는 현재 cursor occurrence
 * @returns VariableFlowService query 결과 fixture
 */
export function createVariableFlowQueryResult(
  variableName: string,
  writers: readonly UnifiedVariableOccurrence[],
  readers: readonly UnifiedVariableOccurrence[],
  matchedOccurrence: UnifiedVariableOccurrence | null = null,
): VariableFlowQueryResult {
  const occurrences = [...writers, ...readers].sort((left, right) =>
    left.occurrenceId.localeCompare(right.occurrenceId),
  );
  const node: UnifiedVariableNode = {
    name: variableName,
    readers,
    writers,
    occurrenceCount: occurrences.length,
    artifacts: [...new Set(occurrences.map((occurrence) => occurrence.artifact))].sort(),
    uris: [...new Set(occurrences.map((occurrence) => occurrence.uri))].sort(),
  };

  return {
    ...createCbsAgentProtocolMarker(),
    variableName,
    node,
    occurrences,
    readers,
    writers,
    flowEntry: null,
    issues: [],
    defaultValue: null,
    matchedOccurrence,
  };
}

/**
 * createVariableFlowServiceStub 함수.
 * provider 테스트에서 필요한 query 메서드만 가진 Layer 3 stub을 만듦.
 *
 * @param options - queryVariable/queryAt 구현
 * @returns VariableFlowService처럼 주입 가능한 테스트 stub
 */
export function createVariableFlowServiceStub(
  options: VariableFlowServiceStubOptions,
): VariableFlowService {
  return {
    getAllVariableNames: options.getAllVariableNames ?? (() => []),
    queryVariable: options.queryVariable ?? (() => null),
    queryAt: options.queryAt ?? (() => null),
    getWorkspaceFreshness: ({ uri, version }: { uri: string; version: number }) => {
      const snapshot = options.workspaceSnapshot;
      if (!snapshot) {
        return null;
      }

      const trackedDocumentVersion = snapshot.documentVersions.get(uri) ?? null;
      const freshness =
        trackedDocumentVersion === null || trackedDocumentVersion === version ? 'fresh' : 'stale';

      return createAgentMetadataWorkspaceSnapshot({
        detail:
          freshness === 'fresh'
            ? `Workspace snapshot v${snapshot.snapshotVersion} matches the current request.`
            : `Workspace snapshot v${snapshot.snapshotVersion} still tracks document version ${trackedDocumentVersion} while the current request uses version ${version}, so cross-file workspace results must degrade to fragment-local output.`,
        freshness,
        requestVersion: version,
        rootPath: snapshot.rootPath,
        snapshotVersion: snapshot.snapshotVersion,
        trackedDocumentVersion,
      });
    },
    getWorkspaceSnapshot: () => options.workspaceSnapshot ?? null,
  } as unknown as VariableFlowService;
}
