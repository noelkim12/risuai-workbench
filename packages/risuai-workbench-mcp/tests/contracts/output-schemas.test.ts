/**
 * MCP output schema tests.
 * @file packages/risuai-workbench-mcp/tests/contracts/output-schemas.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  diagnosticEnvelopeOutputSchema,
  mutationResultEnvelopeOutputSchema,
  patchPlanOutputSchema,
  workbenchJsonOutputSchema,
} from '../../src/contracts/output-schemas';

describe('MCP output schemas', () => {
  it('accepts a representative diagnostic envelope', () => {
    const parsed = diagnosticEnvelopeOutputSchema.parse({
      diagnostics: [],
      schema: 'risuai-workbench-mcp.diagnostics',
      schemaVersion: '0.2.0',
      status: 'ok',
      summary: { errorCount: 0, infoCount: 0, warningCount: 0 },
      tool: 'workbench.smoke',
    });

    expect(parsed.status).toBe('ok');
  });

  it('accepts a representative mutation envelope', () => {
    const parsed = mutationResultEnvelopeOutputSchema.parse({
      changedFiles: [],
      postValidation: { diagnostics: [], status: 'ok' },
      resourceLinks: [],
      schema: 'risuai-workbench-mcp.mutation-result',
      schemaVersion: '0.2.0',
      status: 'preview',
      tool: 'workbench.edit_order',
    });

    expect(parsed.status).toBe('preview');
  });

  it('accepts a minimal patch plan shape', () => {
    const parsed = patchPlanOutputSchema.parse({
      createdAt: '2026-05-23T00:00:00.000Z',
      diagnostics: [],
      intent: 'preview change',
      operations: [],
      patchPlanId: 'patch:example',
      schema: 'risuai-workbench-mcp.patch-plan',
      schemaVersion: '0.2.0',
      summary: { operationCount: 0, risk: 'low' },
    });

    expect(parsed.patchPlanId).toBe('patch:example');
  });

  it('accepts mixed workbench JSON object output for tools with multiple envelope shapes', () => {
    const parsed = workbenchJsonOutputSchema.parse({ schema: 'risuai-workbench-mcp.diagnostics', status: 'domain_error' });

    expect(parsed.schema).toBe('risuai-workbench-mcp.diagnostics');
  });
});
