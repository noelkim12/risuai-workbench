import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectModuleCBS } from '../src/cli/analyze/module/collectors';
import { runAnalyzeModuleWorkflow } from '../src/cli/analyze/module/workflow';
import { runExtractWorkflow as runModuleExtractWorkflow } from '../src/cli/extract/module/workflow';

function makeRisumodule(opts: { name: string; id?: string; namespace?: string }): string {
  return JSON.stringify(
    {
      $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
      kind: 'risu.module',
      schemaVersion: 1,
      id: opts.id || opts.name,
      name: opts.name,
      description: '',
      createdAt: null,
      modifiedAt: null,
      sourceFormat: 'json',
      ...(opts.namespace ? { namespace: opts.namespace } : {}),
    },
    null,
    2,
  );
}

describe('module analyze collectors and workflow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-analyze-'));

    // Create canonical workspace with .risulorebook files
    fs.mkdirSync(path.join(tempDir, 'lorebooks', 'battle'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'battle', 'battle_entry.risulorebook'),
      `---
name: battle_entry
comment: battle_entry
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
{{getvar::mode}} combat start
`,
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'regex', '_order.json'),
      `${JSON.stringify(['init_script.risuregex'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'init_script.risuregex'),
      `---
comment: init_script
type: editdisplay
---
@@@ IN
*init*
@@@ OUT
{{setvar::mode::story}}
`,
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
      path.join(tempDir, 'html', 'background.risuhtml'),
      '<section>{{getvar::mode}} {{setvar::theme::dark}}</section>',
      'utf-8',
    );

    // Canonical workspace uses .risumodule (no module.json)
    fs.writeFileSync(
      path.join(tempDir, '.risumodule'),
      `${makeRisumodule({ name: 'test_module', id: 'module-id' })}\n`,
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

  it('loads lua artifacts directly from canonical .risulua files without requiring sidecar analysis json', () => {
    fs.rmSync(path.join(tempDir, 'lua', 'boot.analysis.json'));
    fs.writeFileSync(
      path.join(tempDir, 'lua', 'runtime.risulua'),
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

  it('loads triggerId-based setChatVar/getChatVar access from canonical .risulua files', () => {
    fs.rmSync(path.join(tempDir, 'lua', 'boot.analysis.json'));
    fs.writeFileSync(
      path.join(tempDir, 'lua', 'runtime.risulua'),
      `
function runtime(triggerId)
  setChatVar(triggerId, 'mana', '10')
  return getChatVar(triggerId, 'mode')
end
`,
      'utf-8',
    );

    const result = collectModuleCBS(tempDir);

    expect(result.luaArtifacts).toHaveLength(1);
    expect(result.luaArtifacts[0]?.elementCbs[0]?.reads.has('mode')).toBe(true);
    expect(result.luaArtifacts[0]?.elementCbs[0]?.writes.has('mana')).toBe(true);
    expect(result.luaCBS[0]?.reads.has('mode')).toBe(true);
    expect(result.luaCBS[0]?.writes.has('mana')).toBe(true);
  });

  it('emits relationship-network bridge edges into module analysis data for lorebook↔lua and lua↔regex flows', () => {
    fs.rmSync(path.join(tempDir, 'lua', 'boot.analysis.json'));
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'battle', 'battle_entry.risulorebook'),
      `---
name: battle_entry
comment: battle_entry
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
{{setvar::mode::combat}}
`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'init_script.risuregex'),
      `---
comment: init_script
type: editdisplay
---
@@@ IN
*init*
@@@ OUT
{{getvar::mana}}
`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'lua', 'runtime.risulua'),
      `
function runtime()
  local currentMode = getChatVar('mode')
  if currentMode then
    setChatVar('mana', '10')
  end
  return currentMode
end
`,
      'utf-8',
    );

    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);

    const dataJs = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.data.js'), 'utf-8');
    expect(dataJs).toContain('lb-lua-bridge');
    expect(dataJs).toContain('lua-regex-bridge');
    expect(dataJs).toContain('mode');
    expect(dataJs).toContain('mana');
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

  it('runs module-wide analysis automatically after extract', async () => {
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
            regex: [{ comment: 'script', in: '*', out: '{{setvar::mode::story}}', type: 'editdisplay' }],
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

    const code = await runModuleExtractWorkflow([sourcePath, '--out', outDir]);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'module.json'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'auto_module.risulua'))).toBe(true);

    // Verify CBS collection works on extracted canonical files
    const collected = collectModuleCBS(outDir);
    expect(collected.lorebookCBS.length).toBeGreaterThan(0);
    expect(collected.regexCBS.length).toBeGreaterThan(0);
    expect(collected.luaArtifacts).toHaveLength(1);
    expect(collected.luaCBS[0]?.reads.has('mode')).toBe(true);
  });



  it('includes regex CBS count and total regex file count in markdown and html reports', () => {
    // Add an inactive regex file in canonical format (no CBS operations)
    const inactiveRegex = path.join(tempDir, 'regex', 'inactive_script.risuregex');
    fs.writeFileSync(
      inactiveRegex,
      `---
