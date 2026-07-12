import { describe, expect, it } from 'vitest';
import DetailViewSource from '../../../src/lib/components/ArtifactDetailView.svelte?raw';

describe('ArtifactDetailView plugin header actions', () => {
  it('renders Marker Editor and Plugin Viewer buttons for plugin artifacts', () => {
    expect(DetailViewSource).toMatch(/artifact\.artifactKind === 'plugin'/);
    expect(DetailViewSource).toMatch(/onOpenMarkerEditor/);
    expect(DetailViewSource).toMatch(/onOpenPluginViewer/);
  });
});
