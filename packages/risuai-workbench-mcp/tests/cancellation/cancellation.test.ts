/**
 * Cancellation helper tests.
 * @file packages/risuai-workbench-mcp/tests/cancellation/cancellation.test.ts
 */

import { describe, expect, it } from 'vitest';

import { createCancellationDiagnostic, isCancellationRequested, throwIfCancellationRequested } from '../../src/cancellation';

describe('cancellation helpers', () => {
  it('detects aborted signals', () => {
    const controller = new AbortController();
    expect(isCancellationRequested(controller.signal)).toBe(false);

    controller.abort();

    expect(isCancellationRequested(controller.signal)).toBe(true);
  });

  it('throws a stable cancellation error', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfCancellationRequested(controller.signal, 'workbench.run_extract')).toThrow('workbench.run_extract request was cancelled.');
  });

  it('creates a diagnostic for cancelled workflow requests', () => {
    const diagnostic = createCancellationDiagnostic('workbench.run_scaffold', 'generated/example');

    expect(diagnostic).toEqual({
      category: 'cancellation',
      id: 'REQUEST_CANCELLED',
      message: 'workbench.run_scaffold request was cancelled.',
      path: 'generated/example',
      ruleId: 'workbench.run_scaffold.cancelled',
      severity: 'warning',
    });
  });
});