comment: inactive script
type: disabled
---
@@@ IN
hello
@@@ OUT
hello
`,
      'utf-8',
    );

    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);

    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.md'), 'utf-8');
    expect(markdown).toContain('| Regex Scripts (active) | 1 |');
    expect(markdown).toContain('| Regex Script Files | 2 |');

    const html = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.html'), 'utf-8');
    expect(html).toContain('Variable Flow Summary');
    expect(html).toContain('regex: 1 active / 2 files');
  });

  it('detects dead-code write-only findings in markdown and html', () => {
    const unusedDir = path.join(tempDir, 'lorebooks', 'unused');
    fs.mkdirSync(unusedDir, { recursive: true });

    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(unusedDir, `unused_${i}.risulorebook`),
        `---
name: unused-${i}
comment: unused-${i}
mode: normal
constant: false
selective: false
insertion_order: ${i}
case_sensitive: false
use_regex: false
---
@@@ KEYS
unused_${i}
@@@ CONTENT
{{setvar::dead_${i}::value_${i}}}
`,
        'utf-8',
      );
    }

    const code = runAnalyzeModuleWorkflow([tempDir, '--locale', 'en']);
    expect(code).toBe(0);

    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.md'), 'utf-8');
    // Check that dead-code section exists and has findings
    expect(markdown).toContain('## Dead Code Findings');
    expect(markdown).toContain('write-only-variable');

    const html = fs.readFileSync(path.join(tempDir, 'analysis', 'module-analysis.html'), 'utf-8');
    expect(html).toContain('Dead Code');
    expect(html).toContain('write-only-variable');
  });


    it('skips module-wide analysis on --json-only extract', async () => {
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

    const code = await runModuleExtractWorkflow([sourcePath, '--out', outDir, '--json-only']);

    expect(code).toBe(0);
    // In canonical mode, module.json is NOT created (only .risumodule)
    expect(fs.existsSync(path.join(outDir, 'module.json'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(false);
    // Analysis runs because .risumodule is the canonical marker
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'module-analysis.html'))).toBe(true);
  });

  it('preserves lorebook-derived analysis sections without module.json using canonical files', () => {
    // Create a canonical module workspace WITHOUT module.json
    const canonicalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-no-json-'));

    // Create canonical .risulorebook files
    fs.mkdirSync(path.join(canonicalDir, 'lorebooks', 'combat'), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, 'lorebooks', 'combat', 'attack.risulorebook'),
      `---
name: attack
comment: Attack lorebook
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
attack
fight
@@@ CONTENT
{{setvar::combat_mode::active}}
`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'lorebooks', 'defense.risulorebook'),
      `---
name: defense
comment: Defense lorebook
mode: normal
constant: false
selective: false
insertion_order: 1
case_sensitive: false
use_regex: false
---
@@@ KEYS
defend
block
@@@ CONTENT
{{getvar::combat_mode}}
`,
      'utf-8',
    );

    // Create canonical .risuregex files
    fs.mkdirSync(path.join(canonicalDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, 'regex', 'combat_init.risuregex'),
      `---
