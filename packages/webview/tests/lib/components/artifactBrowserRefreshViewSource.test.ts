import { describe, expect, it } from 'vitest';
import mainSource from '../../../src/main.ts?raw';

describe('Artifact Browser refresh view-mode source contract', () => {
  it('only navigates to the detail view for a user-initiated card selection', () => {
    // detailLoaded arrives for background refreshes too (watcher rescans, the
    // sidebar Refresh button); those must not yank the user out of SidebarView.
    expect(mainSource).toContain('pendingDetailNavigationStableId');
    expect(mainSource).not.toMatch(/detailSections\.set\(message\.payload\.sections\);[\s\S]{0,200}viewMode\.set\('artifactDetail'\);\n\s*setStatus/);
  });

  it('clears any pending detail navigation when returning to or refreshing the card list', () => {
    const refreshBody = mainSource.slice(mainSource.indexOf('function refreshCards'), mainSource.indexOf('function createArtifact'));
    expect(refreshBody).toContain('pendingDetailNavigationStableId = undefined');
    const returnBody = mainSource.slice(mainSource.indexOf('function returnToCards'), mainSource.indexOf('function toggleSection'));
    expect(returnBody).toContain('pendingDetailNavigationStableId = undefined');
  });

  it('marks a pending detail navigation when the user selects a card', () => {
    const selectBody = mainSource.slice(mainSource.indexOf('function selectCard'), mainSource.indexOf('function returnToCards'));
    expect(selectBody).toContain('pendingDetailNavigationStableId = stableId');
  });
});
