import { describe, expect, it } from 'vitest';
import appSource from '../../../src/CreateWizardApp.svelte?raw';
import mainSource from '../../../src/main.ts?raw';

describe('CreateWizardApp source contract', () => {
  it('hosts the wizard always-open with delegated callbacks', () => {
    expect(appSource).toContain('CreateArtifactWizard');
    expect(appSource).toContain('open={true}');
    expect(appSource).toContain('export let onCreate');
    expect(appSource).toContain('export let onClose');
    expect(appSource).toContain('onCreate={onCreate}');
    expect(appSource).toContain('onClose={onClose}');
  });

  it('is mounted by main.ts for the create-wizard webview', () => {
    expect(mainSource).toContain("webviewName === 'create-wizard'");
    expect(mainSource).toContain('CreateWizardApp');
    expect(mainSource).toContain('createArtifactBrowserOpenCreateWizardMessage');
    expect(mainSource).toContain('createArtifactBrowserCloseCreateWizardMessage');
  });
});
