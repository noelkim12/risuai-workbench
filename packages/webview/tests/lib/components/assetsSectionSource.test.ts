import { describe, expect, it } from 'vitest';
import accordionSource from '../../../src/lib/components/sidebar/WorkbenchAccordions.svelte?raw';

describe('WorkbenchAccordions assets section', () => {
  it('renders an entry button instead of item list for assets sections', () => {
    expect(accordionSource).toContain("section.kind === 'assets'");
    expect(accordionSource).toContain('Open Asset Manager');
    expect(accordionSource).toContain('onOpenAssetManager');
  });
});
