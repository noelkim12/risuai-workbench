import { describe, expect, it } from 'vitest';
import { derivePluginPackageInfo } from './pluginPackageJson';

describe('derivePluginPackageInfo', () => {
  it('reads version and detects build+dev scripts', () => {
    const info = derivePluginPackageInfo(
      JSON.stringify({ version: '1.2.0', scripts: { build: 'tsc', dev: 'vite' } }),
    );
    expect(info).toEqual({ version: '1.2.0', scripts: { build: true, dev: true }, error: null });
  });

  it('marks missing scripts as false', () => {
    const info = derivePluginPackageInfo(JSON.stringify({ version: '0.1.0', scripts: { build: 'x' } }));
    expect(info.scripts).toEqual({ build: true, dev: false });
    expect(info.version).toBe('0.1.0');
  });

  it('returns null version when absent', () => {
    const info = derivePluginPackageInfo(JSON.stringify({ scripts: {} }));
    expect(info.version).toBeNull();
    expect(info.scripts).toEqual({ build: false, dev: false });
  });

  it('reports a parse error on malformed JSON', () => {
    const info = derivePluginPackageInfo('{oops');
    expect(info.error).toMatch(/package\.json/i);
    expect(info.scripts).toEqual({ build: false, dev: false });
  });
});
