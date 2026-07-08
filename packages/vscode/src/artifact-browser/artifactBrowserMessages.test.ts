import { describe, expect, it } from 'vitest';
import { isArtifactBrowserCreateArtifactMessage } from './artifactBrowserMessages';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
} from './artifactBrowserTypes';

function createEnvelope(payload: unknown): unknown {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type: 'artifact-browser/createArtifact',
    payload,
  };
}

describe('createArtifact payload guard (plugin kind)', () => {
  it('accepts a plugin payload with kebab-case name and framework', () => {
    const message = createEnvelope({
      kind: 'plugin',
      name: 'my-plugin',
      description: 'demo',
      framework: 'svelte',
    });
    expect(isArtifactBrowserCreateArtifactMessage(message)).toBe(true);
  });

  it('rejects a plugin payload without framework', () => {
    const message = createEnvelope({ kind: 'plugin', name: 'my-plugin' });
    expect(isArtifactBrowserCreateArtifactMessage(message)).toBe(false);
  });

  it('rejects a plugin payload with a non-kebab-case name', () => {
    const message = createEnvelope({ kind: 'plugin', name: 'My Plugin', framework: 'vanilla' });
    expect(isArtifactBrowserCreateArtifactMessage(message)).toBe(false);
  });

  it('rejects an unknown framework value', () => {
    const message = createEnvelope({ kind: 'plugin', name: 'my-plugin', framework: 'react' });
    expect(isArtifactBrowserCreateArtifactMessage(message)).toBe(false);
  });

  it('still accepts existing charx payloads without framework', () => {
    const message = createEnvelope({ kind: 'charx', name: 'My Char', creator: 'me' });
    expect(isArtifactBrowserCreateArtifactMessage(message)).toBe(true);
  });
});
