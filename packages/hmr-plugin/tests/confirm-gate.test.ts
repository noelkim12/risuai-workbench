import { describe, expect, it } from 'vitest';

import { canStart, needsConsent, type DiffLoadState } from '../src/components/confirm-gate';
import type { ConfirmDiff } from '../src/hmr/diff';

const IDENTICAL: ConfirmDiff = {
  status: 'identical',
  fields: [],
  unchangedKeys: ['name'],
  assetSummary: { count: 0, totalBytes: 0 },
};
const DIFFERENT: ConfirmDiff = {
  status: 'different',
  fields: [{ key: 'desc', kind: 'modified', preservedByMerge: false }],
  unchangedKeys: [],
  assetSummary: { count: 0, totalBytes: 0 },
};

describe('confirm gate', () => {
  const loading: DiffLoadState = { status: 'loading' };
  const identical: DiffLoadState = { status: 'ready', diff: IDENTICAL };
  const different: DiffLoadState = { status: 'ready', diff: DIFFERENT };
  const error: DiffLoadState = { status: 'error', message: 'boom' };
  const missing: DiffLoadState = { status: 'target-missing', message: 'gone' };

  it('requires consent only for differences and load errors', () => {
    expect(needsConsent(loading)).toBe(false);
    expect(needsConsent(identical)).toBe(false);
    expect(needsConsent(different)).toBe(true);
    expect(needsConsent(error)).toBe(true);
    expect(needsConsent(missing)).toBe(false);
  });

  it('gates the start button accordingly', () => {
    expect(canStart(loading, true)).toBe(false);
    expect(canStart(missing, true)).toBe(false);
    expect(canStart(identical, false)).toBe(true);
    expect(canStart(different, false)).toBe(false);
    expect(canStart(different, true)).toBe(true);
    expect(canStart(error, false)).toBe(false);
    expect(canStart(error, true)).toBe(true);
  });
});
