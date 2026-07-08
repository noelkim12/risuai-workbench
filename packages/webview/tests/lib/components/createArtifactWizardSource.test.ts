import { describe, expect, it } from 'vitest';
import wizardSource from '../../../src/lib/components/CreateArtifactWizard.svelte?raw';
import sidebarSource from '../../../src/lib/components/SidebarView.svelte?raw';

describe('CreateArtifactWizard source contract', () => {
  it('declares the delegated props', () => {
    expect(wizardSource).toContain('export let open');
    expect(wizardSource).toContain('export let initialKind');
    expect(wizardSource).toContain('export let onCreate');
    expect(wizardSource).toContain('export let onClose');
  });

  it('owns the 2-step machine with icon-card type selection', () => {
    expect(wizardSource).toContain('let step');
    expect(wizardSource).toContain('KIND_CARDS');
    expect(wizardSource).toContain('function selectKind');
    // Selecting a card auto-advances to step 2.
    expect(wizardSource).toContain('step = 2');
    // Back returns to step 1.
    expect(wizardSource).toContain('function back');
  });

  it('owns create logic and per-kind payloads', () => {
    expect(wizardSource).toContain("kind: 'charx'");
    expect(wizardSource).toContain("kind: 'module'");
    expect(wizardSource).toContain("kind: 'plugin'");
    expect(wizardSource).toContain('pluginFramework');
    expect(wizardSource).toContain('pluginNameInvalid');
  });

  it('is rendered by the sidebar with delegated callbacks', () => {
    expect(sidebarSource).toContain('CreateArtifactWizard');
    expect(sidebarSource).toContain('onCreate={onCreateArtifact}');
    expect(sidebarSource).toContain('onClose={closeCreateModal}');
    // The inline create form no longer lives in the sidebar.
    expect(sidebarSource).not.toContain('submitCreate');
  });
});
