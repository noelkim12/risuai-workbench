import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { LorebookExtractionPlan } from '../src/domain/lorebook/folders';
import { executeLorebookPlan } from '../src/node/lorebook-io';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('executeLorebookPlan order generation', () => {
  it('lists every parent directory before a nested lorebook file', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'risu-lorebook-order-'));
    tempDirs.push(outputDir);
    const plan: LorebookExtractionPlan = {
      items: [
        {
          type: 'entry',
          source: 'character',
          relPath: '00_system/opponents/fixed.risulorebook',
          data: {},
        },
      ],
    };

    const result = executeLorebookPlan(plan, outputDir);

    expect(result.orderList).toEqual([
      '00_system',
      '00_system/opponents',
      '00_system/opponents/fixed.risulorebook',
    ]);
  });
});
