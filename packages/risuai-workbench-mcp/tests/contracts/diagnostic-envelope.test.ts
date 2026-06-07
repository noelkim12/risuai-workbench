/**
 * Diagnostic envelope contract tests for mutation-enabled MCP roadmap results.
 * @file packages/risuai-workbench-mcp/tests/contracts/diagnostic-envelope.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  createDiagnosticEnvelope,
  createNotImplementedDiagnosticEnvelope,
  createUnknownFieldDiagnosticEnvelope,
  MUTATION_INPUT_UNKNOWN_FIELD_POLICY,
} from '../../src/contracts/diagnostics';
import { createApplyPatchPlanInput, type PatchOperation } from '../../src/contracts/patch-plan';
import { createMutationResultEnvelope } from '../../src/contracts/mutation-result';
import { buildMutationJournalUri, buildPatchPlanUri } from '../../src/contracts/resource-uri';

describe('diagnostic envelope contracts', () => {
  it('validate_order domain warnings are normal tool results, not transport failures', () => {
    const envelope = createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'order',
          id: 'ORDER_UNLISTED_FILE',
          message: 'Canonical file exists but is not listed in _order.json.',
          path: 'characters/merry/lorebooks/intro.risulorebook',
          ruleId: 'order.explicit-entry',
          severity: 'warning',
          suggestedFixes: [
            {
              kind: 'order.insert',
              operation: { entry: 'intro.risulorebook', kind: 'order.insert' },
              target: 'characters/merry/lorebooks/_order.json',
              title: 'Add intro.risulorebook to _order.json',
            },
          ],
        },
        {
          category: 'path',
          id: 'PATH_CANONICAL',
          message: 'Path follows canonical suffix policy.',
          path: 'characters/merry/lorebooks/intro.risulorebook',
          severity: 'info',
        },
      ],
      status: 'domain_warning',
      tool: 'workbench.validate_order',
    });

    expect(envelope).toMatchObject({
      schema: 'risuai-workbench-mcp.diagnostics',
      schemaVersion: '0.2.0',
      status: 'domain_warning',
      summary: { errorCount: 0, infoCount: 1, warningCount: 1 },
      tool: 'workbench.validate_order',
    });
    expect(envelope.diagnostics[0]?.suggestedFixes?.[0]?.operation.kind).toBe('order.insert');
  });

  it('notImplemented roadmap tool results use a stable diagnostic shape', () => {
    const result = createNotImplementedDiagnosticEnvelope('workbench.query_variable_flow', 'Phase 4 roadmap surface');

    expect(result.status).toBe('not_implemented');
    expect(result.summary).toEqual({ errorCount: 0, warningCount: 1, infoCount: 0 });
    expect(result.diagnostics).toEqual([
      {
        category: 'registry',
        id: 'ROADMAP_SURFACE_NOT_IMPLEMENTED',
        message: 'workbench.query_variable_flow is registered for Phase 4 roadmap surface but is not implemented yet.',
        path: null,
        ruleId: 'registry.not-implemented',
        severity: 'warning',
      },
    ]);
  });

  it('mutation inputs reject unknown fields through a documented contract helper', () => {
    const result = createUnknownFieldDiagnosticEnvelope({
      allowedKeys: ['mode', 'operations', 'orderPath', 'postValidate'],
      input: {
        mode: 'preview',
        operations: [],
        orderPath: 'characters/merry/lorebooks/_order.json',
        surprise: true,
      },
      tool: 'workbench.edit_order',
    });

    expect(MUTATION_INPUT_UNKNOWN_FIELD_POLICY).toMatchObject({ action: 'reject', appliesTo: 'mutation-facing inputs' });
    expect(result.status).toBe('domain_error');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      category: 'input',
      id: 'MUTATION_INPUT_UNKNOWN_FIELD',
      message: 'Unknown input fields are rejected: surprise.',
      ruleId: 'input.unknown-field',
      severity: 'error',
    });
  });

  it('patch plan, apply input, mutation mode, and mutation result contracts keep proposal field names', () => {
    const operation: PatchOperation = {
      endOffset: 5,
      kind: 'text.replace',
      path: 'characters/merry/lorebooks/intro.risulorebook',
      startOffset: 0,
      text: 'hello',
    };
    const applyInput = createApplyPatchPlanInput({
      options: { createBackup: true, postValidate: true, rollbackOnValidationError: false },
      patchPlanId: 'patch:2026-05-20:001',
    });
    const mutationResult = createMutationResultEnvelope({
      changedFiles: [
        {
          afterHash: 'sha256:after',
          beforeHash: 'sha256:before',
          operationCount: 1,
          path: 'characters/merry/lorebooks/_order.json',
        },
      ],
      mutationId: 'mutation:001',
      postValidation: { diagnostics: [], status: 'ok' },
      resourceLinks: [buildMutationJournalUri('mutation:001')],
      status: 'applied',
      tool: 'workbench.edit_order',
    });

    expect(operation.kind).toBe('text.replace');
    expect(applyInput.patchPlanId).toBe('patch:2026-05-20:001');
    expect(applyInput.options?.postValidate).toBe(true);
    expect(mutationResult).toMatchObject({
      schema: 'risuai-workbench-mcp.mutation-result',
      schemaVersion: '0.2.0',
      status: 'applied',
      tool: 'workbench.edit_order',
    });
    expect(buildPatchPlanUri('patch:2026-05-20:001')).toBe(
      'risuai-workbench://mutations/patch-plans/patch%3A2026-05-20%3A001',
    );
  });
});
