import { afterEach, describe, expect, it, vi } from 'vitest';

describe('analyze workflow lazy loading', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../src/cli/analyze/lua/workflow');
  });

  it('does not load lua workflow when dispatching module help', async () => {
    vi.doMock('../src/cli/analyze/lua/workflow', () => {
      throw new Error('lua workflow should not be loaded for module dispatch');
    });

    const { runAnalyzeWorkflow } = await import('../src/cli/analyze/workflow');

    expect(runAnalyzeWorkflow(['--type', 'module', '--help'])).toBe(0);
  });
});
