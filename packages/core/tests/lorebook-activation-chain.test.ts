import { describe, expect, it } from 'vitest';
import { analyzeLorebookActivationChains, analyzeLorebookActivationChainsFromCharx } from '@/domain';

describe('analyzeLorebookActivationChains', () => {
  it('detects recursive chain edges when lorebook content contains another entry keyword', () => {
    const result = analyzeLorebookActivationChains([
      {
        comment: 'Alpha',
        key: 'alpha',
        content: 'Alpha lore mentions beta to wake the next entry.',
      },
      {
        comment: 'Beta',
        key: 'beta',
        content: 'Beta lore body',
      },
    ]);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        sourceId: 'Alpha',
        targetId: 'Beta',
        status: 'possible',
        matchedKeywords: ['beta'],
      }),
    );
    expect(result.summary.possibleEdges).toBe(1);
  });

  it('marks recursive edges blocked when the target disables recursive search', () => {
    const result = analyzeLorebookActivationChains([
      {
        comment: 'Alpha',
        key: 'alpha',
        content: 'beta appears here',
      },
      {
        comment: 'Beta',
        key: 'beta',
        content: '@@no_recursive_search\nBeta lore body',
      },
    ]);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        sourceId: 'Alpha',
        targetId: 'Beta',
        status: 'blocked',
        blockedBy: ['target-no-recursive-search'],
      }),
    );
    expect(result.summary.blockedEdges).toBe(1);
  });

  it('marks selective chains as partial when only primary keys are satisfied', () => {
    const result = analyzeLorebookActivationChains([
      {
        comment: 'Alpha',
        key: 'alpha',
        content: 'beta is present but no backup token exists here',
      },
      {
        comment: 'Beta',
        key: 'beta',
        secondkey: 'gamma',
        selective: true,
        content: 'Selective beta lore body',
      },
    ]);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        sourceId: 'Alpha',
        targetId: 'Beta',
        status: 'partial',
        matchedKeywords: ['beta'],
        missingSecondaryKeywords: ['gamma'],
      }),
    );
    expect(result.summary.partialEdges).toBe(1);
  });

  it('treats selective chains as possible when both primary and secondary keys are present', () => {
    const result = analyzeLorebookActivationChains([
      {
        comment: 'Alpha',
        key: 'alpha',
        content: 'beta and gamma both appear in this lore text',
      },
      {
        comment: 'Beta',
        key: 'beta',
        secondkey: 'gamma',
        selective: true,
        content: 'Selective beta lore body',
      },
    ]);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        sourceId: 'Alpha',
        targetId: 'Beta',
        status: 'possible',
        matchedKeywords: ['beta'],
        matchedSecondaryKeywords: ['gamma'],
      }),
    );
  });
});

describe('analyzeLorebookActivationChainsFromCharx', () => {
  it('respects character_book.recursive_scanning when analyzing charx cards', () => {
    const result = analyzeLorebookActivationChainsFromCharx({
      data: {
        character_book: {
          recursive_scanning: false,
          entries: [
            {
              comment: 'Alpha',
              key: 'alpha',
              content: 'beta appears here',
            },
            {
              comment: 'Beta',
              key: 'beta',
              content: 'Beta lore body',
            },
          ],
        },
      },
    });

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        sourceId: 'Alpha',
        targetId: 'Beta',
        status: 'blocked',
        blockedBy: ['global-recursive-scanning-disabled'],
      }),
    );
    expect(result.summary.recursiveScanningEnabled).toBe(false);
  });
});
