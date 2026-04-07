import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleCBS } from '../src/cli/analyze/module/collectors';
import { runAnalyzeModuleWorkflow } from '../src/cli/analyze/module/workflow';
import { runExtractWorkflow as runModuleExtractWorkflow } from '../src/cli/extract/module/workflow';

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
    expect(result.luaArtifacts).toHaveLength(0);
    expect(result.luaCBS[0]?.reads.has('hp')).toBe(true);
    expect(result.htmlCBS?.writes.has('theme')).toBe(true);
  });

  it('loads lua artifacts directly from lua files without requiring sidecar analysis json', () => {
    fs.rmSync(path.join(tempDir, 'lua', 'boot.analysis.json'));
    fs.writeFileSync(
      path.join(tempDir, 'lua', 'runtime.lua'),
      `
function runtime()
  setChatVar('mana', '10')
  return getChatVar('mode')
end
`,
      'utf-8',
    );

    const result = collectModuleCBS(tempDir);

    expect(result.luaArtifacts).toHaveLength(1);
    expect(result.luaArtifacts[0]?.baseName).toBe('runtime');
    expect(result.luaArtifacts[0]?.elementCbs[0]?.reads.has('mode')).toBe(true);
    expect(result.luaArtifacts[0]?.elementCbs[0]?.writes.has('mana')).toBe(true);
    expect(result.luaCBS).toHaveLength(1);
    expect(result.luaCBS[0]?.reads.has('mode')).toBe(true);
    expect(result.luaCBS[0]?.writes.has('mana')).toBe(true);
    expect(result.luaCBS[0]?.reads.has('hp')).toBe(false);

    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.md'))).toBe(true);
  });

  it('writes module analysis markdown report', () => {
    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.md'))).toBe(true);
    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.md'), 'utf-8');
    expect(markdown).not.toContain('## Token Budget');
    expect(markdown).toContain('## Variable Flow');
    expect(markdown).toContain('## Dead Code Findings');
  });

  it('writes module analysis html report', () => {
    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.data.js'))).toBe(true);
    const html = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.html'), 'utf-8');
    expect(html).toContain('Variable Flow Summary');
    expect(html).toContain('Dead Code');
    expect(html).not.toContain('Token Budget');
    expect(html).not.toContain('Token Consumption');
    expect(html).not.toContain('Worst-case tokens');
    expect(html).not.toContain('최악 토큰 수');
    expect(html).toContain('<script src="./module-analysis.data.js"></script>');
  });

  it('writes module analysis markdown without worst-case token row', () => {
    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);
    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.md'), 'utf-8');
    expect(markdown).not.toContain('## Token Budget');
    expect(markdown).not.toContain('Worst-case tokens');
    expect(markdown).not.toContain('최악 토큰');
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
    const collected = collectModuleCBS(outDir);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.data.js'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'boot.lua'))).toBe(true);
    expect(collected.luaArtifacts).toHaveLength(1);
    expect(collected.luaArtifacts[0]?.baseName).toBe('boot');
    expect(collected.luaCBS).toHaveLength(1);
    expect(collected.luaCBS[0]?.elementName).toBe('boot');

    const html = fs.readFileSync(path.join(outDir, 'analysis', 'module-analysis.html'), 'utf-8');
    expect(html).toContain('Lua 개요');
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
