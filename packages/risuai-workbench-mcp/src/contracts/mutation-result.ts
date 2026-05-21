/**
 * Mutation result and journal entry contracts for MCP mutation tools.
 * @file packages/risuai-workbench-mcp/src/contracts/mutation-result.ts
 */

import type { WorkbenchDiagnostic } from './diagnostics';

export type MutationResultStatus = 'applied' | 'preview' | 'rejected' | 'failed' | 'not_implemented';

export interface ChangedFileResult {
  path: string;
  operationCount: number;
  beforeHash?: string;
  afterHash?: string;
}

export interface PostValidationResult {
  status: 'ok' | 'warning' | 'error' | 'not_run';
  diagnostics: readonly WorkbenchDiagnostic[];
}

export interface MutationResultEnvelope {
  schema: 'risuai-workbench-mcp.mutation-result';
  schemaVersion: '0.2.0';
  tool: string;
  status: MutationResultStatus;
  mutationId?: string;
  patchPlanId?: string;
  appliedAt?: string;
  changedFiles: readonly ChangedFileResult[];
  postValidation: PostValidationResult;
  resourceLinks: readonly string[];
}

export interface MutationJournalEntry {
  schema: 'risuai-workbench-mcp.mutation-journal-entry';
  schemaVersion: '0.2.0';
  mutationId: string;
  patchPlanId?: string;
  createdAt: string;
  tool: string;
  mode: 'preview' | 'commit';
  changedFiles: readonly ChangedFileResult[];
  diagnostics: readonly WorkbenchDiagnostic[];
  inversePatchPlanId?: string;
}

/**
 * createMutationResultEnvelope 함수.
 * mutation tool result를 proposal field name 그대로 stable envelope로 감쌈.
 *
 * @param input - mutation result envelope field values
 * @returns stable mutation result envelope
 */
export function createMutationResultEnvelope(input: Omit<MutationResultEnvelope, 'schema' | 'schemaVersion'>): MutationResultEnvelope {
  return {
    ...input,
    schema: 'risuai-workbench-mcp.mutation-result',
    schemaVersion: '0.2.0',
  };
}