comment: Combat init
type: editdisplay
---
@@@ IN
*start*
@@@ OUT
{{setvar::combat_mode::started}}
`,
      'utf-8',
    );

    // Create .risumodule (canonical marker, NOT module.json)
    fs.writeFileSync(
      path.join(canonicalDir, '.risumodule'),
      `${makeRisumodule({ name: 'canonical_module', id: 'canonical-module', namespace: 'rpg' })}\n`,
      'utf-8',
    );

    // Run analysis - should work without module.json
    const code = runAnalyzeModuleWorkflow([canonicalDir, '--locale', 'en']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(canonicalDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(canonicalDir, 'analysis', 'module-analysis.html'))).toBe(true);

    // Verify lorebook-derived sections are present
    const markdown = fs.readFileSync(path.join(canonicalDir, 'analysis', 'module-analysis.md'), 'utf-8');
    expect(markdown).toContain('## Lorebook Structure');
    expect(markdown).toContain('## Lorebook Activation Chain');
    expect(markdown).toContain('attack');
    expect(markdown).toContain('defense');
    expect(markdown).toContain('combat_mode');

    // Cleanup
    fs.rmSync(canonicalDir, { recursive: true, force: true });
  });

  it('auto-detects as module (not preset) when workspace has .risumodule + lorebooks/ + regex/', () => {
    // Create a canonical module workspace that ALSO has regex/ (which is a preset marker)
    // Module should take precedence over preset due to stricter criteria
    const moduleWithRegexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-with-regex-'));

    // Create canonical .risulorebook files
    fs.mkdirSync(path.join(moduleWithRegexDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(moduleWithRegexDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: Entry with CBS
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
@@@ CONTENT
{{setvar::module_var::value}}
`,
      'utf-8',
    );

    // Create regex directory (this is also a preset marker, but module should win)
    fs.mkdirSync(path.join(moduleWithRegexDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(moduleWithRegexDir, 'regex', 'script.risuregex'),
      `---
comment: script
type: editdisplay
---
@@@ IN
*test*
@@@ OUT
{{getvar::module_var}}
`,
      'utf-8',
    );

    // Create .risumodule (canonical module marker)
    fs.writeFileSync(
      path.join(moduleWithRegexDir, '.risumodule'),
      `${makeRisumodule({ name: 'module_with_regex', id: 'module-with-regex', namespace: 'test' })}\n`,
      'utf-8',
    );

    // Run analysis via auto-detect (no --type specified)
    const code = runAnalyzeModuleWorkflow([moduleWithRegexDir, '--locale', 'en']);

    // Should succeed as module analysis
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(moduleWithRegexDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(moduleWithRegexDir, 'analysis', 'module-analysis.html'))).toBe(true);

    // Verify module-specific content is present
    const markdown = fs.readFileSync(path.join(moduleWithRegexDir, 'analysis', 'module-analysis.md'), 'utf-8');
    expect(markdown).toContain('## Lorebook Structure');
    expect(markdown).toContain('module_var');

    // Cleanup
    fs.rmSync(moduleWithRegexDir, { recursive: true, force: true });
  });

  it('rejects metadata.json + lorebooks/ without .risumodule as non-canonical module', () => {
    const metadataOnlyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-metadata-only-'));

    fs.mkdirSync(path.join(metadataOnlyDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(metadataOnlyDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: Entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
@@@ CONTENT
{{setvar::x::y}}
`,
      'utf-8',
    );

    // metadata.json alone is no longer a canonical module marker
    fs.writeFileSync(
      path.join(metadataOnlyDir, 'metadata.json'),
      `${JSON.stringify({ name: 'metadata_only_module', id: 'metadata-only' }, null, 2)}\n`,
      'utf-8',
    );

    const code = runAnalyzeModuleWorkflow([metadataOnlyDir, '--locale', 'en']);
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(metadataOnlyDir, 'analysis'))).toBe(false);

    fs.rmSync(metadataOnlyDir, { recursive: true, force: true });
  });

  it('analyzes module with .risumodule even when lorebooks/ is absent', () => {
    const minimalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-minimal-risumodule-'));

    fs.writeFileSync(
      path.join(minimalDir, '.risumodule'),
      `${makeRisumodule({ name: 'minimal_module', id: 'minimal-module' })}\n`,
      'utf-8',
    );

    const code = runAnalyzeModuleWorkflow([minimalDir, '--locale', 'en']);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(minimalDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(minimalDir, 'analysis', 'module-analysis.html'))).toBe(true);

    fs.rmSync(minimalDir, { recursive: true, force: true });
  });

  it('does not use metadata.json for collector metadata when .risumodule is absent', () => {
    const noMarkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-no-risumodule-'));

    fs.mkdirSync(path.join(noMarkerDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(noMarkerDir, 'lorebooks', 'entry.risulorebook'),
      `---
name: entry
comment: Entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
@@@ CONTENT
{{setvar::x::y}}
`,
      'utf-8',
    );

    // metadata.json exists but must be ignored by collectors
    fs.writeFileSync(
      path.join(noMarkerDir, 'metadata.json'),
      `${JSON.stringify({ name: 'should_be_ignored', id: 'ignored' }, null, 2)}\n`,
      'utf-8',
    );

    const collected = collectModuleCBS(noMarkerDir);
    expect(collected.metadata.name).not.toBe('should_be_ignored');
    expect(collected.metadata.id).toBeUndefined();

    fs.rmSync(noMarkerDir, { recursive: true, force: true });
  });
});
