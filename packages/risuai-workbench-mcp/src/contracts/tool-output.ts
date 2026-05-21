/**
 * Shared MCP tool output contracts for roadmap registry helpers.
 * @file packages/risuai-workbench-mcp/src/contracts/tool-output.ts
 */

import type { DiagnosticEnvelope } from './diagnostics';
import type { MutationResultEnvelope } from './mutation-result';
import type { PatchPlan } from './patch-plan';

export type WorkbenchToolOutput = DiagnosticEnvelope | MutationResultEnvelope | PatchPlan;

export interface ToolOutputEnvelopeDescriptor {
  schemaVersion: '0.2.0';
  normalDomainFailures: 'diagnostic-envelope';
  mutationPreview: 'patch-plan';
  mutationCommit: 'mutation-result';
}

export const TOOL_OUTPUT_ENVELOPE_DESCRIPTOR: ToolOutputEnvelopeDescriptor = {
  mutationCommit: 'mutation-result',
  mutationPreview: 'patch-plan',
  normalDomainFailures: 'diagnostic-envelope',
  schemaVersion: '0.2.0',
};
