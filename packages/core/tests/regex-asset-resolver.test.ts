import { describe, expect, it } from 'vitest';
import {
  ASSET_NAME_MAX_DIFFERENCE,
  extractAssetCbsNames,
  getDistance,
  resolveAssetName,
  substituteAssetCbs,
  trimmer,
} from '../src/simulator/regex/asset-resolver';

describe('trimmer', () => {
  it('strips media extension and separators', () => {
    expect(trimmer('anelia_default.webp')).toBe('aneliadefault');
    expect(trimmer('anelia default')).toBe('aneliadefault');
    expect(trimmer('anelia-default')).toBe('aneliadefault');
  });
});

describe('getDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(getDistance('abc', 'abc')).toBe(0);
    expect(getDistance('abc', 'abd')).toBe(1);
    expect(getDistance('', 'abc')).toBe(3);
  });
});

describe('extractAssetCbsNames', () => {
  it('returns unique raw/path names in order', () => {
    const html = '<img src="{{raw::a}}"><img src="{{path::b}}"><img src="{{raw::a}}">';
    expect(extractAssetCbsNames(html)).toEqual(['a', 'b']);
  });

  it('returns empty array when no asset CBS present', () => {
    expect(extractAssetCbsNames('plain text {{user}}')).toEqual([]);
  });
});

describe('resolveAssetName', () => {
  it('matches exact case-insensitively', () => {
    expect(resolveAssetName('Anelia_Default', ['anelia_default'])).toEqual({ matchedName: 'anelia_default' });
  });

  it('matches underscore vs space via trimmed exact', () => {
    expect(resolveAssetName('anelia_default', ['anelia default'])).toEqual({ matchedName: 'anelia default' });
  });

  it('matches within fuzzy threshold', () => {
    expect(resolveAssetName('anelia_defaultt', ['anelia_default'])).toEqual({ matchedName: 'anelia_default' });
  });

  it('returns null beyond fuzzy threshold', () => {
    expect(resolveAssetName('completely_different_xyz', ['anelia_default'])).toBeNull();
  });

  it('returns null for empty candidates', () => {
    expect(resolveAssetName('x', [])).toBeNull();
  });
});

describe('substituteAssetCbs', () => {
  it('replaces resolved names with their src', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', { a: 'data:image/png;base64,AAA' })).toBe(
      '<img src="data:image/png;base64,AAA">',
    );
  });

  it('replaces confirmed miss with empty string', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', { a: null })).toBe('<img src="">');
  });

  it('leaves pending names literal', () => {
    expect(substituteAssetCbs('<img src="{{raw::a}}">', {})).toBe('<img src="{{raw::a}}">');
  });
});

describe('constants', () => {
  it('mirrors RisuAI assetMaxDifference default', () => {
    expect(ASSET_NAME_MAX_DIFFERENCE).toBe(4);
  });
});
