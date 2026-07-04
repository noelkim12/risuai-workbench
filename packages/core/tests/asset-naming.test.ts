import { describe, expect, it } from 'vitest';
import type { AssetCatalogSchema } from '../src/domain/asset/catalog';
import {
  bootstrapVocabCandidates,
  normalizeToken,
  parseJoinTemplate,
  renderAssetName,
  stripExtensionResidue,
  tokenizeAssetFilename,
} from '../src/domain/asset/naming';

const TWO_SLOT: AssetCatalogSchema = {
  slots: [
    { id: 's1', label: 'character' },
    { id: 's2', label: 'status' },
  ],
  joinTemplate: '{s1} {s2}',
};

const THREE_SLOT: AssetCatalogSchema = {
  slots: [
    { id: 's1', label: 'character' },
    { id: 's2', label: 'attire' },
    { id: 's3', label: 'emotion' },
  ],
  joinTemplate: '{s1}_{s2}_{s3}',
};

describe('parseJoinTemplate / renderAssetName', () => {
  it('parses space-joined 2-slot template', () => {
    expect(parseJoinTemplate('{s1} {s2}')).toEqual({
      slotOrder: ['s1', 's2'],
      separators: [' '],
      prefix: '',
      suffix: '',
    });
  });

  it('parses underscore-joined 3-slot template', () => {
    expect(parseJoinTemplate('{s1}_{s2}_{s3}')).toEqual({
      slotOrder: ['s1', 's2', 's3'],
      separators: ['_', '_'],
      prefix: '',
      suffix: '',
    });
  });

  it('returns null for template without slot placeholders', () => {
    expect(parseJoinTemplate('static')).toBeNull();
  });

  it('renders name with vocab casing preserved', () => {
    expect(renderAssetName(THREE_SLOT, { s1: 'Elsie', s2: 'Dress', s3: 'angry' })).toBe('Elsie_Dress_angry');
    expect(renderAssetName(TWO_SLOT, { s1: 'Min Chae-rin', s2: 'aroused' })).toBe('Min Chae-rin aroused');
  });

  it('returns null when a schema slot value is missing', () => {
    expect(renderAssetName(THREE_SLOT, { s1: 'Elsie', s2: 'Dress' })).toBeNull();
  });
});

describe('normalizeToken / stripExtensionResidue', () => {
  it('normalizes separators but preserves hyphens', () => {
    expect(normalizeToken('Breast_Caress')).toBe('breast caress');
    expect(normalizeToken('Do-hyun')).toBe('do-hyun');
  });

  it('strips repeated trailing extension residue', () => {
    expect(stripExtensionResidue('elsie_dress_angry.webp')).toBe('elsie_dress_angry');
    expect(stripExtensionResidue('foo.webp.webp')).toBe('foo');
    expect(stripExtensionResidue('no_residue')).toBe('no_residue');
  });
});

describe('tokenizeAssetFilename', () => {
  it('matches multi-word character names with hyphen (longest match)', () => {
    const result = tokenizeAssetFilename('Ahn_Do-hyun_acting_coy', TWO_SLOT, {
      s1: ['Ahn Do-hyun', 'Ahn'],
      s2: ['acting coy', 'angry'],
    });
    expect(result.slots).toEqual({ s1: 'Ahn Do-hyun', s2: 'acting coy' });
    expect(result.matched).toBe(true);
    expect(result.residue).toBe('');
  });

  it('tokenizes 3-slot underscore names ignoring extension residue', () => {
    const result = tokenizeAssetFilename('elsie_dress_angry.webp', THREE_SLOT, {
      s1: ['Elsie'],
      s2: ['Dress'],
      s3: ['angry'],
    });
    expect(result.slots).toEqual({ s1: 'Elsie', s2: 'Dress', s3: 'angry' });
    expect(result.matched).toBe(true);
  });

  it('reports residue when a token has no vocab match', () => {
    const result = tokenizeAssetFilename('elsie_dress_unknownmood', THREE_SLOT, {
      s1: ['Elsie'],
      s2: ['Dress'],
      s3: ['angry'],
    });
    expect(result.slots).toEqual({ s1: 'Elsie', s2: 'Dress' });
    expect(result.matched).toBe(false);
    expect(result.residue).toBe('unknownmood');
  });
});

describe('bootstrapVocabCandidates', () => {
  it('clusters common prefixes and suffixes with count >= 2', () => {
    const { prefixes, suffixes } = bootstrapVocabCandidates([
      'elsie_angry',
      'elsie_sad',
      'lily_angry',
      'lily_sad',
      'once_only',
    ]);
    expect(prefixes[0]).toEqual({ value: 'elsie', count: 2 });
    expect(prefixes).toContainEqual({ value: 'lily', count: 2 });
    expect(suffixes).toContainEqual({ value: 'angry', count: 2 });
    expect(suffixes).toContainEqual({ value: 'sad', count: 2 });
    expect(prefixes.find((candidate) => candidate.value === 'once')).toBeUndefined();
  });
});
