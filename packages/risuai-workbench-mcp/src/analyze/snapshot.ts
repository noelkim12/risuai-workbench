/**
 * Analyze query snapshot metadata and stale-state helpers.
 * @file packages/risuai-workbench-mcp/src/analyze/snapshot.ts
 */

import { createHash } from 'node:crypto';

import type { WorkbenchDiagnostic } from '../contracts/diagnostics';
import { computeFileHash } from '../mutation/file-hash';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath } from '../project/safe-path';

export const ANALYZE_SNAPSHOT_VERSION = '0.2.0';

export interface AnalyzeSnapshotReference {
  snapshotId?: string;
  sourceHash?: string;
}

export interface AnalyzeSnapshotInput {
  previousSnapshot?: AnalyzeSnapshotReference;
  sourcePath?: string;
  sourceText?: string;
  stalePolicy?: 'mark' | 'refuse';
}

export interface AnalyzeSnapshotMetadata {
  snapshotId: string;
  workspaceRoot: string;
  createdAt: string;
  sourceHash: string;
  analyzerVersion: string;
  stale: boolean;
  staleReasons: readonly string[];
}

export type AnalyzeSnapshotResolution =
  | {
      ok: true;
      refused: boolean;
      snapshot: AnalyzeSnapshotMetadata;
      diagnostics: readonly WorkbenchDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: readonly WorkbenchDiagnostic[];
    };

/**
 * createStableSourceHash 함수.
 * Analyze input payload를 deterministic JSON으로 정규화해 source hash를 만든다.
 *
 * @param value - snapshot source로 사용할 JSON-compatible 값
 * @returns `sha256:<hex>` source hash
 */
export function createStableSourceHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

/**
 * resolveAnalyzeSnapshot 함수.
 * 현재 analyze source hash와 이전 snapshot 참조를 비교해 stale metadata를 만든다.
 *
 * @param input - source path/text, 이전 snapshot, stale 처리 정책
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param fallbackSource - path/text가 없을 때 hash에 사용할 analyzer 입력
 * @returns snapshot metadata 또는 path diagnostic
 */
export async function resolveAnalyzeSnapshot(
  input: AnalyzeSnapshotInput,
  workspace: WorkspaceRootStatus,
  fallbackSource: unknown,
): Promise<AnalyzeSnapshotResolution> {
  const sourceHashResult = await resolveSourceHash(input, workspace, fallbackSource);
  if (!sourceHashResult.ok) {
    return { diagnostics: sourceHashResult.diagnostics, ok: false };
  }

  const staleReasons = findStaleReasons(input.previousSnapshot, sourceHashResult.sourceHash);
  const stale = staleReasons.length > 0;
  const snapshot: AnalyzeSnapshotMetadata = {
    analyzerVersion: ANALYZE_SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    snapshotId: createSnapshotId(sourceHashResult.sourceHash),
    sourceHash: sourceHashResult.sourceHash,
    stale,
    staleReasons,
    workspaceRoot: workspace.ok ? workspace.path : '.',
  };
  const diagnostics = stale ? [createStaleDiagnostic(input.previousSnapshot, sourceHashResult.sourceHash)] : [];
  const refused = stale && input.stalePolicy === 'refuse';

  return { diagnostics, ok: true, refused, snapshot };
}

interface SourceHashResolution {
  ok: true;
  sourceHash: string;
}

interface SourceHashFailure {
  ok: false;
  diagnostics: readonly WorkbenchDiagnostic[];
}

/**
 * resolveSourceHash 함수.
 * sourcePath가 있으면 안전 경계 안의 파일 hash를, 없으면 sourceText/input hash를 계산함.
 *
 * @param input - analyze source 입력
 * @param workspace - workspace root 상태
 * @param fallbackSource - file/text가 없을 때 hash source
 * @returns source hash 또는 diagnostic
 */
