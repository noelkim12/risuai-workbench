/**
 * Webview request ID helper tests.
 * @file packages/webview/tests/lib/requestIds.test.ts
 */

import { describe, expect, it } from 'vitest';
import { createRequestId } from '../../src/lib/requestIds';

describe('createRequestId', () => {
  it('generates an ID with kind prefix when kind is provided', () => {
    const id = createRequestId('preview');
    expect(id).toMatch(/^preview-\d+-[0-9a-f]+$/);
  });

  it('generates an ID without kind prefix when kind is omitted', () => {
    const id = createRequestId();
    expect(id).toMatch(/^\d+-[0-9a-f]+$/);
    expect(id).not.toContain('--');
  });

  it('produces unique IDs on successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createRequestId('test'));
    }
    expect(ids.size).toBe(100);
  });

  it('preserves exact kind value in the output', () => {
    const id = createRequestId('structured-edit');
    expect(id.startsWith('structured-edit-')).toBe(true);
  });
});
