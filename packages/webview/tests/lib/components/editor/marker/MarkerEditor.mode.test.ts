import { describe, expect, it } from 'vitest';
// biome-ignore lint/style/useNamingConvention: Vite ?raw import returns the file source string.
import MarkerEditorSource from '../../../../../src/lib/components/editor/marker/MarkerEditor.svelte?raw';
// biome-ignore lint/style/useNamingConvention: Vite ?raw import returns the file source string.
import MarkerFormSource from '../../../../../src/lib/components/editor/marker/MarkerForm.svelte?raw';

describe('marker editor plugin mode wiring', () => {
  it('accepts the plugin mode in the mode guard', () => {
    expect(MarkerEditorSource).toMatch(/value === 'plugin'/);
  });

  it('renders plugin fields in MarkerForm', () => {
    expect(MarkerFormSource).toMatch(/isPluginMode/);
  });
});
