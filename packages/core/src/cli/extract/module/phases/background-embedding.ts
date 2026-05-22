/**
 * 모듈 backgroundEmbedding HTML artifact 추출 phase.
 * @file packages/core/src/cli/extract/module/phases/background-embedding.ts
 */

import path from 'node:path';
import { buildHtmlPath, extractHtmlFromModule } from '@/domain/custom-extension/extensions/html';
import { writeText } from '@/node';

export function phase6_extractBackgroundEmbedding(module: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundEmbedding 추출');

  const html = extractHtmlFromModule(module ?? {}, 'module');
  if (html === null) {
    console.log('     (backgroundEmbedding 없음)');
    return 0;
  }

  const outPath = path.join(outputDir, buildHtmlPath('module'));
  writeText(outPath, html);
  console.log(
    `     ✅ ${path.relative('.', outPath)} → ${path.relative('.', path.join(outputDir, 'html'))}`,
  );
  return 1;
}
