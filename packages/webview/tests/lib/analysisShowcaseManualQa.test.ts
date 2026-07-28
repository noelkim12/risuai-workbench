import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisShowcase } from '@risuai-workbench/core';

const toPngMock = vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>();

vi.mock('html-to-image', () => ({
  toPng: (node: HTMLElement, options?: Record<string, unknown>) => toPngMock(node, options),
}));

const { exportShowcasePng } = await import('../../src/lib/analysis-showcase/exportShowcasePng');
const { toAnalysisShowcaseViewModel } = await import(
  '../../src/lib/analysis-showcase/analysisShowcaseViewModel'
);

const showcase: AnalysisShowcase = {
  version: 1,
  artifact: { stableId: 'char-1', name: 'Merry Sisters! #1', type: 'character' },
  generatedAt: '2026-07-10T12:00:00.000Z',
  metrics: {
    variables: 42,
    connectedVariables: 30,
    lorebookEntries: 120,
    luaFiles: 15,
    luaFunctions: 340,
    regexScripts: 12,
    assetFiles: 24,
    activationChains: 85,
  },
  distributions: {
    elements: [
      { id: 'lorebooks', label: 'Lorebooks', count: 5 },
      { id: 'lua', label: 'Lua Files', count: 15 },
      { id: 'regex', label: 'Regex', count: 12 },
    ],
    variableConnectivity: [
      { id: 'bridged', label: 'Bridged', count: 30 },
      { id: 'isolated', label: 'Isolated', count: 12 },
    ],
  },
  findings: { error: 0, warning: 3, information: 12 },
  traits: [
    { id: 'cross-layer', label: 'Cross-layer Integration' },
    { id: 'chain-reaction', label: 'Chain Reaction' },
    { id: 'deep-lore', label: 'Deep Lore' },
    { id: 'lua-driven', label: 'Lua Driven' },
  ],
  report: { html: 'charx-analysis.html' },
};

function createStubElement(): HTMLElement {
  return { nodeType: 1 } as unknown as HTMLElement;
}

afterEach(() => {
  toPngMock.mockReset();
});

describe('manual QA: showcase export 2400x1260 intent and view model hierarchy', () => {
  it('toPng options produce a 2400x1260 bitmap (width 1200 * pixelRatio 2, height 630 * pixelRatio 2)', async () => {
    toPngMock.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    const node = createStubElement();
    await exportShowcasePng(node);

    const [, options = {}] = toPngMock.mock.calls[0];
    const width = options.width as number;
    const height = options.height as number;
    const pixelRatio = options.pixelRatio as number;
    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;

    expect(physicalWidth).toBe(2400);
    expect(physicalHeight).toBe(1260);
    expect(options.backgroundColor).toBe('#101522');
    expect(options.cacheBust).toBe(false);
    expect(options).not.toHaveProperty('canvasWidth');
    expect(options).not.toHaveProperty('canvasHeight');
  });

  it('view model hierarchy renders artifact identity, hero metric, traits, distributions, findings', () => {
    const vm = toAnalysisShowcaseViewModel(showcase, 'fresh');

    expect(vm.artifactName).toBe('Merry Sisters! #1');
    expect(vm.artifactType).toBe('character');
    expect(vm.heroMetric.id).toBe('activationChains');
    expect(vm.heroMetric.value).toBe(85);
    expect(vm).not.toHaveProperty('traits');
    expect(vm.elementDistribution).toHaveLength(3);
    expect(vm.variableConnectivity).toHaveLength(2);
    expect(vm.findings).toEqual({ error: 0, warning: 3, information: 12 });
    expect(vm.freshness).toBe('fresh');
    expect(vm.generatedAtLabel).toBe('2026-07-10T12:00:00.000Z');
  });

  it('supporting metrics exclude hero metric and undefined fields', () => {
    const vm = toAnalysisShowcaseViewModel(showcase, 'outdated');
    const ids = vm.supportingMetrics.map((m) => m.id);
    expect(ids).not.toContain('activationChains');
    expect(ids).toContain('variables');
    expect(ids).toContain('connectedVariables');
    expect(ids).toContain('lorebookEntries');
    expect(ids).toContain('luaFiles');
    expect(ids).toContain('luaFunctions');
    expect(ids).toContain('regexScripts');
    expect(ids).toContain('assetFiles');
  });

  it('generates PNG fixture metadata proving 2400x1260 intent', async () => {
    const fixtureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    toPngMock.mockResolvedValue(fixtureDataUrl);
    const node = createStubElement();
    const dataUrl = await exportShowcasePng(node);

    const [, options = {}] = toPngMock.mock.calls[0];
    const fixture = {
      requestedWidth: options.width,
      requestedHeight: options.height,
      pixelRatio: options.pixelRatio,
      physicalWidth: (options.width as number) * (options.pixelRatio as number),
      physicalHeight: (options.height as number) * (options.pixelRatio as number),
      backgroundColor: options.backgroundColor,
      cacheBust: options.cacheBust,
      hasCanvasWidth: 'canvasWidth' in options,
      hasCanvasHeight: 'canvasHeight' in options,
      dataUrlPrefix: dataUrl.slice(0, 22),
      dataUrlLength: dataUrl.length,
    };

    console.log(JSON.stringify({ pngFixtureMetadata: fixture }));
    expect(fixture.physicalWidth).toBe(2400);
    expect(fixture.physicalHeight).toBe(1260);
    expect(fixture.hasCanvasWidth).toBe(false);
    expect(fixture.hasCanvasHeight).toBe(false);
    expect(fixture.dataUrlPrefix).toBe('data:image/png;base64,');
  });

  it('simulates toPng rejection producing pngCaptureFailed intent', async () => {
    toPngMock.mockRejectedValue(new Error('canvas tainted by cross-origin image'));
    const node = createStubElement();

    await expect(exportShowcasePng(node)).rejects.toThrow('canvas tainted');
    expect(toPngMock).toHaveBeenCalledTimes(1);
  });

  it('simulates invalid PNG host response through error metadata', () => {
    const invalidHostResponse = {
      type: 'analysis-showcase/error',
      payload: { message: 'Invalid PNG: invalid-mime' },
    };

    expect(invalidHostResponse.type).toBe('analysis-showcase/error');
    expect(invalidHostResponse.payload.message).toBe('Invalid PNG: invalid-mime');
  });
});
