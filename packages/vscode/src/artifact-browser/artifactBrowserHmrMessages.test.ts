import { describe, expect, it } from 'vitest';
import {
  createArtifactBrowserHmrStatusMessage,
  createArtifactBrowserHmrSaveCompletedMessage,
  isArtifactBrowserHmrOpenSavedPluginMessage,
  isArtifactBrowserHmrSavePluginMessage,
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

  it('accepts hmrSavePlugin only with an empty payload', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrSavePlugin',
      payload: {},
    };

    expect(isArtifactBrowserHmrSavePluginMessage(message)).toBe(true);
    expect(isArtifactBrowserHmrSavePluginMessage({ ...message, payload: { path: '/tmp/plugin.js' } })).toBe(false);
  });

  it('accepts hmrOpenSavedPlugin only with an empty payload', () => {
    const message = {
      protocol: 'risu-workbench.artifact-browser',
      version: 1,
      type: 'artifact-browser/hmrOpenSavedPlugin',
      payload: {},
    };

    expect(isArtifactBrowserHmrOpenSavedPluginMessage(message)).toBe(true);
    expect(isArtifactBrowserHmrOpenSavedPluginMessage({ ...message, payload: { uri: 'file:///tmp/plugin.js' } })).toBe(false);
  });

  it('creates hmrSaveCompleted envelopes', () => {
    expect(createArtifactBrowserHmrSaveCompletedMessage({ kind: 'saved' })).toMatchObject({
      type: 'artifact-browser/hmrSaveCompleted',
      payload: { kind: 'saved' },
    });
    expect(createArtifactBrowserHmrSaveCompletedMessage({ kind: 'failed', error: 'disk full' }).payload).toEqual({
      kind: 'failed',
      error: 'disk full',
    });
  });

  it('creates hmrStatus envelope', () => {
    const message = createArtifactBrowserHmrStatusMessage({ running: false, updateCount: 0 });

    expect(message.type).toBe('artifact-browser/hmrStatus');
    expect(message.payload).toEqual({ running: false, updateCount: 0 });
    expect(message.protocol).toBe('risu-workbench.artifact-browser');
  });
});
