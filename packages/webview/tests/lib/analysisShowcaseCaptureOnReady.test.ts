import { describe, expect, it } from 'vitest';
// biome-ignore lint/style/useNamingConvention: Vite ?raw import returns the file source string.
import AppSource from '../../src/lib/analysis-showcase/AnalysisShowcaseApp.svelte?raw';

describe('capture-on-ready re-trigger behavior', () => {
  it('installs the host message listener before announcing readiness', () => {
    const listenerIndex = AppSource.indexOf("window.addEventListener('message', handleMessage)");
    const readyIndex = AppSource.indexOf('postAnalysisShowcaseMessage(createAnalysisShowcaseReadyMessage())');

    expect(listenerIndex).toBeGreaterThan(-1);
    expect(readyIndex).toBeGreaterThan(listenerIndex);
  });

  it('does not use a permanent captureTriggered flag that blocks repeated captures', () => {
    expect(AppSource).not.toMatch(/captureTriggered/);
  });

  it('triggers capture on each loaded captureOnReady:true when not capturePending', () => {
    expect(AppSource).toMatch(/captureOnReady && !capturePending/);
  });

  it('resets capturePending on saveCompleted so subsequent captures can proceed', () => {
    expect(AppSource).toMatch(/capturePending = false/);
  });
});
