import { describe, expect, it } from 'vitest';
import { selectPreferredCard } from './cardSelection';
import type { BrowserArtifactCard } from './artifactBrowserTypes';

function card(stableId: string, rootUri: string): BrowserArtifactCard {
  return { stableId, rootUri } as unknown as BrowserArtifactCard;
}

describe('selectPreferredCard', () => {
  it('returns undefined when no preferred uri is given', () => {
    expect(selectPreferredCard([card('a', 'file:///w/a')], undefined)).toBeUndefined();
  });

  it('returns the card whose rootUri matches the preferred uri', () => {
    const cards = [card('a', 'file:///w/a'), card('b', 'file:///w/b')];
    expect(selectPreferredCard(cards, 'file:///w/b')?.stableId).toBe('b');
  });

  it('returns undefined when no card matches', () => {
    expect(selectPreferredCard([card('a', 'file:///w/a')], 'file:///w/zzz')).toBeUndefined();
  });
});
