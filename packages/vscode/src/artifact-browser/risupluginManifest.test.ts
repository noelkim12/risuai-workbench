import { describe, expect, it } from 'vitest';
import { parseRisupluginManifest, RISUPLUGIN_FILENAME } from './risupluginManifest';

const VALID = JSON.stringify({
  kind: 'risu-plugin',
  schemaVersion: 1,
  id: 'my-plugin',
  name: 'my-plugin',
  description: 'demo plugin',
  framework: 'svelte',
  createdAt: '2026-07-08T00:00:00.000Z',
  modifiedAt: '2026-07-08T00:00:00.000Z',
});

describe('parseRisupluginManifest', () => {
  it('parses a valid manifest', () => {
    const manifest = parseRisupluginManifest(VALID, '/root/.risuplugin');
    expect(manifest.name).toBe('my-plugin');
    expect(manifest.framework).toBe('svelte');
    expect(manifest.id).toBe('my-plugin');
  });

  it('throws a classified error on malformed JSON', () => {
    expect(() => parseRisupluginManifest('{oops', '/root/.risuplugin')).toThrow(
      new RegExp(`Invalid ${RISUPLUGIN_FILENAME} JSON`),
    );
  });

  it('throws when kind is wrong', () => {
    const text = JSON.stringify({ kind: 'risu-module', name: 'x' });
    expect(() => parseRisupluginManifest(text, '/root/.risuplugin')).toThrow(/kind must be/);
  });

  it('throws when name is missing', () => {
    const text = JSON.stringify({ kind: 'risu-plugin' });
    expect(() => parseRisupluginManifest(text, '/root/.risuplugin')).toThrow(/missing required fields/);
  });

  it('coerces an unknown framework to "unknown"', () => {
    const text = JSON.stringify({ kind: 'risu-plugin', name: 'x', framework: 'react' });
    expect(parseRisupluginManifest(text, '/root/.risuplugin').framework).toBe('unknown');
  });

  it('adopts a non-empty icon string', () => {
    const text = JSON.stringify({ kind: 'risu-plugin', name: 'x', icon: 'assets/icon.png' });
    expect(parseRisupluginManifest(text, '/root/.risuplugin').icon).toBe('assets/icon.png');
  });

  it('omits icon when it is an empty string', () => {
    const text = JSON.stringify({ kind: 'risu-plugin', name: 'x', icon: '' });
    expect(parseRisupluginManifest(text, '/root/.risuplugin').icon).toBeUndefined();
  });

  it('omits icon when it is not a string', () => {
    const text = JSON.stringify({ kind: 'risu-plugin', name: 'x', icon: 123 });
    expect(parseRisupluginManifest(text, '/root/.risuplugin').icon).toBeUndefined();
  });
});
