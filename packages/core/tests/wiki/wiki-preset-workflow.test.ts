import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPresetWiki } from '@/cli/analyze/preset/wiki/workflow';
import { minimalPresetReport } from './fixtures/wiki-minimal-preset-report';

describe('runPresetWiki', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes preset wiki files into artifacts/<key>/_generated', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-wiki-'));
    const extractDir = path.join(tmpDir, 'preset_test');
    const wikiRoot = path.join(tmpDir, 'wiki');
    fs.mkdirSync(extractDir, { recursive: true });

    runPresetWiki(minimalPresetReport(), { extractDir, wikiRoot });

    const generatedDir = path.join(wikiRoot, 'artifacts', 'preset_preset_test', '_generated');
    expect(fs.existsSync(path.join(generatedDir, 'overview.md'))).toBe(true);
    expect(fs.existsSync(path.join(generatedDir, 'variables.md'))).toBe(true);
    expect(fs.existsSync(path.join(generatedDir, 'regex.md'))).toBe(true);
    expect(fs.existsSync(path.join(generatedDir, 'prompts.md'))).toBe(true);
    expect(fs.existsSync(path.join(generatedDir, 'prompt-chain.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiRoot, 'SCHEMA.md'))).toBe(true);
  });
});
