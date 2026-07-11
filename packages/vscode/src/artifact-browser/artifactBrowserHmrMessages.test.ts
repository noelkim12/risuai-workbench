import { describe, expect, it } from 'vitest';
import {
  createArtifactBrowserHmrStatusMessage,
  isArtifactBrowserHmrStartBroadcastMessage,
  isArtifactBrowserHmrStopBroadcastMessage,
} from './artifactBrowserMessages';

describe('hmr message contract', () => {
  it('accepts a well-formed hmrStartBroadcast message', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrStartBroadcast',
      payload: { stableId: 'abc' },
    };

    expect(isArtifactBrowserHmrStartBroadcastMessage(message)).toBe(true);
    expect(isArtifactBrowserHmrStartBroadcastMessage({ ...message, payload: { stableId: '' } })).toBe(false);
    expect(isArtifactBrowserHmrStartBroadcastMessage({ ...message, type: 'artifact-browser/other' })).toBe(false);
  });

  it('accepts hmrStopBroadcast with empty payload', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrStopBroadcast',
      payload: {},
    };

    expect(isArtifactBrowserHmrStopBroadcastMessage(message)).toBe(true);
  });

  it('creates hmrStatus envelope', () => {
    const message = createArtifactBrowserHmrStatusMessage({ running: false, updateCount: 0 });

    expect(message.type).toBe('artifact-browser/hmrStatus');
    expect(message.payload).toEqual({ running: false, updateCount: 0 });
    expect(message.protocol).toBe('risu-workbench.artifact-browser');
  });
});
