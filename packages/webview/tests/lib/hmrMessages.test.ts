import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
} from '../../src/lib/types';
import {
  createArtifactBrowserHmrStartBroadcastMessage,
  createArtifactBrowserHmrStopBroadcastMessage,
} from '../../src/lib/vscode';

describe('hmr message factories', () => {
  it('builds an hmrStartBroadcast envelope', () => {
    expect(createArtifactBrowserHmrStartBroadcastMessage({ stableId: 'artifact-1' })).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/hmrStartBroadcast',
      payload: { stableId: 'artifact-1' },
    });
  });

  it('builds an hmrStopBroadcast envelope', () => {
    expect(createArtifactBrowserHmrStopBroadcastMessage()).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/hmrStopBroadcast',
      payload: {},
    });
  });
});
