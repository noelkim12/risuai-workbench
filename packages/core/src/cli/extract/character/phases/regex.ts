/**
 * 캐릭터 regex artifact 추출 phase.
 * @file packages/core/src/cli/extract/character/phases/regex.ts
 */

import path from 'node:path';
import { sanitizeFilename } from '@/domain';
import { ensureDir, writeJson, writeText, uniquePath } from '@/node';
import { extractRegexFromCharx, serializeRegexContent } from '@/domain/regex';

export function phase3_extractRegex(charx: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex 추출 (canonical)');

  const regexDir = path.join(outputDir, 'regex');
  ensureDir(regexDir);

  // Extract canonical regex from charx using verified adapter
  const regexes = extractRegexFromCharx(charx, 'charx');
  if (!regexes || regexes.length === 0) {
    console.log('     (customscript 없음)');
    return 0;
  }

  console.log(`     customScripts: ${regexes.length}개`);

  const orderList: string[] = [];
  let count = 0;

  for (let i = 0; i < regexes.length; i += 1) {
    const content = regexes[i];
    const stem = sanitizeFilename(content.comment || `regex_${i}`, `regex_${i}`);
    const fileName = uniquePath(regexDir, stem, '.risuregex');
    const relativePath = path.basename(fileName);

    writeText(fileName, serializeRegexContent(content));
    orderList.push(relativePath);
    count += 1;
  }

  // Write _order.json
  if (orderList.length > 0) {
    writeJson(path.join(regexDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}
