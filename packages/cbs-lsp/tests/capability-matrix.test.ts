/**
 * Initialize capability matrix regression tests.
 * @file packages/cbs-lsp/tests/capability-matrix.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_MATRIX_FIXTURES,
  snapshotCapabilityMatrixFixture,
} from './fixtures/capability-matrix';

describe('initialize capability matrix', () => {
  it.each(CAPABILITY_MATRIX_FIXTURES)(
    'keeps advertised capabilities, experimental availability, and trace payload aligned for $id',
    (fixture) => {
      expect(snapshotCapabilityMatrixFixture(fixture)).toEqual(fixture.expectedSnapshot);
    },
  );
});
