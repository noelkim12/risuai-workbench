import path from 'node:path';
import { ensureDir, writeJson } from './fs-helpers';
import type { LorebookExtractionPlan } from '../domain/lorebook/folders';

export function executeLorebookPlan(
  plan: LorebookExtractionPlan,
  lorebooksDir: string,
): { count: number; orderList: string[]; manifestEntries: any[] } {
  let count = 0;
  const orderList: string[] = [];
  const manifestEntries: any[] = [];

  for (const item of plan.items) {
    if (item.type === 'folder') {
      ensureDir(path.join(lorebooksDir, item.relDir));
      manifestEntries.push({
        type: 'folder',
        source: item.source,
        dir: item.relDir,
        data: item.data,
      });
      count += 1;
    } else {
      const outPath = path.join(lorebooksDir, item.relPath);
      ensureDir(path.dirname(outPath));
      writeJson(outPath, item.data);
      orderList.push(item.relPath);
      manifestEntries.push({ type: 'entry', source: item.source, path: item.relPath });
      count += 1;
    }
  }

  return { count, orderList, manifestEntries };
}
