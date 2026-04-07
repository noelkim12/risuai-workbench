import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeComposition } from '@/domain/analyze/composition';
import { runAnalyzeComposeWorkflow } from '@/cli/analyze/compose/workflow';

describe('analyzeComposition', () => {
  it('detects variable name collision between card and module', () => {
    const result = analyzeComposition({
      charx: {
        name: 'alice',
        type: 'charx',
        elements: [
          { elementType: 'lorebook', elementName: 'card/entry_1', reads: new Set(), writes: new Set(['mode']) },
        ],
        defaultVariables: { mode: 'story' },
      },
      modules: [
        {
          name: 'combat',
          type: 'module',
          elements: [
            { elementType: 'regex', elementName: 'module/init', reads: new Set(), writes: new Set(['mode']) },
          ],
          defaultVariables: { mode: 'battle' },
        },
      ],
    });

    expect(result.conflicts.some((conflict) => conflict.type === 'variable-name-collision')).toBe(
      true,
    );
  });

  it('detects lorebook keyword collision across artifacts', () => {
    const result = analyzeComposition({
      charx: {
        name: 'alice',
        type: 'charx',
        elements: [],
        defaultVariables: {},
        lorebookKeywords: { battle: ['card/entry_1'] },
      },
      modules: [
        {
          name: 'combat',
          type: 'module',
          elements: [],
          defaultVariables: {},
          lorebookKeywords: { battle: ['module/entry_1'] },
        },
      ],
    });

    expect(result.conflicts.some((conflict) => conflict.type === 'lorebook-keyword-collision')).toBe(
      true,
    );
  });

  it('warns when module uses global variables without namespace', () => {
    const result = analyzeComposition({
      charx: {
        name: 'alice',
        type: 'charx',
        elements: [],
        defaultVariables: {},
      },
      modules: [
        {
          name: 'combat',
          type: 'module',
          namespace: undefined,
          elements: [
            { elementType: 'regex', elementName: 'init', reads: new Set(), writes: new Set(['flag']) },
          ],
          defaultVariables: {},
        },
      ],
    });

    expect(result.conflicts.some((conflict) => conflict.type === 'namespace-missing')).toBe(true);
  });

  it('detects regex pattern conflicts', () => {
    const result = analyzeComposition({
      charx: {
        name: 'alice',
        type: 'charx',
        elements: [],
        defaultVariables: {},
        regexPatterns: [{ name: 'card_regex', in: '\\*action\\*', order: 100 }],
      },
      modules: [
        {
          name: 'combat',
          type: 'module',
          elements: [],
          defaultVariables: {},
          regexPatterns: [{ name: 'module_regex', in: '\\*action\\*', order: 100 }],
        },
      ],
    });

    expect(result.conflicts.some((conflict) => conflict.type === 'regex-order-conflict')).toBe(
      true,
    );
  });

  it('calculates compatibility score', () => {
    const result = analyzeComposition({
      modules: [
        {
          name: 'safe',
          type: 'module',
          elements: [],
          defaultVariables: {},
          namespace: 'safe',
        },
      ],
    });

    expect(result.summary.compatibilityScore).toBe(100);
  });

  it('reduces compatibility score based on conflicts', () => {
    const result = analyzeComposition({
      charx: {
        name: 'alice',
        type: 'charx',
        elements: [
          { elementType: 'lorebook', elementName: 'card/entry_1', reads: new Set(), writes: new Set(['mode']) },
        ],
        defaultVariables: { mode: 'story' },
      },
      modules: [
        {
          name: 'combat',
          type: 'module',
          elements: [
            { elementType: 'regex', elementName: 'module/init', reads: new Set(), writes: new Set(['mode']) },
          ],
          defaultVariables: { mode: 'battle' },
        },
      ],
    });

    expect(result.summary.compatibilityScore).toBeLessThan(100);
  });
});

describe('compose workflow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-analyze-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes compose analysis markdown and html reports', () => {
    const charxDir = path.join(tempDir, 'character_alice');
    const moduleDir = path.join(tempDir, 'module_combat');
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'variables'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'charx.json'), '{"data":{"name":"alice","character_book":{"entries":[]},"extensions":{"risuai":{"customScripts":[]}}}}\n', 'utf-8');
    fs.writeFileSync(path.join(charxDir, 'variables', 'default.json'), '{"mode":"story"}\n', 'utf-8');
    fs.writeFileSync(path.join(charxDir, 'lorebooks', 'entry.json'), '{"name":"entry","keys":["battle"],"content":"{{setvar::mode::story}}"}\n', 'utf-8');

    fs.mkdirSync(path.join(moduleDir, 'regex'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'module.json'), '{"name":"combat"}\n', 'utf-8');
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"combat"}\n', 'utf-8');
    fs.writeFileSync(path.join(moduleDir, 'regex', 'init.json'), '{"in":"*battle*","out":"{{setvar::mode::battle}}"}\n', 'utf-8');

    const code = runAnalyzeComposeWorkflow([charxDir, '--module', moduleDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.data.js'))).toBe(true);
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    const html = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.html'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    expect(markdown).toContain('Compatibility Score');
    expect(html).toContain('Composition Analysis');
    expect(html).toContain('Compatibility Score');
    expect(html).toContain('Conflict Type Distribution');
    expect(html).toContain('Conflict Pairs');
    expect(html).toContain('<script src="./compose-analysis.data.js"></script>');
  });
});
