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

    // Create canonical charx workspace
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"alice"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
battle
@@@ CONTENT
{{setvar::mode::story}}
`,
      'utf-8',
    );

    // Create canonical module workspace
    fs.mkdirSync(path.join(moduleDir, 'regex'), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"combat"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(moduleDir, 'regex', 'init.risuregex'),
      `---
comment: init
type: editdisplay
---
@@@ IN
*battle*
@@@ OUT
{{setvar::mode::battle}}
`,
      'utf-8',
    );

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

  it('reads module variables from canonical .risuvar files in compose analysis', () => {
    const charxDir = path.join(tempDir, 'character_alice');
    const moduleDir = path.join(tempDir, 'module_combat');

    // Create canonical charx workspace
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"alice"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
battle
@@@ CONTENT
{{getvar::mode}}
`,
      'utf-8',
    );

    // Create canonical module workspace with .risuvar variables
    fs.mkdirSync(path.join(moduleDir, 'regex'), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, 'variables'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"combat"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(moduleDir, 'regex', 'init.risuregex'),
      `---
comment: init
type: editdisplay
---
@@@ IN
*battle*
@@@ OUT
{{setvar::mode::combat}}
`,
      'utf-8',
    );
    // Write variables in canonical .risuvar format (NOT default.json)
    fs.writeFileSync(
      path.join(moduleDir, 'variables', 'combat.risuvar'),
      `mode=combat
hp=100
`,
      'utf-8',
    );

    const code = runAnalyzeComposeWorkflow([charxDir, '--module', moduleDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);

    // Verify that the analysis completed and detected module variables
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    // Should detect namespace-missing warning because module writes to 'mode' without namespace
    expect(markdown).toContain('namespace-missing');
    expect(markdown).toContain('combat');
  });

  it('falls back to legacy default.json for module variables when .risuvar is absent', () => {
    const charxDir = path.join(tempDir, 'character_alice');
    const moduleDir = path.join(tempDir, 'module_combat');

    // Create canonical charx workspace
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"alice"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
battle
@@@ CONTENT
{{getvar::mode}}
`,
      'utf-8',
    );

    // Create module workspace with LEGACY default.json (not .risuvar)
    fs.mkdirSync(path.join(moduleDir, 'regex'), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(moduleDir, 'variables'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"combat"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(moduleDir, 'regex', 'init.risuregex'),
      `---
comment: init
type: editdisplay
---
@@@ IN
*battle*
@@@ OUT
{{setvar::mode::combat}}
`,
      'utf-8',
    );
    // Write variables in LEGACY default.json format
    fs.writeFileSync(
      path.join(moduleDir, 'variables', 'default.json'),
      '{"mode":"combat","hp":"100"}\n',
      'utf-8',
    );

    const code = runAnalyzeComposeWorkflow([charxDir, '--module', moduleDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);

    // Verify that the analysis completed successfully with legacy fallback
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    // Should detect namespace-missing warning because module writes to 'mode' without namespace
    expect(markdown).toContain('namespace-missing');
    expect(markdown).toContain('combat');
  });

  it('reads charx variables from canonical .risuvar file with sanitized name (not default.risuvar)', () => {
    const charxDir = path.join(tempDir, 'character_Hero');
    const moduleDir = path.join(tempDir, 'module_rpg');

    // Create canonical charx workspace with character name "Hero"
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'variables'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"Hero"}\n', 'utf-8');

    // Create canonical .risuvar file with SANITIZED name (Hero.risuvar, NOT default.risuvar)
    fs.writeFileSync(
      path.join(charxDir, 'variables', 'Hero.risuvar'),
      `hero_name=Hero
hero_level=42
`,
      'utf-8',
    );

    // Create lorebook that reads the variable
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'greeting.risulorebook'),
      `---
name: greeting
comment: Greeting entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
hello
@@@ CONTENT
{{getvar::hero_name}} is level {{getvar::hero_level}}
`,
      'utf-8',
    );

    // Create canonical module workspace
    fs.mkdirSync(path.join(moduleDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"rpg","namespace":"rpg"}\n', 'utf-8');

    const code = runAnalyzeComposeWorkflow([charxDir, '--module', moduleDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);

    // Verify that the analysis read variables from Hero.risuvar (not default.risuvar)
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    // Should show charx with variables tracked
    expect(markdown).toContain('Hero');
    // Variables should be tracked from the sanitized-name .risuvar file
    expect(markdown).toContain('Variables tracked');
  });

  it('analyzes canonical charx compose without charx.json using .risulorebook files', () => {
    const charxDir = path.join(tempDir, 'character_bob');
    const moduleDir = path.join(tempDir, 'module_rpg');

    // Create canonical charx workspace WITHOUT charx.json
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"bob"}\n', 'utf-8');
    // Create canonical .risulorebook file
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'magic.risulorebook'),
      `---
name: magic
comment: Magic entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
magic
spell
@@@ CONTENT
{{setvar::magic_type::arcane}}
`,
      'utf-8',
    );
    // Create canonical .risuregex file
    fs.mkdirSync(path.join(charxDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(charxDir, 'regex', 'magic_trigger.risuregex'),
      `---
comment: Magic trigger
type: editdisplay
---
@@@ IN
*magic*
@@@ OUT
{{setvar::magic_type::fire}}
`,
      'utf-8',
    );

    // Create canonical module workspace
    fs.mkdirSync(path.join(moduleDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'metadata.json'), '{"name":"rpg","namespace":"rpg"}\n', 'utf-8');
    // Create module .risulorebook with overlapping keyword
    fs.writeFileSync(
      path.join(moduleDir, 'lorebooks', 'spells.risulorebook'),
      `---
name: spells
comment: Spell entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
spell
magic
@@@ CONTENT
{{getvar::magic_type}}
`,
      'utf-8',
    );

    const code = runAnalyzeComposeWorkflow([charxDir, '--module', moduleDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);

    // Verify that the analysis completed successfully using canonical files
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    // Should show both artifacts (charx and module)
    expect(markdown).toContain('bob');
    expect(markdown).toContain('rpg');
    // Variables should be tracked from canonical files
    expect(markdown).toContain('Variables tracked');
  });

  it('reads regex patterns from canonical .risuregex files in charx compose without charx.json', () => {
    const charxDir = path.join(tempDir, 'character_eve');

    // Create canonical charx workspace WITHOUT charx.json
    fs.mkdirSync(path.join(charxDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'regex'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"eve"}\n', 'utf-8');

    // Create canonical .risulorebook file
    fs.writeFileSync(
      path.join(charxDir, 'lorebooks', 'greeting.risulorebook'),
      `---
name: greeting
comment: Greeting entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
hello
@@@ CONTENT
{{getvar::greeting_style}}
`,
      'utf-8',
    );

    // Create multiple canonical .risuregex files
    fs.writeFileSync(
      path.join(charxDir, 'regex', 'style_setter.risuregex'),
      `---
comment: Style setter
type: editdisplay
---
@@@ IN
*formal*
@@@ OUT
{{setvar::greeting_style::formal}}
`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(charxDir, 'regex', 'style_reset.risuregex'),
      `---
comment: Style reset
type: editdisplay
---
@@@ IN
*casual*
@@@ OUT
{{setvar::greeting_style::casual}}
`,
      'utf-8',
    );

    const code = runAnalyzeComposeWorkflow([charxDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);

    // Verify that the analysis completed and detected regex patterns
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    // Should show charx with regex patterns
    expect(markdown).toContain('eve');
    expect(markdown).toContain('charx');
  });

  it('uses fresh canonical .risulua analysis in compose without sidecar json', () => {
    const charxDir = path.join(tempDir, 'character_lua');

    fs.mkdirSync(path.join(charxDir, 'character'), { recursive: true });
    fs.mkdirSync(path.join(charxDir, 'lua'), { recursive: true });
    fs.writeFileSync(path.join(charxDir, 'character', 'metadata.json'), '{"name":"luahero"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(charxDir, 'lua', 'luahero.risulua'),
      `
function runtime()
  setChatVar('mana', '10')
  return getChatVar('mode')
end
`,
      'utf-8',
    );

    const code = runAnalyzeComposeWorkflow([charxDir, '--locale', 'en']);

    expect(code).toBe(0);
    const markdown = fs.readFileSync(path.join(charxDir, 'analysis', 'compose-analysis.md'), 'utf-8');
    expect(markdown).toContain('Composition Analysis Report');
    expect(markdown).toContain('luahero');
    expect(markdown).toContain('Variables tracked: 2');
  });
});
