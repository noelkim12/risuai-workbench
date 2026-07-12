import { describe, expect, it } from 'vitest';
import mainSource from '../../../src/main.ts?raw';
import cardSource from '../../../src/lib/components/ArtifactCard.svelte?raw';
import wizardSource from '../../../src/lib/components/CreateArtifactWizard.svelte?raw';

describe('Plugin create webview/source contract', () => {
  it('offers the plugin kind with a framework choice in the create wizard', () => {
    expect(wizardSource).toContain('selectKind(card.kind)');
    expect(wizardSource).toContain('pluginFramework');
    expect(wizardSource).toContain("kind: 'plugin'");
  });

  it('blocks submit for non-kebab-case plugin names', () => {
    expect(wizardSource).toContain('pluginNameInvalid');
    expect(wizardSource).toContain('disabled={!canCreate}');
  });

  it('routes plugin card selection into the detail view with an empty section list', () => {
    expect(mainSource).toContain("selectedCard.artifactKind === 'plugin'");
    expect(mainSource).toContain("viewMode.set('artifactDetail')");
  });

  it('renders plugin cards with framework metadata', () => {
    expect(cardSource).toContain("card.artifactKind === 'plugin'");
    expect(cardSource).toContain('card.framework');
  });
});
