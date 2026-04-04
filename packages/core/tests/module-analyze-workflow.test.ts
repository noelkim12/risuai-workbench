import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleCBS } from '@/cli/analyze/module/collectors';
import { runAnalyzeModuleWorkflow } from '@/cli/analyze/module/workflow';
import { runExtractWorkflow as runModuleExtractWorkflow } from '@/cli/extract/module/workflow';

describe('module analyze collectors and workflow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-analyze-'));

    fs.mkdirSync(path.join(tempDir, 'lorebooks', 'battle'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          entries: [
            {
              type: 'entry',
              path: 'battle/battle_entry.json',
              source: 'module',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'battle', 'battle_entry.json'),
      `${JSON.stringify(
        {
          comment: 'battle_entry',
          content: '{{getvar::mode}} combat start',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'regex', '_order.json'),
      `${JSON.stringify(['init_script.json'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'init_script.json'),
      `${JSON.stringify(
        {
          comment: 'init_script',
          in: '*init*',
          out: '{{setvar::mode::story}}',
          type: 'editdisplay',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'lua'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'lua', 'boot.analysis.json'),
      `${JSON.stringify(
        {
          stateVars: {
            mode: {
              readBy: ['boot'],
              writtenBy: ['boot'],
            },
            hp: {
              readBy: ['boot'],
              writtenBy: [],
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'html'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'html', 'background.html'),
      '<section>{{getvar::mode}} {{setvar::theme::dark}}</section>',
      'utf-8',
    );

    fs.writeFileSync(
      path.join(tempDir, 'module.json'),
      `${JSON.stringify({ name: 'test_module', description: 'test module' }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'metadata.json'),
      `${JSON.stringify({ name: 'test_module', id: 'module-id' }, null, 2)}\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('collects lorebook CBS data from extracted module directory', () => {
    const result = collectModuleCBS(tempDir);
    expect(result.lorebookCBS.length).toBeGreaterThan(0);
    expect(result.lorebookCBS[0]?.reads.has('mode')).toBe(true);
  });

  it('collects regex CBS data from extracted module directory', () => {
    const result = collectModuleCBS(tempDir);
    expect(result.regexCBS.length).toBeGreaterThan(0);
    expect(result.regexCBS[0]?.writes.has('mode')).toBe(true);
  });

  it('imports lua analysis and background html data from extracted module directory', () => {
    const result = collectModuleCBS(tempDir);
    expect(result.luaCBS[0]?.reads.has('hp')).toBe(true);
    expect(result.htmlCBS?.writes.has('theme')).toBe(true);
  });

  it('writes module analysis markdown report', () => {
    const code = runAnalyzeModuleWorkflow([tempDir]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.md'))).toBe(true);
  });

  it('writes module analysis html report', () => {
    const code = runAnalyzeModuleWorkflow([tempDir]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.html'))).toBe(true);
  });

  it('runs module-wide analysis automatically after extract', () => {
    const sourcePath = path.join(tempDir, 'module-source.json');
    const outDir = path.join(tempDir, 'extracted-module');

    fs.writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          type: 'risuModule',
          module: {
            name: 'auto_module',
            id: 'auto-module',
            lorebook: [{ comment: 'entry', content: '{{getvar::mode}}' }],
            regex: [{ comment: 'script', in: '*', out: '{{setvar::mode::story}}' }],
            trigger: [
              {
                comment: 'boot',
                type: 'start',
                effect: [{ type: 'triggerlua', code: 'local value = getState(chat, "mode")' }],
              },
            ],
            backgroundEmbedding: '<div>{{setvar::theme::night}}</div>',
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const code = runModuleExtractWorkflow([sourcePath, '--out', outDir]);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'boot.analysis.json'))).toBe(true);
  });

  it('skips module-wide analysis on --json-only extract', () => {
    const sourcePath = path.join(tempDir, 'module-json-only.json');
    const outDir = path.join(tempDir, 'json-only-module');

    fs.writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          type: 'risuModule',
          module: {
            name: 'json_only_module',
            id: 'json-only-module',
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const code = runModuleExtractWorkflow([sourcePath, '--out', outDir, '--json-only']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'module.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis'))).toBe(false);
  });
});
