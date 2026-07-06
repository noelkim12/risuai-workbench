/**
 * 모듈 customModuleToggle artifact 추출 phase.
 * @file packages/core/src/cli/extract/module/phases/toggle.ts
 */

import path from 'node:path';
import { buildTogglePath, extractToggleFromModule } from '@/domain/custom-extension/extensions/toggle';
import { writeText } from '@/node';
import { resolveModuleTargetName } from './module-name';

export function phase9_extractModuleToggle(module: any, outputDir: string): number {
  console.log('\n  🧩 Phase 9: Module Toggle 추출');

  const toggle = extractToggleFromModule(module ?? {}, 'module');
  const scaffoldToggle = toggle ?? '';

  const outPath = path.join(outputDir, buildTogglePath('module', resolveModuleTargetName(module)));
  writeText(outPath, scaffoldToggle);
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${scaffoldToggle.length} chars`);
  return 1;
}

export const phase8_extractModuleToggle = phase9_extractModuleToggle;
