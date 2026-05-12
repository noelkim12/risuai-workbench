/**
 * 모듈 regex/customscript artifact 추출 phase.
 * @file packages/core/src/cli/extract/module/phases/regex.ts
 */

import path from 'node:path';
import { buildRegexPath, extractRegexFromModule, serializeRegexContent } from '@/domain/regex';
import { ensureDir, writeText, uniquePath } from '@/node';

export function phase3_extractRegex(module: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex(customscript) 추출');

  const regexDir = path.join(outputDir, 'regex');
  const scripts = extractRegexFromModule(module ?? {}, 'module');
  if (!scripts || scripts.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  ensureDir(regexDir);
  console.log(`     module.regex: ${scripts.length}개`);
  let count = 0;
  const orderList: string[] = [];
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const suggestedPath = buildRegexPath('module', script.comment || `regex_${i}`);
    const outPath = uniquePath(regexDir, path.basename(suggestedPath, '.risuregex'), '.risuregex');
    writeText(outPath, serializeRegexContent(script));
    orderList.push(path.basename(outPath));
    count += 1;
  }

  if (orderList.length > 0) {
    writeText(path.join(regexDir, '_order.json'), `${JSON.stringify(orderList, null, 2)}\n`);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}
