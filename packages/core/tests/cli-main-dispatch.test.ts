import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cliPath = path.join(process.cwd(), 'dist', 'cli', 'main.js');
const scriptGuardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-cli-guard-'));
const scriptGuardPath = path.join(scriptGuardDir, 'deny-legacy-scripts.cjs');

fs.writeFileSync(
  scriptGuardPath,
  `
const cp = require('node:child_process');
const Module = require('node:module');
const originalSpawnSync = cp.spawnSync;
const originalExecSync = cp.execSync;
const originalLoad = Module._load;

function hasLegacyScriptPath(command, args) {
  const joined = [String(command || ''), ...(args || []).map((x) => String(x))].join(' ');
  return /(?:^|[\\/])scripts[\\/].+\\.js/.test(joined);
}

function hasLegacyScriptRequest(request) {
  return /(?:^|[\\/])scripts[\\/].+\\.js(?:$|[?#])/.test(String(request || ''));
}

cp.spawnSync = function patchedSpawnSync(command, args, options) {
  if (hasLegacyScriptPath(command, args)) {
    throw new Error('legacy-script-execution-blocked');
  }
  return originalSpawnSync.call(cp, command, args, options);
};

cp.execSync = function patchedExecSync(command, options) {
  if (String(command || '').match(/(?:^|[\\/])scripts[\\/].+\\.js/)) {
    throw new Error('legacy-script-execution-blocked');
  }
  return originalExecSync.call(cp, command, options);
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (hasLegacyScriptRequest(request)) {
    throw new Error('legacy-script-module-load-blocked');
  }
  return originalLoad.call(this, request, parent, isMain);
};
`,
  'utf-8',
);

function runCli(args: readonly string[]) {
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const nodeOptions = [existingNodeOptions, `--require=${scriptGuardPath}`]
    .filter((value) => value.length > 0)
    .join(' ');

  return spawnSync('node', [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  });
}

