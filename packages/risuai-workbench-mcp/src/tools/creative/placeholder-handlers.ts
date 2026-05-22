/**
 * Placeholder handlers for creative tools.
 * Every handler returns a structured not-implemented diagnostic envelope
 * and performs no workspace mutation.
 * @file packages/risuai-workbench-mcp/src/tools/creative/placeholder-handlers.ts
 */

import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

/**
 * Shared placeholder handler result.
 * All creative placeholder handlers return the same not-implemented envelope
 * so that callers receive a stable diagnostic instead of a transport error.
 */
function createCreativeNotImplementedResult(toolName: string): DiagnosticEnvelope {
  return {
    data: undefined,
    diagnostics: [
      {
        category: 'creative',
        id: 'CREATIVE_TOOL_NOT_IMPLEMENTED',
        message: `${toolName} is registered but not implemented yet. Placeholder handler returned without mutation.`,
        path: null,
        ruleId: 'creative.not-implemented',
        severity: 'warning',
      },
    ],
    schema: 'risuai-workbench-mcp.diagnostics',
    schemaVersion: '0.2.0',
    status: 'not_implemented',
    summary: { errorCount: 0, infoCount: 0, warningCount: 1 },
    tool: toolName,
  };
}

/**
 * Generic creative placeholder handler.
 * Returns a not-implemented diagnostic envelope without touching the filesystem.
 *
 * @param toolName - The creative tool name for the diagnostic envelope
 * @param _input - Placeholder input (ignored, no validation performed)
 * @returns Structured not-implemented diagnostic envelope
 */
export function handleCreativePlaceholder(toolName: string, _input: unknown): DiagnosticEnvelope {
  return createCreativeNotImplementedResult(toolName);
}
