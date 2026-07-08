import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
} from '../../src/lib/types';
import {
  createArtifactBrowserOpenCreateWizardMessage,
  createArtifactBrowserCloseCreateWizardMessage,
} from '../../src/lib/vscode';

describe('create wizard open/close message factories', () => {
  it('builds an openCreateWizard envelope', () => {
    expect(createArtifactBrowserOpenCreateWizardMessage()).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/openCreateWizard',
      payload: { viewId: ARTIFACT_BROWSER_VIEW_ID },
    });
  });

  it('builds a closeCreateWizard envelope', () => {
    expect(createArtifactBrowserCloseCreateWizardMessage()).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/closeCreateWizard',
      payload: { viewId: ARTIFACT_BROWSER_VIEW_ID },
    });
  });
});
