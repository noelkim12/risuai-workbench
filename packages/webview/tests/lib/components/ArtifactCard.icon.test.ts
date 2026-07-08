import { describe, expect, it } from 'vitest';
import ArtifactCardSource from '../../../src/lib/components/ArtifactCard.svelte?raw';

describe('ArtifactCard plugin icon rendering', () => {
  it('renders an <img> for a plugin card when card.iconUri is set', () => {
    // The plugin thumbnail branch must conditionally render card.iconUri, mirroring the module branch.
    expect(ArtifactCardSource).toContain("card.artifactKind === 'plugin'");
    expect(ArtifactCardSource).toMatch(/card\.iconUri/);
    expect(ArtifactCardSource).toMatch(/<img[^>]*src=\{card\.iconUri\}/);
  });
});
