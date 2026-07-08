import { describe, expect, it } from 'vitest';
// biome-ignore lint/style/useNamingConvention: Vite ?raw import returns the file source string.
import MainSource from '../src/main.ts?raw';

describe('plugin-viewer mount branch', () => {
  it('mounts PluginViewerApp when webviewName is plugin-viewer', () => {
    expect(MainSource).toMatch(/webviewName === 'plugin-viewer'/);
    expect(MainSource).toMatch(/PluginViewerApp/);
  });
});
