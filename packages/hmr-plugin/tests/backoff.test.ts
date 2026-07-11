import { describe, expect, it } from 'vitest';

import { nextBackoffDelayMs } from '../src/hmr/backoff';

describe('nextBackoffDelayMs', () => {
  it('doubles from 2s and caps at 30s', () => {
    expect(nextBackoffDelayMs(0)).toBe(2000);
    expect(nextBackoffDelayMs(1)).toBe(4000);
    expect(nextBackoffDelayMs(2)).toBe(8000);
    expect(nextBackoffDelayMs(3)).toBe(16000);
    expect(nextBackoffDelayMs(4)).toBe(30000);
    expect(nextBackoffDelayMs(10)).toBe(30000);
  });
});
