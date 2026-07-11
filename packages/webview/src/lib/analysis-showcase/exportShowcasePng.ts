/**
 * Showcase PNG export helper with fixed toPng options.
 * @file packages/webview/src/lib/analysis-showcase/exportShowcasePng.ts
 */

import { toPng } from 'html-to-image';

const SHOWCASE_PNG_WIDTH = 1200;
const SHOWCASE_PNG_HEIGHT = 630;
const SHOWCASE_PNG_PIXEL_RATIO = 2;
const SHOWCASE_PNG_BACKGROUND = '#101522';

export async function exportShowcasePng(node: HTMLElement): Promise<string> {
  return toPng(node, {
    width: SHOWCASE_PNG_WIDTH,
    height: SHOWCASE_PNG_HEIGHT,
    pixelRatio: SHOWCASE_PNG_PIXEL_RATIO,
    backgroundColor: SHOWCASE_PNG_BACKGROUND,
    cacheBust: false,
  });
}
