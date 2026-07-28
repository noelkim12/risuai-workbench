import { describe, expect, it } from 'vitest';
import type { AnalysisShowcase } from '@risuai-workbench/core';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
} from '../../src/lib/types';
import {
  createArtifactBrowserOpenAnalysisReportMessage,
  createArtifactBrowserOpenAnalysisShowcaseMessage,
  createArtifactBrowserShareAnalysisShowcaseMessage,
} from '../../src/lib/vscode';
import {
  ANALYSIS_SHOWCASE_PROTOCOL,
  ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
  createAnalysisShowcaseOpenFullReportMessage,
  createAnalysisShowcasePngCaptureFailedMessage,
  createAnalysisShowcaseReadyMessage,
  createAnalysisShowcaseSavePngMessage,
  isAnalysisShowcaseErrorMessage,
  isAnalysisShowcaseLoadedMessage,
  isAnalysisShowcaseSaveCompletedMessage,
} from '../../src/lib/analysis-showcase/protocol';

const showcase: AnalysisShowcase = {
  version: 1,
  artifact: { stableId: 'artifact-1', name: 'Merry Sisters', type: 'character' },
  generatedAt: '2026-07-10T00:00:00.000Z',
  metrics: { variables: 3, connectedVariables: 2, assetFiles: 24 },
  distributions: {
    elements: [{ id: 'lorebooks', label: 'Lorebooks', count: 2 }],
    variableConnectivity: [{ id: 'bridged', label: 'Bridged', count: 2 }],
  },
  findings: { error: 0, warning: 1, information: 2 },
  traits: [{ id: 'cross-layer', label: 'Cross-layer' }],
  report: { html: 'Merry Sisters #1.html' },
};

describe('artifact browser analysis action factories', () => {
  it('builds stableId-only action messages', () => {
    expect(createArtifactBrowserOpenAnalysisShowcaseMessage('artifact-1')).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/openAnalysisShowcase',
      payload: { stableId: 'artifact-1' },
    });
    expect(createArtifactBrowserShareAnalysisShowcaseMessage('artifact-1')).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/shareAnalysisShowcase',
      payload: { stableId: 'artifact-1' },
    });
    expect(createArtifactBrowserOpenAnalysisReportMessage('artifact-1')).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/openAnalysisReport',
      payload: { stableId: 'artifact-1' },
    });
  });
});

describe('analysis showcase webview protocol', () => {
  it('builds every valid webview-to-host message', () => {
    expect(createAnalysisShowcaseReadyMessage()).toEqual({
      protocol: ANALYSIS_SHOWCASE_PROTOCOL,
      version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
      type: 'analysis-showcase/ready',
      payload: {},
    });
    expect(createAnalysisShowcaseOpenFullReportMessage()).toEqual({
      protocol: ANALYSIS_SHOWCASE_PROTOCOL,
      version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
      type: 'analysis-showcase/openFullReport',
      payload: {},
    });
    expect(createAnalysisShowcaseSavePngMessage('data:image/png;base64,abcd')).toEqual({
      protocol: ANALYSIS_SHOWCASE_PROTOCOL,
      version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
      type: 'analysis-showcase/savePng',
      payload: { dataUrl: 'data:image/png;base64,abcd' },
    });
    expect(createAnalysisShowcasePngCaptureFailedMessage('canvas blocked')).toEqual({
      protocol: ANALYSIS_SHOWCASE_PROTOCOL,
      version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
      type: 'analysis-showcase/pngCaptureFailed',
      payload: { message: 'canvas blocked' },
    });
  });

  it('accepts every valid host-to-webview message', () => {
    expect(
      isAnalysisShowcaseLoadedMessage({
        protocol: ANALYSIS_SHOWCASE_PROTOCOL,
        version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
        type: 'analysis-showcase/loaded',
        payload: { showcase, freshness: 'fresh', reportAvailable: true, captureOnReady: false },
      }),
    ).toBe(true);
    expect(
      isAnalysisShowcaseSaveCompletedMessage({
        protocol: ANALYSIS_SHOWCASE_PROTOCOL,
        version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
        type: 'analysis-showcase/saveCompleted',
        payload: {},
      }),
    ).toBe(true);
    expect(
      isAnalysisShowcaseErrorMessage({
        protocol: ANALYSIS_SHOWCASE_PROTOCOL,
        version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
        type: 'analysis-showcase/error',
        payload: { message: 'Report missing' },
      }),
    ).toBe(true);
  });

  it('rejects malformed host messages at the webview boundary', () => {
    const validLoaded = {
      protocol: ANALYSIS_SHOWCASE_PROTOCOL,
      version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
      type: 'analysis-showcase/loaded',
      payload: { showcase, freshness: 'outdated', reportAvailable: false, captureOnReady: true },
    };

    expect(isAnalysisShowcaseLoadedMessage({ ...validLoaded, protocol: 'risu-workbench.artifact-browser' })).toBe(false);
    expect(isAnalysisShowcaseLoadedMessage({ ...validLoaded, version: 2 })).toBe(false);
    expect(isAnalysisShowcaseLoadedMessage({ ...validLoaded, type: 'analysis-showcase/saveCompleted' })).toBe(false);
    expect(isAnalysisShowcaseLoadedMessage({ ...validLoaded, payload: { ...validLoaded.payload, freshness: 'stale' } })).toBe(false);
    expect(isAnalysisShowcaseLoadedMessage({ ...validLoaded, payload: { ...validLoaded.payload, rootUri: '/tmp/card' } })).toBe(false);
    expect(isAnalysisShowcaseErrorMessage({ ...validLoaded, type: 'analysis-showcase/error', payload: { message: 7 } })).toBe(false);
  });
});
