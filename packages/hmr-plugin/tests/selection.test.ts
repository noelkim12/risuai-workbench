import { describe, expect, it } from 'vitest';

import { availableTargetKinds } from '../src/components/selection';

describe('availableTargetKinds', () => {
  it('offers character and module targets for a charx-backed character project', () => {
    expect(availableTargetKinds('character')).toEqual(['character', 'module']);
  });

  it('keeps native module projects module-only', () => {
    expect(availableTargetKinds('module')).toEqual(['module']);
  });
});
