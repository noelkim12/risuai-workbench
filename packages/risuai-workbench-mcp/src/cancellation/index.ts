/**
 * Cooperative cancellation helpers for MCP tool handlers.
 * @file packages/risuai-workbench-mcp/src/cancellation/index.ts
 */

import type { WorkbenchDiagnostic } from '../contracts/diagnostics';

export class ToolCancellationError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`${toolName} request was cancelled.`);
    this.name = 'ToolCancellationError';
    this.toolName = toolName;
  }
}

export function isCancellationRequested(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function throwIfCancellationRequested(signal: AbortSignal | undefined, toolName: string): void {
  if (isCancellationRequested(signal)) throw new ToolCancellationError(toolName);
}

export function createCancellationDiagnostic(toolName: string, path: string | null): WorkbenchDiagnostic {
  return {
    category: 'cancellation',
    id: 'REQUEST_CANCELLED',
    message: `${toolName} request was cancelled.`,
    path,
    ruleId: `${toolName}.cancelled`,
    severity: 'warning',
  };
}
