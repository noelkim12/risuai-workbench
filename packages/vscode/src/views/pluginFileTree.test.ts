import { describe, expect, it } from 'vitest';
import { shouldExcludePluginEntry } from './pluginFileTree';

describe('shouldExcludePluginEntry', () => {
  it('excludes node_modules, .git, dist', () => {
    expect(shouldExcludePluginEntry('node_modules')).toBe(true);
    expect(shouldExcludePluginEntry('.git')).toBe(true);
    expect(shouldExcludePluginEntry('dist')).toBe(true);
  });

  it('excludes any dot-directory name', () => {
    expect(shouldExcludePluginEntry('.vscode')).toBe(true);
    expect(shouldExcludePluginEntry('.cache')).toBe(true);
  });

  it('keeps normal source entries', () => {
    expect(shouldExcludePluginEntry('src')).toBe(false);
    expect(shouldExcludePluginEntry('index.ts')).toBe(false);
    expect(shouldExcludePluginEntry('package.json')).toBe(false);
  });
});
