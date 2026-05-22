/**
 * 모듈 root marker identity artifact 추출 phase.
 * @file packages/core/src/cli/extract/module/phases/identity.ts
 */

import path from 'node:path';
import { writeJson } from '@/node';
import { RISUMODULE_FILENAME, buildExtractRisumoduleManifest } from '../../../shared/risumodule';

export function phase8_extractModuleIdentity(
  module: any,
  outputDir: string,
  sourceFormat: 'risum' | 'json' = 'json',
): number {
  console.log('\n  🧾 Phase 8: Module Identity 추출');

  const manifest = buildExtractRisumoduleManifest(module ?? {}, sourceFormat);
  const markerPath = path.join(outputDir, RISUMODULE_FILENAME);
  writeJson(markerPath, manifest);
  console.log(`     ✅ ${RISUMODULE_FILENAME} → ${path.relative('.', markerPath)}`);
  return 1;
}

export const phase7_extractModuleIdentity = phase8_extractModuleIdentity;
