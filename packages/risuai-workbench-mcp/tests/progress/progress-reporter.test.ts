/**
 * Progress reporter tests.
 * @file packages/risuai-workbench-mcp/tests/progress/progress-reporter.test.ts
 */

import { describe, expect, it } from 'vitest';

import { createProgressReporter, getProgressToken } from '../../src/progress';

describe('progress reporter', () => {
  it('extracts string and number progress tokens', () => {
    expect(getProgressToken({ _meta: { progressToken: 'abc' } })).toBe('abc');
    expect(getProgressToken({ _meta: { progressToken: 3 } })).toBe(3);
    expect(getProgressToken({ _meta: { progressToken: true } })).toBeNull();
    expect(getProgressToken({})).toBeNull();
  });

  it('sends monotonic progress notifications when a token exists', async () => {
    const sent: unknown[] = [];
    const reporter = createProgressReporter({
      sendNotification: async (notification) => {
        sent.push(notification);
      },
      token: 'token-1',
    });

    await reporter.report(1, 5, 'start');
    await reporter.report(1, 5, 'duplicate ignored');
    await reporter.report(3, 5, 'middle');

    expect(sent).toEqual([
      { method: 'notifications/progress', params: { progress: 1, progressToken: 'token-1', total: 5, message: 'start' } },
      { method: 'notifications/progress', params: { progress: 3, progressToken: 'token-1', total: 5, message: 'middle' } },
    ]);
  });

  it('does nothing when token is missing', async () => {
    const sent: unknown[] = [];
    const reporter = createProgressReporter({
      sendNotification: async (notification) => {
        sent.push(notification);
      },
      token: null,
    });

    await reporter.report(1, 2, 'ignored');

    expect(sent).toEqual([]);
  });
});
