/**
 * Shared Zod output schemas for MCP structuredContent validation.
 * @file packages/risuai-workbench-mcp/src/contracts/output-schemas.ts
 */

import { z } from 'zod';

const diagnosticSeveritySchema = z.enum(['info', 'warning', 'error']);

export const workbenchDiagnosticOutputSchema = z.object({
  category: z.string(),
  id: z.string(),
  message: z.string(),
  path: z.string().nullable(),
  ruleId: z.string(),
  severity: diagnosticSeveritySchema,
}).catchall(z.unknown());

export const diagnosticEnvelopeOutputSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  diagnostics: z.array(workbenchDiagnosticOutputSchema),
  schema: z.literal('risuai-workbench-mcp.diagnostics'),
  schemaVersion: z.string(),
  status: z.enum(['ok', 'domain_warning', 'domain_error', 'not_implemented']),
  summary: z.object({
    errorCount: z.number(),
    infoCount: z.number(),
    warningCount: z.number(),
  }).catchall(z.unknown()),
  tool: z.string(),
}).catchall(z.unknown());

export const mutationResultEnvelopeOutputSchema = z.object({
  appliedAt: z.string().optional(),
  changedFiles: z.array(z.object({
    afterHash: z.string().optional(),
    beforeHash: z.string().optional(),
    operationCount: z.number(),
    path: z.string(),
  }).catchall(z.unknown())),
  mutationId: z.string().optional(),
  postValidation: z.object({
    diagnostics: z.array(workbenchDiagnosticOutputSchema),
    status: z.enum(['ok', 'warning', 'error', 'not_run']),
  }).catchall(z.unknown()),
  resourceLinks: z.array(z.string()),
  schema: z.literal('risuai-workbench-mcp.mutation-result'),
  schemaVersion: z.string(),
  status: z.enum(['preview', 'applied', 'rejected', 'failed', 'failed-validation']),
  tool: z.string(),
  workflowSummary: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.unknown());

export const patchPlanOutputSchema = z.object({
  createdAt: z.string(),
  diagnostics: z.array(workbenchDiagnosticOutputSchema),
  intent: z.string(),
  operations: z.array(z.record(z.string(), z.unknown())),
  patchPlanId: z.string(),
  schema: z.literal('risuai-workbench-mcp.patch-plan'),
  schemaVersion: z.string(),
  summary: z.record(z.string(), z.unknown()),
}).catchall(z.unknown());

export const workbenchJsonOutputSchema = z.object({}).catchall(z.unknown());