describe('src/cli main dispatcher integration', () => {
  it('shows top-level help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('risu-core CLI');
    expect(result.stdout).toContain('Run \'risu-core <command> --help\'');
  });

  it('returns exit code 1 for an unknown command', () => {
    const result = runCli(['not-a-command']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });

  it('dispatches extract to TypeScript command path', () => {
    const result = runCli(['extract', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Extractor');
    expect(result.stdout).toContain('node extract.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('writes character extract output into character_<name> by default', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-extract-character-'));
    const cardPath = path.join(tempDir, 'sample-character.json');

    fs.writeFileSync(
      cardPath,
      `${JSON.stringify(
        {
          spec: 'chara_card_v3',
          data: {
            name: 'Default Output Character',
            description: 'hello',
            character_book: { entries: [] },
            extensions: { risuai: { customScripts: [] } },
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const result = spawnSync('node', [cliPath, 'extract', cardPath], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require=${scriptGuardPath}`.trim(),
      },
    });

    const expectedOutDir = path.join(tempDir, 'character_Default_Output_Character');
    expect(result.status).toBe(0);
    // In canonical mode, charx.json should NOT exist (only canonical artifacts)
    expect(fs.existsSync(path.join(expectedOutDir, 'charx.json'))).toBe(false);
    expect(fs.existsSync(path.join(expectedOutDir, 'character', 'metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'charx.json'))).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('dispatches pack to TypeScript command path', () => {
    const result = runCli(['pack', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Packer');
    expect(result.stdout).toContain('node pack.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('dispatches pack --format module to module packer', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-pack-module-'));

    // Create minimal canonical module workspace
    fs.mkdirSync(path.join(tempDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'metadata.json'),
      `${JSON.stringify({ name: 'Module Pack Test', id: 'test-module' }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', '_order.json'),
      '[]\n',
      'utf-8',
    );

    const result = runCli(['pack', '--format', 'module', '--in', tempDir]);

    if (result.status !== 0) {
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Module Packer');
    expect(fs.existsSync(path.join(tempDir, 'Module_Pack_Test_repack.json'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('dispatches analyze to unified analyze router', () => {
    const analyze = runCli(['analyze', '--help']);
    expect(analyze.status).toBe(0);
    expect(analyze.stdout).toContain('risu-core analyze');
    expect(analyze.stdout).toContain('module');
    expect(analyze.stdout).toContain('preset');
    expect(analyze.stdout).toContain('compose');
    expect(analyze.stderr).not.toContain('legacy-script-execution-blocked');
  });

  it('dispatches analyze --type lua', () => {
    const result = runCli(['analyze', '--type', 'lua', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: node analyze.js');
  });

  it('dispatches analyze --type charx', () => {
    const result = runCli(['analyze', '--type', 'charx', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Character Card Analyzer');
  });

  it('dispatches analyze --type module', () => {
    const result = runCli(['analyze', '--type', 'module', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Module Analyzer');
  });

  it('dispatches analyze --type preset', () => {
    const result = runCli(['analyze', '--type', 'preset', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Preset Analyzer');
  });

  it('dispatches analyze --type compose', () => {
    const result = runCli(['analyze', '--type', 'compose', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Composition Analyzer');
  });

  it('runs compose analysis and writes compose-analysis reports', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-compose-'));
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

    const result = runCli(['analyze', '--type', 'compose', charxDir, '--module', moduleDir]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(charxDir, 'analysis', 'compose-analysis.data.js'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('auto-detects module analysis from a canonical workspace', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-module-'));
    fs.mkdirSync(path.join(tempDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), '{"name":"Module Stub"}\n', 'utf-8');

    const result = runCli(['analyze', tempDir]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'module-analysis.data.js'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('auto-detects preset analysis from a canonical workspace', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-preset-'));
    fs.mkdirSync(path.join(tempDir, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), '{"name":"Preset Stub"}\n', 'utf-8');

    const result = runCli(['analyze', tempDir]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.data.js'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('auto-detects preset analysis from prompt-template-only workspace', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-preset-pt-only-'));
    // Create prompt-template-only preset (no prompts/ directory)
    fs.mkdirSync(path.join(tempDir, 'prompt_template'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), '{"name":"PromptTemplate Only Preset"}\n', 'utf-8');
    fs.writeFileSync(
      path.join(tempDir, 'prompt_template', '_order.json'),
      '["system.risuprompt"]\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'prompt_template', 'system.risuprompt'),
      '---\nname: system\ntype: plain\ntype2: normal\nrole: system\n---\n@@@ TEXT\n{{setvar::test::value}}\n',
      'utf-8',
    );

    const result = runCli(['analyze', tempDir]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.data.js'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps deprecated --card working for lua analyze and emits a warning', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-card-'));
    const luaPath = path.join(tempDir, 'sample.lua');
    const charxPath = path.join(tempDir, 'charx.json');

    fs.writeFileSync(luaPath, 'local value = getState(chat, "foo")\n', 'utf-8');
    fs.writeFileSync(
      charxPath,
      `${JSON.stringify(
        {
          spec: 'chara_card_v3',
          data: {
            name: 'Test Character',
            character_book: { entries: [] },
            extensions: { risuai: { customScripts: [] } },
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const result = runCli([
      'analyze',
      '--type',
      'lua',
      luaPath,
      '--card',
      charxPath,
      '--json',
      '--no-markdown',
      '--no-html',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('--card is deprecated; use --charx instead.');
    expect(fs.existsSync(path.join(tempDir, 'sample.analysis.json'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('auto-detects canonical .risulua input as lua analyze target', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-risulua-'));
    const luaPath = path.join(tempDir, 'sample.risulua');

    fs.writeFileSync(luaPath, 'local value = getState(chat, "foo")\n', 'utf-8');

    const result = runCli(['analyze', luaPath, '--json', '--no-markdown', '--no-html']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'sample.analysis.json'))).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes charx-analysis filenames for charx reports', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-charx-'));
    const charxPath = path.join(tempDir, 'charx.json');

    fs.writeFileSync(
      charxPath,
      `${JSON.stringify(
        {
          spec: 'chara_card_v3',
          data: {
            name: 'Report Character',
            character_book: { entries: [] },
            extensions: { risuai: { customScripts: [] } },
          },
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const result = runCli(['analyze', '--type', 'charx', tempDir, '--locale', 'en']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.html'))).toBe(true);
    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'charx-analysis.md'), 'utf-8');
    const html = fs.readFileSync(path.join(tempDir, 'analysis', 'charx-analysis.html'), 'utf-8');
    expect(markdown).not.toContain('## Token Budget');
    expect(markdown).toContain('## Variable Flow');
    expect(markdown).toContain('## Dead Code Findings');
    expect(html).not.toContain('Token Budget');
    expect(html).toContain('Variable Flow');
    expect(html).toContain('Dead Code');
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'card-analysis.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'card-analysis.html'))).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects directories without canonical markers or charx.json', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-no-markers-'));

    // Create an empty directory without any markers
    const result = runCli(['analyze', '--type', 'charx', tempDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Canonical charx workspace markers not found');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns exit code 1 for unknown analyze type', () => {
    const result = runCli(['analyze', '--type', 'unknown']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown analyze type');
    expect(result.stderr).toContain('module');
    expect(result.stderr).toContain('preset');
    expect(result.stderr).toContain('compose');
  });

  it('analyzes canonical charx workspace without charx.json using .risulorebook files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-core-analyze-charx-canonical-'));

    // Create canonical charx workspace WITHOUT charx.json
    fs.mkdirSync(path.join(tempDir, 'character'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'regex'), { recursive: true });

    // Create character metadata
    fs.writeFileSync(
      path.join(tempDir, 'character', 'metadata.json'),
      '{"name":"CanonicalChar"}\n',
      'utf-8',
    );

    // Create canonical .risulorebook files
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'entry1.risulorebook'),
      `---
name: entry1
comment: First entry
mode: normal
constant: false
selective: false
insertion_order: 0
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
key2
@@@ CONTENT
{{setvar::var1::value1}}
`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'lorebooks', 'entry2.risulorebook'),
      `---
name: entry2
comment: Second entry
mode: normal
constant: false
selective: false
insertion_order: 1
case_sensitive: false
use_regex: false
---
@@@ KEYS
key3
@@@ CONTENT
{{getvar::var1}}
`,
      'utf-8',
    );

    // Create canonical .risuregex files
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'script1.risuregex'),
      `---
comment: Script one
type: editdisplay
---
@@@ IN
*test*
@@@ OUT
{{setvar::var2::value2}}
`,
      'utf-8',
    );

    const result = runCli(['analyze', '--type', 'charx', tempDir, '--locale', 'en']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'charx-analysis.html'))).toBe(true);

    // Verify CBS data from canonical files is present in the analysis
    const markdown = fs.readFileSync(path.join(tempDir, 'analysis', 'charx-analysis.md'), 'utf-8');
    expect(markdown).toContain('## Lorebook Structure');
    expect(markdown).toContain('## Lorebook Activation Chain');
    // CBS data should be detected from canonical files
    expect(markdown).toContain('var1');
    expect(markdown).toContain('var2');
    expect(markdown).toContain('lorebook');
    expect(markdown).toContain('regex');

    // Verify charx.json was NOT created (canonical mode)
    expect(fs.existsSync(path.join(tempDir, 'charx.json'))).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('dispatches build to TypeScript command path', () => {
    const result = runCli(['build', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RisuAI Component Builder');
    expect(result.stdout).toContain('node build-components.js');
    expect(result.stderr).not.toContain('legacy-script-execution-blocked');
  });
});
