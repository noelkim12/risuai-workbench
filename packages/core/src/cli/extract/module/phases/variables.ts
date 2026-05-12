/**
 * 모듈 defaultVariables artifact 추출 phase.
 * @file packages/core/src/cli/extract/module/phases/variables.ts
 */

import path from 'node:path';
import {
  buildVariablePath,
  extractVariablesFromModule,
  serializeVariableContent,
} from '@/domain/custom-extension/extensions/variable';
import { writeText } from '@/node';
import { resolveModuleTargetName } from './module-name';

export function phase7_extractVariables(module: any, outputDir: string): number {
  console.log('\n  🧮 Phase 7: Module Variables 추출');

  const variables = extractVariablesFromModule(module ?? {}, 'module');
  if (variables === null) {
    console.log('     (defaultVariables 없음)');
    return 0;
  }

  const outPath = path.join(
    outputDir,
    buildVariablePath('module', resolveModuleTargetName(module)),
  );
  writeText(outPath, serializeVariableContent(variables));
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${Object.keys(variables).length} vars`);
  return 1;
}