async function resolveSourceHash(
  input: AnalyzeSnapshotInput,
  workspace: WorkspaceRootStatus,
  fallbackSource: unknown,
): Promise<SourceHashResolution | SourceHashFailure> {
  if (input.sourcePath) {
    if (!workspace.ok) {
      return {
        diagnostics: [
          {
            category: 'workspace',
            id: 'WORKSPACE_ROOT_UNAVAILABLE',
            message: `Workspace root is unavailable: ${workspace.reason}`,
            path: input.sourcePath,
            ruleId: 'workspace.root-unavailable',
            severity: 'error',
          },
        ],
        ok: false,
      };
    }

    const safeResult = await resolveSafeWorkspacePath({
      inputPath: input.sourcePath,
      intent: 'read-existing',
      workspace,
    });
    if (!safeResult.ok) {
      return {
        diagnostics: [
          {
            category: 'path',
            id: 'PATH_RESOLVE_FAILED',
            message: `Path resolution failed: ${safeResult.reason}`,
            path: input.sourcePath,
            ruleId: `path.${safeResult.reason}`,
            severity: 'error',
          },
        ],
        ok: false,
      };
    }

    return { ok: true, sourceHash: await computeFileHash(safeResult.absolutePath) };
  }

  if (input.sourceText !== undefined) {
    return { ok: true, sourceHash: createStableSourceHash({ sourceText: input.sourceText }) };
  }

  return { ok: true, sourceHash: createStableSourceHash(fallbackSource) };
}

/**
 * findStaleReasons 함수.
 * 이전 snapshot과 현재 source hash 사이의 stale 사유를 계산함.
 *
 * @param previousSnapshot - caller가 보관한 이전 snapshot 참조
 * @param currentSourceHash - 현재 source hash
 * @returns stale reason 목록
 */
function findStaleReasons(previousSnapshot: AnalyzeSnapshotReference | undefined, currentSourceHash: string): readonly string[] {
  if (!previousSnapshot?.sourceHash) {
    return [];
  }
  if (previousSnapshot.sourceHash === currentSourceHash) {
    return [];
  }
  return ['source-hash-changed'];
}

/**
 * createSnapshotId 함수.
 * source hash와 analyzer version으로 deterministic snapshot id를 만든다.
 *
 * @param sourceHash - 현재 source hash
 * @returns snapshot id
 */
function createSnapshotId(sourceHash: string): string {
  return `snapshot:${createHash('sha256').update(`${ANALYZE_SNAPSHOT_VERSION}:${sourceHash}`).digest('hex')}`;
}

/**
 * createStaleDiagnostic 함수.
 * 이전 snapshot이 현재 source와 맞지 않는다는 diagnostic을 만든다.
 *
 * @param previousSnapshot - caller가 보관한 이전 snapshot 참조
 * @param currentSourceHash - 현재 source hash
 * @returns stale snapshot diagnostic
 */
function createStaleDiagnostic(previousSnapshot: AnalyzeSnapshotReference | undefined, currentSourceHash: string): WorkbenchDiagnostic {
  return {
    category: 'analyze-snapshot',
    id: 'ANALYZE_SNAPSHOT_STALE',
    message: `Analyze snapshot is stale: previous sourceHash ${previousSnapshot?.sourceHash ?? '<missing>'} differs from current ${currentSourceHash}.`,
    path: null,
    ruleId: 'analyze.snapshot-stale',
    severity: 'warning',
  };
}

/**
 * stableStringify 함수.
 * object key order를 고정하고 Map/Set도 JSON-compatible 값으로 정규화함.
 *
 * @param value - 문자열화할 값
 * @returns deterministic JSON string
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

/**
 * normalizeStableValue 함수.
 * source hash를 위해 JSON 직렬화 순서를 안정화함.
 *
 * @param value - 정규화할 값
 * @returns JSON-compatible stable value
 */
function normalizeStableValue(value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entryValue]) => [key, normalizeStableValue(entryValue)]);
  }
  if (value instanceof Set) {
    return [...value.values()].map(normalizeStableValue).sort((left, right) => String(left).localeCompare(String(right)));
  }
  if (Array.isArray(value)) {
    return value.map(normalizeStableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeStableValue(entryValue)]),
    );
  }
  return value;
}
