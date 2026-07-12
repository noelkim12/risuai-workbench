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

  it('is hosted by the create-wizard panel app, not the sidebar', () => {
    expect(wizardSource).toContain('export let onCreate');
    expect(wizardSource).toContain('export let onClose');
    // The sidebar now only opens the wizard; it no longer hosts it.
    expect(sidebarSource).toContain('onOpenCreateWizard');
    expect(sidebarSource).not.toContain('CreateArtifactWizard');
    expect(sidebarSource).not.toContain('submitCreate');
  });

  it('animates step changes and respects reduced motion', () => {
    expect(wizardSource).toContain("from 'svelte/transition'");
    expect(wizardSource).toContain('prefers-reduced-motion');
    expect(wizardSource).toContain('motionDuration');
  });
});
