import { afterEach, describe, expect, it, vi } from 'vitest';

const toPngMock = vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>();

vi.mock('html-to-image', () => ({
  toPng: (node: HTMLElement, options?: Record<string, unknown>) => toPngMock(node, options),
}));

const { exportShowcasePng } = await import('../../src/lib/analysis-showcase/exportShowcasePng');

function createStubElement(): HTMLElement {
  return { nodeType: 1 } as unknown as HTMLElement;
}

afterEach(() => {
  toPngMock.mockReset();
});

describe('exportShowcasePng', () => {
  it('calls toPng with exact fixed options: width 1200, height 630, pixelRatio 2, backgroundColor #101522, cacheBust false', async () => {
    toPngMock.mockResolvedValue('data:image/png;base64,abc');
    const node = createStubElement();
    await exportShowcasePng(node);

    expect(toPngMock).toHaveBeenCalledTimes(1);
    const [, options = {}] = toPngMock.mock.calls[0];
    expect(options).toEqual({
      width: 1200,
      height: 630,
      pixelRatio: 2,
      backgroundColor: '#101522',
      cacheBust: false,
    });
  });

  it('does not set canvasWidth or canvasHeight', async () => {
    toPngMock.mockResolvedValue('data:image/png;base64,abc');
    const node = createStubElement();
    await exportShowcasePng(node);

    const [, options = {}] = toPngMock.mock.calls[0];
    expect(options).not.toHaveProperty('canvasWidth');
    expect(options).not.toHaveProperty('canvasHeight');
  });

  it('returns the data URL string from toPng', async () => {
    toPngMock.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    const node = createStubElement();
    const result = await exportShowcasePng(node);
    expect(result).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('propagates rejection from toPng', async () => {
    toPngMock.mockRejectedValue(new Error('canvas tainted'));
    const node = createStubElement();
    await expect(exportShowcasePng(node)).rejects.toThrow('canvas tainted');
  });
});
