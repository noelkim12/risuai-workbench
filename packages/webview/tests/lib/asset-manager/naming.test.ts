/**
 * Asset Manager naming mirror tests.
 * @file packages/webview/tests/lib/asset-manager/naming.test.ts
 */

import { describe, expect, it } from 'vitest';
import { labelTemplate, renderNamePreview } from '../../../src/lib/asset-manager/naming';

const SCHEMA = {
  slots: [
    { id: 's1' as const, label: 'character' },
    { id: 's2' as const, label: 'emotion' },
  ],
  joinTemplate: '{s1}_{s2}',
};

describe('asset-manager naming mirror', () => {
  it('renders preview names and null on missing slot', () => {
    expect(renderNamePreview(SCHEMA, { s1: 'Rin', s2: 'angry' })).toBe('Rin_angry');
    expect(renderNamePreview(SCHEMA, { s1: 'Rin' })).toBeNull();
  });

  it('renders label template for prompt/format display', () => {
    expect(labelTemplate(SCHEMA)).toBe('{character}_{emotion}');
  });
});
