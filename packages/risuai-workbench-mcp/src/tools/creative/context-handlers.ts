/**
 * Read-only handlers for creative ideation context tools.
 * @file packages/risuai-workbench-mcp/src/tools/creative/context-handlers.ts
 */

import { buildCreativeContextToolResult } from '../../creative/context-tools';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

/**
 * handleGatherContext 함수.
 * Supplied artifact/analyze/wiki/graph summaries를 compact context cards로 묶는다.
 *
 * @param input - read-only context input
 * @returns creative.context payload wrapped in diagnostic envelope
 */
export async function handleGatherContext(input: unknown): Promise<DiagnosticEnvelope> {
  return buildCreativeContextToolResult(input, {
    mode: 'gather',
    toolName: 'workbench.creative.gather_context',
  });
}

/**
 * handleInspectContext 함수.
 * Supplied context bundle에서 특정 card/kind를 inspect-friendly compact view로 반환한다.
 *
 * @param input - read-only inspect input
 * @returns creative.context payload wrapped in diagnostic envelope
 */
export async function handleInspectContext(input: unknown): Promise<DiagnosticEnvelope> {
  return buildCreativeContextToolResult(input, {
    mode: 'inspect',
    toolName: 'workbench.creative.inspect_context',
  });
}

/**
 * handleSearchContext 함수.
 * Supplied context bundle을 query 문자열로 필터링한다.
 *
 * @param input - read-only search input
 * @returns creative.context payload wrapped in diagnostic envelope
 */
export async function handleSearchContext(input: unknown): Promise<DiagnosticEnvelope> {
  return buildCreativeContextToolResult(input, {
    mode: 'search',
    toolName: 'workbench.creative.search_context',
  });
}
