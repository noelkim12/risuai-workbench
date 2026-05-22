/**
 * refresh_analyze_snapshot read-only snapshot refresh tool handler.
 * @file packages/risuai-workbench-mcp/src/tools/analyze/refresh-analyze-snapshot.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import { resolveAnalyzeSnapshot, type AnalyzeSnapshotInput } from '../../analyze/snapshot';
import type { WorkspaceRootStatus } from '../../project/resolve-root';

const TOOL_NAME = 'workbench.refresh_analyze_snapshot';

/**
 * handleRefreshAnalyzeSnapshot 함수.
 * source artifact를 수정하지 않고 현재 source hash 기반 snapshot metadata만 새로 계산함.
 *
 * @param input - sourcePath/sourceText/previousSnapshot/stalePolicy 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns snapshot metadata diagnostic envelope
 */
export async function handleRefreshAnalyzeSnapshot(input: AnalyzeSnapshotInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { sourcePath: input.sourcePath, sourceText: input.sourceText });
  if (!snapshot.ok) {
    return createDiagnosticEnvelope({ diagnostics: snapshot.diagnostics, status: 'domain_error', tool: TOOL_NAME });
  }
  return createDiagnosticEnvelope({
    data: { refreshed: true, snapshot: snapshot.snapshot },
    diagnostics: snapshot.diagnostics,
    status: snapshot.refused ? 'domain_error' : snapshot.diagnostics.length > 0 ? 'domain_warning' : 'ok',
    tool: TOOL_NAME,
  });
}
