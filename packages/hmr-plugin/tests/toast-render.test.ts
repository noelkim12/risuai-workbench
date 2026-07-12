import { afterEach, describe, expect, it, vi } from 'vitest';

import { createToast } from '../src/helpers/toast';

interface FakeElement {
  text: string;
  appendChild(child: FakeElement): Promise<void>;
  remove(): Promise<void>;
  setStyle(property: string, value: string): Promise<void>;
  setTextContent(text: string): Promise<void>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createToast', () => {
  it('keeps the newest notice when async host DOM writes overlap', async () => {
    let releaseFirstWrite = (): void => {};
    let markFirstWriteStarted = (): void => {};
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const elements: FakeElement[] = [];

    const rootDocument = {
      async appendChild(): Promise<void> {},
      async createElement(): Promise<FakeElement> {
        const index = elements.length;
        let writeCount = 0;
        const element: FakeElement = {
          text: '',
          async appendChild(): Promise<void> {},
          async remove(): Promise<void> {},
          async setStyle(): Promise<void> {},
          async setTextContent(text: string): Promise<void> {
            writeCount += 1;
            if (index === 4 && writeCount === 1) {
              markFirstWriteStarted();
              await firstWriteGate;
            }
            element.text = text;
          },
        };
        elements.push(element);
        return element;
      },
    };
    vi.stubGlobal('risuai', { getRootDocument: async () => rootDocument });
    const toast = await createToast();
    expect(toast).not.toBeNull();
    if (toast === null) return;

    toast.show({ kind: 'single', label: '이전', version: 1, assetCount: 0 });
    toast.show({ kind: 'single', label: '최신', version: 2, assetCount: 0 });
    await firstWriteStarted;
    releaseFirstWrite();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(elements[4]?.text).toBe('최신 업데이트 반영됨');
    expect(elements[5]?.text).toBe('v2');
    toast.destroy();
  });
});
