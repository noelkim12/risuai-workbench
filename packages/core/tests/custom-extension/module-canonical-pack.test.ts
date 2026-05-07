import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runPackWorkflow,
  buildModuleFromCanonicalDirectory,
} from '../../src/cli/pack/module/workflow';
import {
  serializeLorebookContent,
  serializeLorebookOrder,
} from '../../src/domain/custom-extension/extensions/lorebook';
import { serializeRegexContent } from '../../src/domain/regex';
import { serializeVariableContent } from '../../src/domain/custom-extension/extensions/variable';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRisumodule(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
    kind: 'risu.module',
    schemaVersion: 1,
    id: 'module-id',
    name: 'workflow-module',
    description: 'canonical pack test',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
    ...partial,
  };
}

describe('module canonical pack workflow', () => {
  it('rebuilds module payload from canonical artifacts plus .risumodule', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          namespace: 'module.namespace',
          lowLevelAccess: true,
          hideIcon: false,
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', 'entry.risulorebook'),
      serializeLorebookContent({
        name: 'Lore Entry',
        comment: 'Reference-only lore metadata',
        mode: 'normal',
        constant: true,
        selective: false,
        insertion_order: 100,
        case_sensitive: false,
        use_regex: false,
        keys: ['alpha', 'beta'],
        secondary_keys: ['gamma'],
        content: 'Lore body',
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', '_order.json'),
      serializeLorebookOrder(['entry.risulorebook']),
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'regex', 'display_filter.risuregex'),
      serializeRegexContent({
        comment: 'display_filter',
        type: 'editdisplay',
        in: 'foo',
        out: 'bar',
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'regex', '_order.json'),
      `${JSON.stringify(['display_filter.risuregex'], null, 2)}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'lua', 'workflow-module.risulua'),
      'function init()\n  return true\nend',
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'variables'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'variables', 'workflow-module.risuvar'),
      serializeVariableContent({
        hp: '100',
        mana: '50',
      }),
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'html'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'html', 'background.risuhtml'),
      '<style>.bg { color: red; }</style>',
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'toggle'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'toggle', 'workflow-module.risutoggle'),
      '<toggle>enabled</toggle>',
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: Record<string, unknown>;
    };

    expect(payload.type).toBe('risuModule');
    expect(payload.module).toMatchObject({
      name: 'workflow-module',
      description: 'canonical pack test',
      id: 'module-id',
      namespace: 'module.namespace',
      lowLevelAccess: true,
      hideIcon: false,
      defaultVariables: {
        hp: '100',
        mana: '50',
      },
      backgroundEmbedding: '<style>.bg { color: red; }</style>',
      customModuleToggle: '<toggle>enabled</toggle>',
    });
    expect(payload.module.trigger).toEqual([
      {
        comment: 'Canonical Lua Trigger',
        type: 'manual',
        conditions: [],
        effect: [
          {
            type: 'triggerlua',
            code: 'function init()\n  return true\nend',
          },
        ],
      },
    ]);
    expect(payload.module.regex).toEqual([
      {
        comment: 'display_filter',
        type: 'editdisplay',
        in: 'foo',
        out: 'bar',
      },
    ]);
    expect(payload.module.lorebook).toEqual([
      {
        key: 'alpha, beta',
        secondkey: 'gamma',
        comment: 'Lore Entry',
        content: 'Lore body',
        mode: 'normal',
        alwaysActive: true,
        selective: false,
        insertorder: 100,
        useRegex: false,
        extentions: {
          risu_case_sensitive: false,
        },
      },
    ]);
  });

  it('accepts .risumodule image metadata without exporting it to upstream module json', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-image-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ image: 'assets/icons/module.png' }), null, 2)}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'assets', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'assets', 'icons', 'module.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: Record<string, unknown>;
    };

    expect(payload.type).toBe('risuModule');
    expect(payload.module.name).toBe('workflow-module');
    expect(payload.module).not.toHaveProperty('image');
    expect(payload.module).not.toHaveProperty('assets');
  });

  it('rejects .risumodule containing customModuleToggle', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-marker-toggle-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({ customModuleToggle: '<toggle>marker</toggle>' }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'toggle'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'toggle', 'workflow-module.risutoggle'),
      '<toggle>file</toggle>',
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/customModuleToggle.*toggle\/\*\.risutoggle/);
  });

  it('fails when only metadata.json exists and .risumodule is missing', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-meta-only-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify({ name: 'legacy-module', id: 'legacy-id' }, null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow('Missing .risumodule');
  });

  it('ignores metadata.json when both .risumodule and metadata.json exist', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-both-files-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'risumodule-name',
          description: 'risumodule-desc',
          id: 'risumodule-id',
          namespace: 'risumodule.ns',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify({
        name: 'metadata-name',
        description: 'metadata-desc',
        id: 'metadata-id',
        namespace: 'metadata.ns',
      }, null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: Record<string, unknown>;
    };

    expect(payload.type).toBe('risuModule');
    expect(payload.module.name).toBe('risumodule-name');
    expect(payload.module.description).toBe('risumodule-desc');
    expect(payload.module.id).toBe('risumodule-id');
    expect(payload.module.namespace).toBe('risumodule.ns');
  });

  it('fails on invalid .risumodule JSON', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-invalid-json-'));
    tempDirs.push(workDir);

    fs.writeFileSync(path.join(workDir, '.risumodule'), '{ broken json', 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow('Invalid .risumodule JSON');
  });

  it('fails on wrong .risumodule kind', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-wrong-kind-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ kind: 'wrong.kind' }), null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/kind.*risu\.module/);
  });

  it('fails on unsupported .risumodule schemaVersion', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-bad-version-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ schemaVersion: 99 }), null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/schemaVersion.*1/);
  });

  // ============================================================================
  // RISULUA CLASSIC REGRESSION TESTS
  // ============================================================================
  // These tests freeze the classic .risulua behavior before modular bundle mode
  // changes are introduced. They verify:
  // 1. Single lua/<moduleName>.risulua file is used per module
  // 2. Lua bytes are injected unchanged into upstream module payload
  // 3. Duplicate .risulua sources throw LuaAdapterError deterministically
  // ============================================================================

  it('risulua classic single file: packs single lua/<moduleName>.risulua unchanged into trigger array', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-classic-single-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'classic-lua-module',
          id: 'classic-lua-id',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });

    // Write classic .risulua with exact content including whitespace, comments, CBS placeholders
    const luaContent = `-- Classic module risulua script
-- Preserves exact bytes including whitespace and {{CBS}} placeholders

function init()
  local moduleName = "{{module}}"
  print("Initializing " .. moduleName)
  
  --[[
    Multi-line comment block
    with {{variable}} placeholders
  --]]
  
  return true
end

function process(input)
  -- Process with tabs and spaces
  local result = input * 2
  return result
end
`;
    // Classic mode uses target-name-based naming: lua/<sanitizedModuleName>.risulua
    fs.writeFileSync(path.join(workDir, 'lua', 'classic-lua-module.risulua'), luaContent, 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: {
        trigger?: Array<{
          comment?: string;
          type?: string;
          effect?: Array<{ type?: string; code?: string }>;
        }>;
      };
    };

    // Verify trigger array structure
    expect(payload.type).toBe('risuModule');
    expect(payload.module.trigger).toBeDefined();
    expect(Array.isArray(payload.module.trigger)).toBe(true);
    expect(payload.module.trigger!.length).toBe(1);

    const trigger = payload.module.trigger![0];
    expect(trigger.comment).toBe('Canonical Lua Trigger');
    expect(trigger.type).toBe('manual');
    expect(trigger.effect).toBeDefined();
    expect(trigger.effect!.length).toBe(1);
    expect(trigger.effect![0].type).toBe('triggerlua');

    // CRITICAL: Verify exact byte-for-byte preservation of Lua content
    expect(trigger.effect![0].code).toBe(luaContent);
  });

  it('risulua classic duplicate: throws LuaAdapterError when multiple .risulua files exist for module', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-classic-duplicate-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'duplicate-lua-module',
          id: 'duplicate-lua-id',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });

    // Write TWO .risulua files - classic mode should reject this deterministically
    fs.writeFileSync(path.join(workDir, 'lua', 'first_script.risulua'), 'function first() end', 'utf-8');
    fs.writeFileSync(path.join(workDir, 'lua', 'second_script.risulua'), 'function second() end', 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    // Should fail with exit code 1
    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);

    // Verify the error is LuaAdapterError with duplicate sources message
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/Duplicate .risulua sources.*multiple files found/);
  });

  it('risulua classic: preserves empty .risulua file content exactly', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-classic-empty-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'empty-lua-module',
          id: 'empty-lua-id',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });

    // Write empty .risulua file
    fs.writeFileSync(path.join(workDir, 'lua', 'empty-lua-module.risulua'), '', 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: {
        trigger?: Array<{
          effect?: Array<{ code?: string }>;
        }>;
      };
    };

    // Verify empty content is preserved exactly
    expect(payload.module.trigger![0].effect![0].code).toBe('');
  });

  it('risulua classic: preserves whitespace-only .risulua file content exactly', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-classic-whitespace-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'whitespace-lua-module',
          id: 'whitespace-lua-id',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });

    // Write whitespace-only .risulua file
    const whitespaceContent = '   \n\t\n  \n';
    fs.writeFileSync(path.join(workDir, 'lua', 'whitespace-lua-module.risulua'), whitespaceContent, 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: {
        trigger?: Array<{
          effect?: Array<{ code?: string }>;
        }>;
      };
    };

    // Verify whitespace content is preserved exactly
    expect(payload.module.trigger![0].effect![0].code).toBe(whitespaceContent);
  });

  it('module pack risulua modular reads dist only', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-modular-dist-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ name: 'modular-lua-module', id: 'modular-lua-id' }), null, 2)}\n`,
      'utf-8',
    );
    fs.mkdirSync(path.join(workDir, 'lua', 'common'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'lua', 'main.risulua'), [
      'local helper = require("common.helper")',
      'function onStart()',
      '  return helper.ready()',
      'end',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(path.join(workDir, 'lua', 'common', 'helper.risulua'), [
      'return {',
      '  ready = function() return "dist-module" end',
      '}',
    ].join('\n'), 'utf-8');
    fs.writeFileSync(path.join(workDir, 'lua', 'unused.risulua'), 'function sourceOnlyShouldNotLeak() end', 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow([
      '--risulua-mode', 'modular',
      '--in', workDir,
      '--out', outPath,
      '--format', 'json',
    ]);

    expect(exitCode).toBe(0);
    const distContent = fs.readFileSync(path.join(workDir, 'dist', 'modular-lua-module.risulua'), 'utf-8');
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      module: { trigger?: Array<{ effect?: Array<{ code?: string }> }> };
    };
    const packedLua = payload.module.trigger![0].effect![0].code;

    expect(packedLua).toBe(distContent);
    expect(packedLua).toContain('local helper = __loader_common_helper()');
    expect(packedLua).toContain('ready = function() return "dist-module" end');
    expect(packedLua).not.toContain('sourceOnlyShouldNotLeak');
  });

  it('module pack risulua modular rejects invalid source', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-risulua-modular-invalid-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ name: 'invalid-modular-module', id: 'invalid-modular-id' }), null, 2)}\n`,
      'utf-8',
    );
    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'lua', 'main.risulua'), [
      'local moduleName = "common.helper"',
      'local helper = require(moduleName)',
      'return helper',
    ].join('\n'), 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow([
      '--risulua-mode', 'modular',
      '--in', workDir,
      '--out', outPath,
      '--format', 'json',
    ]);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir, { risuluaMode: 'modular' })).toThrow(/Dynamic require/);
  });
});
