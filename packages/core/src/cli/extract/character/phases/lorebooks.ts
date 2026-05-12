/**
 * 캐릭터 lorebook artifact 추출 phase와 변환 헬퍼.
 * @file packages/core/src/cli/extract/character/phases/lorebooks.ts
 */

import path from 'node:path';
import { createLorebookDirAllocator, planLorebookExtraction } from '@/domain';
import { ensureDir, writeJson, writeText, executeLorebookPlan } from '@/node';
import {
  extractLorebooksFromCharx,
  serializeLorebookContent,
  type LorebookContent,
} from '@/domain/custom-extension/extensions/lorebook';

export function phase2_extractLorebooks(charx: any, outputDir: string): number {
  console.log('\n  📚 Phase 2: Lorebook 추출 (canonical)');

  const lorebooksDir = path.join(outputDir, 'lorebooks');
  ensureDir(lorebooksDir);

  // Extract canonical lorebooks from charx using verified adapter
  const lorebooks = extractLorebooksFromCharx(charx, 'charx');
  if (!lorebooks || lorebooks.length === 0) {
    console.log('     (lorebook 없음)');
    return 0;
  }

  console.log(`     lorebook entries: ${lorebooks.length}개`);

  // Use the planner/executor pattern for path-based lorebook extraction
  const allocateDir = createLorebookDirAllocator();
  const plan = planLorebookExtraction(lorebooks, 'character', allocateDir);

  // Convert plan to use .risulorebook extension instead of .json
  const convertedPlan = {
    items: plan.items.map((item) => {
      if (item.type === 'entry') {
        return {
          ...item,
          relPath: item.relPath.replace(/\.json$/, '.risulorebook'),
        };
      }
      return item;
    }),
  };

  const { count, orderList } = executeLorebookPlan(convertedPlan, lorebooksDir);

  // Write .risulorebook files with canonical format (not JSON)
  for (const item of convertedPlan.items) {
    if (item.type === 'entry') {
      const outPath = path.join(lorebooksDir, item.relPath);
      // Convert the raw entry data to canonical .risulorebook format
      const canonicalContent = entryToCanonicalContent(item.data);
      writeText(outPath, serializeLorebookContent(canonicalContent));
    }
  }

  // Write _order.json with folder paths + file paths (path-based contract)
  if (orderList.length > 0) {
    // Build order list with folder paths included
    const fullOrderList: string[] = [];
    const emittedFolders = new Set<string>();

    for (const item of convertedPlan.items) {
      if (item.type === 'folder') {
        if (!emittedFolders.has(item.relDir)) {
          fullOrderList.push(item.relDir);
          emittedFolders.add(item.relDir);
        }
      } else {
        // Check if this entry is inside a folder
        const parentDir = item.relPath.includes('/') ? item.relPath.split('/')[0] : null;
        if (parentDir && !emittedFolders.has(parentDir)) {
          fullOrderList.push(parentDir);
          emittedFolders.add(parentDir);
        }
        fullOrderList.push(item.relPath);
      }
    }

    writeJson(path.join(lorebooksDir, '_order.json'), fullOrderList);
  }

  console.log(`     ✅ ${count}개 lorebook → ${path.relative('.', lorebooksDir)}/`);

  return count;
}

/** Convert raw lorebook entry data to canonical LorebookContent format */
function entryToCanonicalContent(
  entry: any,
): LorebookContent {
  // Handle both character_book and module lorebook schemas
  const keys = Array.isArray(entry.keys)
    ? entry.keys
    : typeof entry.key === 'string'
      ? entry.key
          .split(',')
          .map((k: string) => k.trim())
          .filter(Boolean)
      : [];

  const secondaryKeys = Array.isArray(entry.secondary_keys)
    ? entry.secondary_keys
    : typeof entry.secondkey === 'string' && entry.secondkey.trim()
      ? entry.secondkey
          .split(',')
          .map((k: string) => k.trim())
          .filter(Boolean)
      : undefined;

  const content: LorebookContent = {
    name: entry.name || entry.comment || '',
    comment: entry.comment || entry.name || '',
    mode: entry.mode || 'normal',
    constant: entry.constant ?? entry.alwaysActive ?? false,
    selective: entry.selective ?? false,
    insertion_order: entry.insertion_order ?? entry.insertorder ?? 0,
    case_sensitive: entry.case_sensitive ?? entry.extensions?.risu_case_sensitive ?? false,
    use_regex: entry.use_regex ?? entry.useRegex ?? false,
    keys,
    content: entry.content || '',
  };

  if (secondaryKeys && secondaryKeys.length > 0) {
    content.secondary_keys = secondaryKeys;
  }

  if (entry.extensions && Object.keys(entry.extensions).length > 0) {
    content.extensions = entry.extensions;
  }

  if (entry.book_version ?? entry.bookVersion) {
    content.book_version = entry.book_version ?? entry.bookVersion;
  }

  if (entry.activation_percent ?? entry.activationPercent) {
    content.activation_percent = entry.activation_percent ?? entry.activationPercent;
  }

  if (entry.id) {
    content.id = entry.id;
  }

  return content;
}
