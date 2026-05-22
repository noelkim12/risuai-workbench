/**
 * Main editor CBS preview lens formatter tests.
 * @file packages/webview/tests/lib/components/editor/main/cbsLensFormatter.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  createConditionLensLabel,
  createTraceLensViewModel,
  getParentLensSource,
  isNestedLensChildTrace,
  simplifyCbsConditionExpression,
} from '../../../../../src/lib/components/editor/main/cbsLensFormatter';

describe('cbsLensFormatter', () => {
  it('formats nested settempvar assignment source as a compact reusable lens', () => {
    const source = '{{settempvar::_g::{{or::{{greater_equal::{{getvar::erosion}}::2}}::{{not_equal::{{getvar::chill}}::none}}}}}}';

    const lens = createTraceLensViewModel({
      phase: 'macro-skip',
      message: 'settempvar "_g" stored in simulator-local temp state',
      node: 'settempvar',
      details: {
        key: '_g',
        valuePreview: 'true',
        source,
        store: 'localTemp',
        committed: 'true',
      },
    });

    expect(lens).toMatchObject({
      label: 'settempvar _g ← erosion ≥ 2 OR chill ≠ none',
      title: source,
      tone: 'assignment',
    });
    expect(lens.detailLines).toContain('variable: _g');
    expect(lens.detailLines).toContain('value: erosion ≥ 2 OR chill ≠ none');
    expect(lens.detailLines).toContain('evaluated: true');
  });

  it('reuses nested CBS expression simplification for if and when labels', () => {
    const rawCondition = '{{or::{{greater_equal::{{getvar::erosion}}::2}}::{{not_equal::{{getvar::chill}}::none}}}}';

    expect(simplifyCbsConditionExpression(rawCondition)).toBe('erosion ≥ 2 OR chill ≠ none');
    expect(createConditionLensLabel('#if', { rawCondition })).toBe('if erosion ≥ 2 OR chill ≠ none');
    expect(createConditionLensLabel('#when', { rawCondition })).toBe('when erosion ≥ 2 OR chill ≠ none');
  });

  it('formats math wrapper if labels without leaking raw getvar syntax', () => {
    const rawCondition = '{{? (({{getvar::vg_Resolution_Flag}}) == 5)}}';

    expect(simplifyCbsConditionExpression(rawCondition)).toBe('vg_Resolution_Flag = 5');
    expect(createConditionLensLabel('#if', { rawCondition })).toBe('if vg_Resolution_Flag = 5');
  });

  it('marks nested assignment child traces as absorbed by the parent assignment lens', () => {
    const source = '{{settempvar::_g::{{or::{{greater_equal::{{getvar::erosion}}::2}}::{{not_equal::{{getvar::chill}}::none}}}}}}';
    const parent = {
      phase: 'macro-skip' as const,
      message: 'settempvar "_g" stored in simulator-local temp state',
      node: 'settempvar',
      details: { key: '_g', valuePreview: 'true', source },
    };

    expect(isNestedLensChildTrace({ phase: 'macro-skip', message: 'read', node: 'getvar', details: { key: 'erosion' } }, getParentLensSource(parent))).toBe(true);
    expect(isNestedLensChildTrace({ phase: 'macro-skip', message: 'compare', node: 'greater_equal' }, getParentLensSource(parent))).toBe(true);
    expect(isNestedLensChildTrace({ phase: 'macro-skip', message: 'read', node: 'getvar', details: { key: 'unrelated' } }, getParentLensSource(parent))).toBe(false);
  });
});
